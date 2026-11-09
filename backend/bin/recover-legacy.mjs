#!/usr/bin/env node
// Explicit recovery of the earlier local qualification record. Never accepts keys on the command line.
import { KeyPairSigner, baseEncode } from 'near-api-js';
import { runtime, qualifyNetwork } from '../src/runtime.mjs';
import { readPrivateFile } from '../src/config.mjs';
import { NearExecutor } from '../src/near-executor.mjs';
import { successfulAccountClosure } from '../src/rpc.mjs';
import { assert, hashObject, uint, AppError } from '../src/core.mjs';

async function recover(action='inspect'){
 const r=await runtime();
 try{
  assert(['inspect','refund','close'].includes(action),'INVALID_COMMAND','Use inspect, refund or close');
  const identity=JSON.parse(await readPrivateFile('.local/mainnet-qualification/identities.json'));
  const parent=identity.parentId,a=r.config.assets,signer=KeyPairSigner.fromSecretKey(identity.devPrivateKey),publicKey=await signer.getPublicKey();
  assert(publicKey.toString()===identity.devPublicKey,'KEY_CHANGED','Legacy recovery key does not match its public record');
  // Derive the deployed implicit account from its recovery key rather than a legacy planning label.
  const account=Buffer.from(publicKey.data).toString('hex'),id='legacy-'+hashObject({account});
  const codeHash=baseEncode(Buffer.from('1422e57656708a95416a75eb0f7132f7715b5937be45e4cb0060e2218d86ed77','hex'));
  const executor=new NearExecutor({store:r.store,budget:r.budget,reads:r.reads,config:{...r.config,treasury:parent}});
  async function state(){
   const accountState=await r.reads.account(account);assert(accountState.code_hash===codeHash,'CODE_CHANGED','Legacy proof code changed');
   const s=await r.reads.view(account,'get_state');
   assert(s.seller_id===parent&&s.arbiter_id===account&&s.ft_contract_id===a.nearUsdc&&s.intents_contract_id===a.intentsId&&s.intents_token_id===a.nearAsset
     &&s.settlement==='intents'&&!s.nft_minted&&!s.artwork_locked&&uint(s.cutoff_ns)<BigInt(Date.now())*1000000n,'LEGACY_STATE_CHANGED','Legacy proof is not an expired unfulfilled campaign');
   return s;
  }
  async function call(suffix,method,args,gas){return executor.execute({id:id+'-'+suffix,signer,plan:{network:r.config.network,signerId:account,receiverId:account,expectedReceiverCodeHash:codeHash,actions:[{type:'call',method,args,gas,deposit:'0'}]}});}
  const closeId=id+'-close',closing=r.store.operation(closeId);
  if(closing){const op=await executor.reconcile(closeId);return await finishClosure(op);}
  const s=await state(),payer=s.holder?.account_id;
  const balance=await r.reads.view(a.intentsId,'mt_balance_of',{account_id:account,token_id:a.nearAsset});
  if(action==='inspect')return {account,outcome:s.outcome,escrowUsdc:balance,principal:s.holder?.principal??'0',payer,parent};
  await qualifyNetwork(r);
  if(action==='refund'){
   if(s.outcome==='open'){const op=await call('cancel','finalize_failure',{},'20000000000000');return {phase:op.phase,step:'cancel',transactionHash:op.transaction_hash};}
   assert(s.outcome==='failure'&&payer,'UNEXPECTED_OUTCOME','Only a failed legacy campaign is refundable');
   const credit=await r.reads.view(account,'get_credit',{account_id:payer});
   if(credit.available==='0'){assert(s.total_received===s.total_withdrawn&&s.total_pending==='0'&&balance==='0','REFUND_UNPROVEN','Legacy liabilities have not cleared');return {phase:'refunded',payer,totalReturnedMicroUsdc:s.total_withdrawn};}
   const op=await call('refund','release_credit',{account_id:payer},'60000000000000');return {phase:op.phase,step:'original-payer-refund',payer,transactionHash:op.transaction_hash};
  }
  assert(s.outcome==='failure'&&s.total_received===s.total_withdrawn&&s.total_pending==='0'&&balance==='0','LIABILITIES_REMAIN','Refund original claims before recovering NEAR');
  assert(await r.reads.view(a.nearUsdc,'ft_balance_of',{account_id:account})==='0','TOKENS_REMAIN','Legacy account still has native USDC');
  if(!r.store.get('recovery',closeId))r.store.insert('recovery',closeId,parent,{accountId:account,beneficiary:parent,state:s,tokenBalance:balance});
  const op=await executor.execute({id:closeId,signer,plan:{network:r.config.network,signerId:account,receiverId:account,expectedReceiverCodeHash:codeHash,
   recoveryVerified:true,actions:[{type:'delete',beneficiaryId:parent}]}});return await finishClosure(op);
  async function finishClosure(op){
   if(!successfulAccountClosure(op.result?.outcome,account,parent))return {phase:op.phase,step:'closure-pending',transactionHash:op.transaction_hash};
   let absent=false;try{await r.reads.account(account);}catch(error){if(error.code==='UNKNOWN_ACCOUNT')absent=true;else throw error;}
   assert(absent,'ACCOUNT_PRESENT','Legacy account has not closed');return {phase:'recovered',account,beneficiary:parent,transactionHash:op.transaction_hash};
  }
 }finally{r.store.close();}
}
try{console.log(JSON.stringify(await recover(process.argv[2]),null,2));}
catch(error){console.error(JSON.stringify({code:error.code??'LEGACY_RECOVERY_FAILED',message:error instanceof AppError?error.message:'Legacy recovery failed; credential details omitted'}));process.exitCode=1;}
