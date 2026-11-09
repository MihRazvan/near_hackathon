import {privateKeyToAccount} from 'viem/accounts';
import {keccak256} from 'viem';
import {KeyPair,KeyPairSigner} from 'near-api-js';
import {readPrivateFile} from './config.mjs';
import {nep413Digest} from './auth.mjs';
import {assert,walletId} from './core.mjs';
import {validateIntentPlan} from './intents.mjs';

// Loopback development only: explicit, reviewed plans signed by the already-funded test identities.
// Customer wallet extensions remain a separate path. No key or arbitrary-message signing API is exposed.
export class FundedWallets {
 #identities=new Map();
 constructor({config,store,reads,near,client,chain,walletRequests,funding}){Object.assign(this,{config,store,reads,near,client,chain,walletRequests,funding});}
 get enabled(){return this.config.network==='mainnet'&&this.config.enabled&&this.config.allowFundedWallets===true;}
 async load(){
  if(!this.enabled)return this;
  for(const [label,key]of [['Buyer A',this.config.keys.buyerA],['Buyer B',this.config.keys.buyerB]])if(key){const account=privateKeyToAccount(key);this.#identities.set(account.address.toLowerCase(),{label,account});}
  for(const [label,keyLabel]of [['Space owner','placement-owner'],['NFT controller','placement-transferee'],['Campaign arbiter','arbiter']]){
   let value;try{value=JSON.parse(await readPrivateFile(this.chain.vault.path(keyLabel)));}catch(error){if(error.code==='ENOENT')continue;throw error;}
   const key=KeyPair.fromString(value.privateKey),publicKey=key.getPublicKey();
   assert(publicKey.toString()===value.publicKey&&Buffer.from(publicKey.data).toString('hex')===value.accountId,'IDENTITY_CHANGED','Funded development identity does not match its recovery record');
   this.#identities.set(value.accountId,{label,key,signer:new KeyPairSigner(key)});
  }
  return this;
 }
 list(){return this.enabled?[...this.#identities].map(([address,{label,account}])=>({address,label,kind:account?'evm':'near'})):[];}
 identity(actor){assert(this.enabled,'DEVELOPMENT_WALLETS_DISABLED','Funded development wallet signing is disabled',403);const w=this.#identities.get(walletId(actor));assert(w,'UNKNOWN_DEVELOPMENT_WALLET','This wallet is not a configured funded development identity',403);return w;}
 async signIn({wallet,challengeId}){
  const actor=walletId(wallet),w=this.identity(actor),c=this.store.db.prepare('SELECT * FROM challenges WHERE id=?').get(challengeId);
  assert(c?.wallet===actor&&c.origin===this.config.origin&&!c.consumed&&c.expires_ms>Date.now(),'EXPIRED_CHALLENGE','A fresh local sign-in challenge is required',401);
  if(w.account)return {challengeId,signature:await w.account.signMessage({message:c.message})};
  const signed=w.key.sign(nep413Digest({message:c.message,nonce:c.nonce,recipient:new URL(this.config.origin).host}));
  return {challengeId,accountId:actor,publicKey:w.key.getPublicKey().toString(),signature:Buffer.from(signed.signature).toString('base64')};
 }
 async signIntent(actor,{requestId,planId}){
  const w=this.identity(actor),r=this.walletRequests.owned(actor,requestId),record=this.store.get('intent',planId);
  assert(w.account&&r.kind==='intent'&&r.planId===planId&&r.status==='requested'&&r.dispatched===true&&record?.owner===actor,'INVALID_REQUEST','Review and dispatch the original payer’s Intents request first');
  validateIntentPlan(record.plan);return {signature:await w.account.signMessage({message:record.plan.message})};
 }
 async sendNative(actor,{requestId}){
  const w=this.identity(actor),r=this.walletRequests.owned(actor,requestId);assert(w.signer&&['native','publication'].includes(r.kind)&&r.dispatched===true&&['requested','submitted'].includes(r.status),'INVALID_REQUEST','A dispatched native wallet request is required');
  const record=this.store.get(r.kind==='native'?'native-plan':'publication-plan',r.planId),p=record?.plan,t=p?.transaction;
  assert(record?.owner===actor&&t?.signerId===actor&&t.actions.length===1&&t.actions[0].type==='FunctionCall','INVALID_REQUEST','Only the stored, owner-bound function call can be signed');
  const a=t.actions[0].params,id='funded-near-'+r.id;
  const operation=await this.near.execute({id,signer:w.signer,plan:{network:'mainnet',signerId:actor,receiverId:t.receiverId,expectedReceiverCodeHash:p.factoryCodeHash??p.codeHash,
   actions:[{type:'call',method:a.methodName,args:a.args,gas:a.gas,deposit:a.deposit}]}});
  const current=this.walletRequests.owned(actor,r.id);
  if(operation.transaction_hash&&!current.transactionHash)this.store.update('wallet-request',r.id,actor,current.version,{...current,status:'submitted',transactionHash:operation.transaction_hash});
  return {transactionHash:operation.transaction_hash,phase:operation.phase};
 }
 async sendBase(actor,{operationId}){
  const w=this.identity(actor),op=this.funding.owned(actor,operationId);assert(w.account,'EVM_WALLET_REQUIRED','An EVM funding identity is required');
  if(op.transaction_hash)return {transactionHash:op.transaction_hash,phase:op.phase};
  assert(op.phase==='wallet-pending','INVALID_REQUEST','Dispatch this exact Base wallet funding request first');
  assert(Date.parse(op.plan.expiresAt)>Date.now(),'EXPIRED_QUOTE','Funding quote expired before signing');
  assert(await this.client.getChainId()===8453,'WRONG_NETWORK','Base mainnet is required');
  const nonce=await this.client.getTransactionCount({address:actor,blockTag:'pending'});assert(nonce===op.result.walletNonce,'NONCE_CHANGED','The original wallet nonce changed; reconcile before proceeding');
  this.store.transition(op.id,['wallet-pending'],'wallet-signing');
  const t=op.result.walletTransaction,signed=await w.account.signTransaction({type:'eip1559',chainId:8453,to:t.to,data:t.data,value:BigInt(t.value),nonce:Number(BigInt(t.nonce)),gas:BigInt(t.gas),maxFeePerGas:BigInt(t.maxFeePerGas),maxPriorityFeePerGas:BigInt(t.maxPriorityFeePerGas)});
  const hash=keccak256(signed);this.store.transition(op.id,['wallet-signing'],'signed',{transactionHash:hash,result:{...op.result,signedTransaction:signed}});
  try{const actual=await this.client.sendRawTransaction({serializedTransaction:signed});assert(actual===hash,'TRANSACTION_CHANGED','Base provider returned a different transaction');this.store.transition(op.id,['signed'],'broadcast');}
  catch{this.store.transition(op.id,['signed'],'broadcast-unknown');}
  return {transactionHash:hash,phase:this.store.operation(op.id).phase};
 }
}
