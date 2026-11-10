import { hubIntentPlan } from './hub-actions.mjs';
import { hubSnapshot, offerArgs, receiver, isOfferId, qualifyHub, hubPriceAtRound } from './hub.mjs';
import { KeyPairSigner, baseEncode } from 'near-api-js';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { KeyVault } from './vault.mjs';
import { assert, hashObject, sha256, walletId, uint } from './core.mjs';
import { purchasePlan, nominationPlan, withdrawalPlan, signedErc191, validateIntentPlan, intentPlan } from './intents.mjs';
import { validateRoutePlan } from './oneclick.mjs';

export class ChainService {
  constructor(runtime){Object.assign(this,{now:Date.now},runtime);this.vault=new KeyVault(join(this.config.stateDir,'keys'));}
  treasurySigner(){return KeyPairSigner.fromSecretKey(this.config.keys.near);}
  async call({id,signerId,signer,receiverId,method,args={},gas='25000000000000',deposit='0',codeHash}){
    return this.near.execute({id,signer,plan:{network:this.config.network,signerId,receiverId,...(signerId===this.config.treasury&&uint(deposit)>0n?{allocationAccount:receiverId}:{}),expectedReceiverCodeHash:codeHash,
      actions:[{type:'call',method,args,gas,deposit}]}});
  }
  async fundIdentity(label,amount){
    const identity=await this.vault.identity(label),id='identity-fund-'+label,prior=this.store.operation(id);
    if(prior)return {identity,operation:await this.near.reconcile(id)};
    let exists=false;try{await this.reads.account(identity.accountId);exists=true;}catch(e){if(e.code!=='UNKNOWN_ACCOUNT')throw e;}
    assert(!exists,'ACCOUNT_EXISTS','Generated identity already exists; reconcile its funding instead of topping up');
    const operation=await this.near.execute({id,signer:await this.treasurySigner(),plan:{network:this.config.network,signerId:this.config.treasury,receiverId:identity.accountId,allocationAccount:identity.accountId,actions:[{type:'transfer',amount}]}});
    return {identity,operation};
  }
  async deploy({label,initialPriceCents,terms,sellerId,arbiterId}){
    const identity=await this.vault.identity(label),id='deploy-'+label,prior=this.store.operation(id);
    if(prior){const operation=await this.near.reconcile(id);if(operation.phase==='confirmed')this.registerDeployment(identity,label,operation);return {identity,operation};}
    const artifact=await readFile(this.config.artifact),manifest=JSON.parse(await readFile(join(dirname(this.config.artifact),'campaign-manifest.json'),'utf8'));
    assert(artifact.length===manifest.bytes&&sha256(artifact)===manifest.sha256,'ARTIFACT_CHANGED','Compiled campaign artifact differs from its manifest');
    const args={seller_id:sellerId,arbiter_id:arbiterId,ft_contract_id:this.config.assets.nearUsdc,intents_contract_id:this.config.assets.intentsId,settlement:'intents',initial_price_cents:initialPriceCents,terms};
    const plan={network:this.config.network,signerId:identity.accountId,receiverId:identity.accountId,
      actions:[{type:'deploy',code:artifact.toString('base64'),sha256:manifest.sha256},{type:'call',method:'new_campaign',args,gas:'20000000000000',deposit:'0'}]};
    const operation=await this.near.execute({id,signer:identity.signer,plan});
    if(operation.phase==='confirmed')this.registerDeployment(identity,label,operation);
    return {identity,operation};
  }
  registerDeployment(identity,label,operation){
    const action=operation.plan.actions.find(a=>a.type==='call'&&a.method==='new_campaign'),args=action.args;
    const codeHash=baseEncode(Buffer.from(operation.plan.actions.find(a=>a.type==='deploy').sha256,'hex'));
    const existing=this.store.get('deployment',identity.accountId);
    if(existing){assert(existing.codeHash===codeHash&&hashObject(existing.terms)===hashObject(args.terms),'DEPLOYMENT_CHANGED','Deployment record changed');return existing;}
    return this.store.insert('deployment',identity.accountId,args.seller_id,{label,codeHash,terms:args.terms,initialPriceCents:args.initial_price_cents,arbiterId:args.arbiter_id});
  }
  async attachDeployment({contractId,sellerId,arbiterId,terms,initialPriceCents}){
    if(isOfferId(contractId))return this.attachHubDeployment({contractId,sellerId,arbiterId,terms,initialPriceCents});
    const existing=this.store.get('deployment',contractId);if(existing)return existing;
    const manifest=JSON.parse(await readFile(join(dirname(this.config.artifact),'campaign-manifest.json'),'utf8'));
    const codeHash=baseEncode(Buffer.from(manifest.sha256,'hex'));
    const snapshot=await this.reads.snapshot(contractId,{expectedCodeHash:codeHash,expectedIntentsCodeHash:this.config.assets.intentsCodeHash,expectedAssets:this.config.assets});
    assert(snapshot.state.seller_id===walletId(sellerId)&&snapshot.state.arbiter_id===walletId(arbiterId)&&snapshot.state.round==='0'
      &&snapshot.state.next_price===(uint(initialPriceCents)*10000n).toString()&&snapshot.state.outcome==='open'&&hashObject(snapshot.campaign.terms)===hashObject(terms),'DEPLOYMENT_MISMATCH','External deployment differs from the owner offer');
    return this.store.insert('deployment',contractId,walletId(sellerId),{label:'external-wallet-deployment',codeHash,terms,initialPriceCents,arbiterId});
  }
  async attachHubDeployment({contractId,sellerId,arbiterId,terms,initialPriceCents}){
    const hub=this.config.hub;assert(hub,'HUB_UNAVAILABLE','Qualified marketplace is not configured',503);
    const existing=this.store.get('deployment',contractId);if(existing)return existing;
    const record={id:contractId,mode:'hub',hubId:hub.accountId,offerId:contractId,codeHash:hub.codeHash};
    const snapshot=await hubSnapshot(this.reads,this.config,record);
    assert(snapshot.state.seller_id===walletId(sellerId)&&snapshot.state.arbiter_id===walletId(arbiterId)
      &&snapshot.state.next_price===hubPriceAtRound(initialPriceCents,snapshot.state.round)&&hashObject(snapshot.campaign.terms)===hashObject(terms),'DEPLOYMENT_MISMATCH','Marketplace offer differs from its published rules');
    return this.store.insert('deployment',contractId,walletId(sellerId),{mode:'hub',hubId:hub.accountId,offerId:contractId,codeHash:hub.codeHash,terms,initialPriceCents,arbiterId});
  }
  async snapshot(contractId,wallets=[]){
    const deployment=this.store.get('deployment',contractId);assert(deployment,'UNREGISTERED_DEPLOYMENT','Campaign deployment is not registered',404);
    const snapshot=deployment.mode==='hub'?await hubSnapshot(this.reads,this.config,deployment,wallets):await this.reads.snapshot(contractId,{expectedCodeHash:deployment.codeHash,expectedIntentsCodeHash:this.config.assets.intentsCodeHash,expectedAssets:this.config.assets,wallets});
    assert(hashObject(snapshot.campaign.terms)===hashObject(deployment.terms),'TERMS_CHANGED','Published campaign differs from its deployment record');
    assert(snapshot.state.seller_id===deployment.owner&&snapshot.state.arbiter_id===deployment.arbiterId,'PARTIES_CHANGED','Campaign parties changed');return snapshot;
  }
  async preparePurchase({buyerId,contractId,invoiceId}){
    const payer=walletId(buyerId),snapshot=await this.snapshot(contractId,[payer]);
    assert(!(await this.reads.view(receiver(snapshot),'is_invoice_used',offerArgs(snapshot,{invoice_id:invoiceId}))),'INVOICE_USED','Choose a fresh invoice for this booking');
    const balance=await this.reads.view(this.config.assets.intentsId,'mt_balance_of',{account_id:payer,token_id:this.config.assets.nearAsset});
    // The pinned transfer intent moves exact principal. Pip fees apply to swap netting, not ordinary transfers.
    assert(uint(balance)>=uint(snapshot.state.next_price),'INSUFFICIENT_INTENTS','Top up the original wallet Intents balance before purchase');
    const plan=purchasePlan({snapshot,buyerId:payer,invoiceId,asset:this.config.assets.nearAsset,now:this.now()});
    this.store.insert('intent',plan.planId,payer,{plan,status:'prepared'});return plan;
  }
  async prepareAction(wallet,input){
    const actor=walletId(wallet),snapshot=await this.snapshot(input.contractId);
    const plan=await hubIntentPlan({store:this.store,reads:this.reads,snapshot,wallet:actor,input,now:this.now()});
    this.store.insert('intent',plan.planId,actor,{plan,status:'prepared'});return plan;
  }
  async prepareNomination({buyerId,contractId,recipientId}){
    const plan=nominationPlan({snapshot:await this.snapshot(contractId),buyerId,recipientId,now:this.now()});
    this.store.insert('intent',plan.planId,plan.signerId,{plan,status:'prepared'});return plan;
  }
  async prepareExit({buyerId,routeId}){
    const stored=this.store.get('route',routeId),route=stored?.plan;
    assert(stored?.owner===walletId(buyerId),'WRONG_WALLET','Return route must belong to the original wallet',403);
    validateRoutePlan(route,{maxInput:route.request.amount,minOutput:route.response.quote.minAmountOut});
    assert(route.direction==='exit'&&route.wallet===walletId(buyerId),'WRONG_WALLET','Return route must belong to the original wallet');
    const balance=await this.reads.view(this.config.assets.intentsId,'mt_balance_of',{account_id:route.wallet,token_id:this.config.assets.nearAsset});
    assert(uint(balance)>=uint(route.request.amount),'INSUFFICIENT_INTENTS','Return amount exceeds the wallet balance');
    const plan=intentPlan({signerId:buyerId,verifier:this.config.assets.intentsId,intents:[{intent:'transfer',receiver_id:route.response.quote.depositAddress,tokens:{[this.config.assets.nearAsset]:route.request.amount}}],
      context:{kind:'exit',routePlanId:route.planId}});
    this.store.insert('intent',plan.planId,plan.signerId,{plan,status:'prepared'});return plan;
  }
  async prepareWithdrawal({buyerId,recipientId,amount}){
    const payer=walletId(buyerId),recipient=walletId(recipientId);
    assert(payer.startsWith('0x')&&!recipient.startsWith('0x'),'INVALID_WALLETS','Use an EVM Intents signer and a native NEAR recipient');
    await this.reads.account(recipient);
    const registration=await this.reads.view(this.config.assets.nearUsdc,'storage_balance_of',{account_id:recipient});
    assert(registration,'STORAGE_REQUIRED','Native USDC recipient must register token storage first');
    const balance=await this.reads.view(this.config.assets.intentsId,'mt_balance_of',{account_id:payer,token_id:this.config.assets.nearAsset});
    assert(uint(balance)>=uint(amount),'INSUFFICIENT_INTENTS','Native withdrawal exceeds the original wallet balance');
    const before=await this.reads.view(this.config.assets.nearUsdc,'ft_balance_of',{account_id:recipient});
    const plan=withdrawalPlan({signerId:payer,verifier:this.config.assets.intentsId,token:this.config.assets.nearUsdc,recipientId:recipient,amount,now:this.now()});
    this.store.insert('intent',plan.planId,payer,{plan,status:'prepared',recipientBalanceBefore:before});return plan;
  }
  async relay({buyerId,planId,signature}){
    const original=this.store.get('intent',planId);assert(original?.owner===walletId(buyerId),'WRONG_WALLET','Intent belongs to another wallet',403);
    const prior=this.store.operation('relay-'+planId);
    if(prior){const record=this.store.get('intent',planId);assert(record?.owner===walletId(buyerId),'WRONG_WALLET','Intent belongs to another wallet',403);
      return this.updateIntentOutcome(planId,await this.near.reconcile(prior.id));}
    this.store.transaction(()=>{assert(!this.store.get('intent-dispatch',planId),'INTENT_BUSY','The original signature is being reconciled');
      this.store.insert('intent-dispatch',planId,walletId(buyerId),{startedAt:Date.now(),pid:process.pid});});
    try{return await this.relayUnlocked({buyerId,planId,signature});}
    finally{this.store.db.prepare('DELETE FROM objects WHERE kind=? AND id=?').run('intent-dispatch',planId);}
  }
  async relayUnlocked({buyerId,planId,signature}){
    const payer=walletId(buyerId),record=this.store.get('intent',planId);assert(record?.owner===payer,'WRONG_WALLET','Intent belongs to another wallet',403);
    const id='relay-'+planId,prior=this.store.operation(id);if(prior)return this.updateIntentOutcome(planId,await this.near.reconcile(id));
    assert(this.config.enabled,'MAINNET_DISABLED','Live integration execution is disabled');
    const plan=validateIntentPlan(record.plan,{now:this.now()});
    if(plan.context.kind==='purchase'){
      const current=await this.snapshot(plan.context.contractId,[payer]);
      assert(current.state.round===plan.context.expectedRound&&current.state.next_price===plan.context.amount,'PRICE_CHANGED','Campaign price changed; sign a fresh purchase');
      assert(current.campaign.terms.published_terms_sha256===plan.context.publishedTermsHash,'TERMS_CHANGED','Campaign rules changed');
    }
    if(plan.context.kind==='hub-action'){const current=await this.snapshot(plan.context.contractId);assert(current.receiverId===plan.context.receiverId&&current.offerId===plan.context.offerId&&current.codeHash===plan.context.codeHash,'HUB_CHANGED','Marketplace offer routing changed');}
    if(plan.context.kind==='publish'){const block=await this.reads.block();await qualifyHub(this.reads,this.config,block);assert(this.config.hub.accountId===plan.context.receiverId&&this.config.hub.codeHash===plan.context.codeHash,'HUB_CHANGED','Publication marketplace changed');}
    const signed=await signedErc191(plan,signature,{now:this.now()});
    const operation=await this.call({id,signerId:this.config.treasury,signer:await this.treasurySigner(),receiverId:this.config.assets.intentsId,
      codeHash:this.config.assets.intentsCodeHash,method:'execute_intents',args:{signed:[signed]},gas:'60000000000000'});
    return this.updateIntentOutcome(planId,operation);
  }
  updateIntentOutcome(planId,operation){
    const record=this.store.get('intent',planId),plan=record.plan;let status=operation.phase;
    if(status==='confirmed'&&plan.context.kind==='purchase')status=this.purchaseAccepted(plan,operation)?'accepted':'rejected';
    if(status==='confirmed'&&plan.context.kind==='withdraw')status=this.withdrawalReceived(plan,operation)?'settled':'rejected';
    if(record.status!==status||record.operationId!==operation.id)this.store.update('intent',planId,record.owner,record.version,{...record,status,operationId:operation.id});
    return operation;
  }
  withdrawalReceived(plan,operation){
    return operation.phase==='confirmed'&&operation.result.outcome.receipts_outcome.some(receipt=>receipt.outcome.executor_id===plan.context.token&&receipt.outcome.logs?.some(log=>{
      if(!log.startsWith('EVENT_JSON:'))return false;let event;try{event=JSON.parse(log.slice(11));}catch{return false;}
      return event.standard==='nep141'&&event.event==='ft_transfer'&&event.data?.some(data=>data.old_owner_id===plan.verifier&&data.new_owner_id===plan.context.recipientId&&data.amount===plan.context.amount);
    }));
  }
  purchaseAccepted(plan,operation){
    if(operation.phase!=='confirmed')return false;
    return operation.result.outcome.receipts_outcome.some(receipt=>receipt.outcome.executor_id===(plan.context.receiverId??plan.context.contractId)&&receipt.outcome.logs?.some(log=>{
      if(!log.startsWith('EVENT_JSON:'))return false;
      let event;try{event=JSON.parse(log.slice(11));}catch{return false;}
      return event.standard==='pitboard'&&event.version==='1.0.0'&&event.event==='purchase_accepted'&&event.data?.some(data=>
        (!plan.context.offerId||data.offer_id===plan.context.offerId)&&data.invoice_id===plan.context.invoiceId&&data.buyer_id===plan.signerId&&data.amount===plan.context.amount&&data.round===(uint(plan.context.expectedRound)+1n).toString());
    }));
  }
  async release({contractId,creditorId,id}){
    const snapshot=await this.snapshot(contractId,[creditorId]);assert(uint(snapshot.credits[creditorId].available)>0n,'NO_CREDIT','Original creditor has no available claim');
    const op=await this.call({id,signerId:this.config.treasury,signer:await this.treasurySigner(),receiverId:receiver(snapshot),codeHash:snapshot.codeHash,
      method:'release_credit',args:offerArgs(snapshot,{account_id:creditorId}),gas:snapshot.offerId?'100000000000000':'60000000000000'});
    return op;
  }
  async claimForWallet({contractId,creditorId}){
    const payer=walletId(creditorId),snapshot=await this.snapshot(contractId,[payer]),credit=snapshot.credits[payer];
    if(credit.available==='0')return {phase:'no-available-credit',credit};
    const root='wallet-claim-'+hashObject({contractId,payer,round:snapshot.state.round,outcome:snapshot.state.outcome,amount:credit.available});
    let id=root;
    for(let attempt=0;attempt<20;attempt++){
      const prior=this.store.operation(id);
      if(!prior){const op=await this.release({contractId,creditorId:payer,id});return {id:op.id,phase:op.phase,transactionHash:op.transaction_hash};}
      const op=await this.near.reconcile(id);
      if(op.phase!=='failed')return {id:op.id,phase:op.phase,transactionHash:op.transaction_hash};
      assert(op.transaction_hash&&op.result?.outcome?.final_execution_status==='FINAL','RECONCILIATION_REQUIRED','The original payout needs final failure evidence before another attempt');
      // The qualified snapshot above proves available credit and zero pending withdrawals.
      // A retry gets one deterministic successor; an unknown outcome never creates one.
      id=root+'-'+hashObject({failedTransaction:op.transaction_hash}).slice(0,16);
    }
    assert(false,'RECONCILIATION_REQUIRED','Inspect repeated finalized payout failures before retrying');
  }
}
