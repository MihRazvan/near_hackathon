import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { KeyPair, KeyPairSigner, actions, createTransaction, baseDecode, baseEncode } from 'near-api-js';
import { assert, hashObject, walletId } from './core.mjs';
import { nep413Digest } from './auth.mjs';
import { successfulNearOutcome } from './rpc.mjs';

const directory=fileURLToPath(new URL('../lab/',import.meta.url));
const files=new Map([['/lab',['index.html','text/html']],['/lab/',['index.html','text/html']],
 ['/lab/app.js',['app.js','text/javascript']],['/lab/style.css',['style.css','text/css']],['/lab/wallets.js',['dist/wallets.js','text/javascript']]]);

export class IntegrationLab {
 constructor({config,store,reads,chain,marketplace,walletRequests,auth,testWallets,testSecretKey,clock}){
  Object.assign(this,{config,store,reads,chain,marketplace,walletRequests,auth,testWallets,testSecretKey,clock});
  this.sandbox=config.network==='sandbox';this.signerBusy=new Set();
 }
 async serve(request,response,url){
  if(this.sandbox&&url.pathname.startsWith('/api/'))await this.clock.refresh();
  const file=files.get(url.pathname);if(!file||request.method!=='GET')return false;
  const nonce=randomBytes(24).toString('base64');let bytes=await readFile(directory+file[0]);
  if(file[0]==='index.html')bytes=Buffer.from(bytes.toString().replace('</head>',`<meta name="lab-csp-nonce" content="${nonce}"></head>`));
  response.writeHead(200,{'Content-Type':file[1]+'; charset=utf-8',
   'Content-Security-Policy':`default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https:; frame-src 'self' https:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`});response.end(bytes);return true;
 }
 async publicConfig(){return {network:this.config.network,executionEnabled:this.config.enabled,origin:this.config.origin,
  sandbox:this.sandbox,walletMode:this.sandbox?'Valueless Sandbox test wallets; real signatures and NEAR receipts':'External wallets only',
  wallets:this.sandbox?this.testWallets.map(({label,address})=>({label,address})):[],factory:this.config.factory?.accountId??null,
  time:new Date(this.clock?.now()??Date.now()).toISOString()};}
 async state(actor){
  const snapshots=[];
  const archived=[];
  for(const d of this.store.list('deployment')){try{snapshots.push(await this.chain.snapshot(d.id,[actor]));}
   catch(error){if(error.code==='UNKNOWN_ACCOUNT')archived.push({contractId:d.id,status:'account-closed'});else throw error;}}
  const native=snapshots.filter(s=>s.rights.current_owner_id===actor);
  return {dashboard:{...this.marketplace.dashboard(actor),placements:native},sales:this.marketplace.browse(),snapshots,archived,
   media:this.store.list('media',actor),issues:this.store.list('issue').filter(i=>i.owner===actor||snapshots.some(s=>s.accountId===i.contractId&&[s.state.arbiter_id,s.state.seller_id].includes(actor))),
   publicationPlans:this.store.list('publication-plan',actor),nativePlans:this.store.list('native-plan',actor),
   requests:this.walletRequests.list(actor),time:new Date(this.clock?.now()??Date.now()).toISOString()};
 }
 testAccount(actor){assert(this.sandbox,'SANDBOX_ONLY','Local test wallets are only available on Sandbox',403);
  const w=this.testWallets.find(w=>w.address===walletId(actor));assert(w,'UNKNOWN_TEST_WALLET','Choose a local test wallet',403);return w;}
 async signIn({challengeId,wallet}){
  const w=this.testAccount(wallet),c=this.store.db.prepare('SELECT * FROM challenges WHERE id=?').get(challengeId);
  assert(c&&c.wallet===w.address&&!c.consumed&&c.expires_ms>Date.now(),'EXPIRED_CHALLENGE','Fresh wallet challenge required',401);
  if(w.account)return {challengeId,signature:await w.account.signMessage({message:c.message})};
  const key=KeyPair.fromString(this.testSecretKey),signature=key.sign(nep413Digest({message:c.message,nonce:c.nonce,recipient:new URL(this.config.origin).host}));
  return {challengeId,accountId:w.address,publicKey:key.getPublicKey().toString(),signature:Buffer.from(signature.signature).toString('base64')};
 }
 async wallet(actor,kind,body){
  const w=this.testAccount(actor);
  if(kind==='intent-sign'){
   assert(w.account,'EVM_WALLET_REQUIRED','Choose a test EVM wallet');
   const record=this.store.get('intent',body.planId);assert(record?.owner===w.address,'NOT_FOUND','Intent not found',404);
   const request=this.walletRequests.owned(actor,body.requestId);assert(request.planId===record.id&&request.status==='requested','INVALID_REQUEST','Wallet request does not match');
   return {signature:await w.account.signMessage({message:record.plan.message})};
  }
  if(kind==='send'){
   assert(!w.account,'NEAR_WALLET_REQUIRED','Choose a test NEAR wallet');
   let r=this.walletRequests.owned(actor,body.requestId);
   assert(['native','publication'].includes(r.kind)&&!['rejected','failed'].includes(r.status),'INVALID_REQUEST','A native wallet request is required');
   const p=this.store.get(r.kind==='native'?'native-plan':'publication-plan',r.planId);
   assert(p.owner===actor&&p.plan.transaction.signerId===actor,'WRONG_WALLET','Test signer differs from the action owner');
   const sent=await this.sendTestTransaction(actor,p.plan.transaction,'wallet-'+r.id);
   if(!r.transactionHash)r=this.store.update('wallet-request',r.id,actor,r.version,{...r,status:'submitted',transactionHash:sent.transactionHash});
   return {transactionHash:sent.transactionHash};
  }
  if(kind==='faucet'){
   assert(w.account,'EVM_WALLET_REQUIRED','Faucet funds a test EVM Intents account');
   const transaction={signerId:'usdc.sandbox',receiverId:'usdc.sandbox',actions:[
    {type:'FunctionCall',params:{methodName:'mint',args:{account_id:'usdc.sandbox',amount:'250000'},gas:'10000000000000',deposit:'0'}},
    {type:'FunctionCall',params:{methodName:'ft_transfer_call',args:{receiver_id:'verifier.sandbox',amount:'250000',msg:actor,memo:null},gas:'60000000000000',deposit:'1'}}]};
   return this.sendTestTransaction('usdc.sandbox',transaction,'faucet-'+actor);
  }
  assert(false,'NOT_FOUND','Unknown test wallet action',404);
 }
 async sendTestTransaction(actor,transaction,id){
  assert(this.sandbox&&this.config.network==='sandbox','SANDBOX_ONLY','Test transactions cannot use public networks');
  await this.reads.status();
  let r=this.store.get('lab-transaction',id);
  if(r)assert(r.planHash===hashObject(transaction),'TRANSACTION_CHANGED','Stored test wallet action differs');
  if(!r){
   assert(!this.signerBusy.has(actor),'SIGNER_BUSY','Test signer already has a request');this.signerBusy.add(actor);
   try{
    const key=KeyPairSigner.fromSecretKey(this.testSecretKey),publicKey=await key.getPublicKey(),block=await this.reads.block();
    const access=await this.reads.key(actor,publicKey.toString(),block);
    const tx=createTransaction(actor,publicKey,transaction.receiverId,BigInt(access.nonce)+1n,
     transaction.actions.map(a=>actions.functionCall(a.params.methodName,a.params.args,BigInt(a.params.gas),BigInt(a.params.deposit))),baseDecode(block.header.hash));
    const signed=await key.signTransaction(tx);
    r=this.store.insert('lab-transaction',id,actor,{planHash:hashObject(transaction),transactionHash:baseEncode(signed.txHash),
     signedTransaction:Buffer.from(signed.signedTransaction.encode()).toString('base64'),status:'signed'});
   }finally{this.signerBusy.delete(actor);}
  }
  if(r.status==='signed'){
   // Exact bytes are committed before sending. Recovery never constructs another transaction.
   r=this.store.update('lab-transaction',id,actor,r.version,{...r,status:'broadcast-unknown'});
   try{await this.reads.rpc.call('send_tx',{signed_tx_base64:r.signedTransaction,wait_until:'NONE'});}catch{}
  }
  if(r.status==='confirmed')return {transactionHash:r.transactionHash,status:'confirmed'};
  for(let i=0;i<50;i++){
   try{const outcome=await this.reads.rpc.call('tx',{tx_hash:r.transactionHash,sender_account_id:actor,wait_until:'NONE'});
    if(outcome.final_execution_status==='FINAL'){
     assert(successfulNearOutcome(outcome),'TEST_TRANSACTION_FAILED','Sandbox wallet transaction failed; inspect chain receipts');
     const current=this.store.get('lab-transaction',id);
     this.store.update('lab-transaction',id,actor,current.version,{...current,status:'confirmed',finalBlockHash:outcome.transaction_outcome.block_hash});
     return {transactionHash:r.transactionHash,status:'confirmed'};
    }}catch(e){if(!['UNKNOWN_TRANSACTION','RPC_UNAVAILABLE'].includes(e.code))throw e;}
   await new Promise(resolve=>setTimeout(resolve,150));
  }
  return {transactionHash:r.transactionHash,status:'pending'};
 }
 async advance(actor,{saleId,stage}){
  this.testAccount(actor);const sale=this.store.get('sale',saleId);
  assert(sale&&[sale.owner,sale.arbiterId].includes(actor),'FORBIDDEN','Seller or arbiter test wallet required',403);
  assert(['biddingClose','reviewEnd'].includes(stage),'INVALID_STAGE','Advance to bidding close or review end');
  // Sandbox skips can cross GC epochs. Persist original final receipts before advancing time.
  for(let attempt=0;attempt<20;attempt++){
   const pending=this.store.db.prepare("SELECT id FROM operations WHERE kind='near' AND phase NOT IN ('confirmed','failed','superseded')").all();
   for(const op of pending)await this.chain.near.reconcile(op.id);
   const remaining=this.store.db.prepare("SELECT count(*) AS n FROM operations WHERE kind='near' AND phase NOT IN ('confirmed','failed','superseded')").get().n;
   if(!remaining)break;
   if(attempt===19)assert(false,'RECONCILIATION_REQUIRED','Finalize earlier chain operations before advancing the local clock');
   await new Promise(r=>setTimeout(r,150));
  }
  for(const request of this.store.list('wallet-request').filter(r=>!['rejected','confirmed','failed'].includes(r.status))){
   const final=await this.walletRequests.reconcile(request.owner,request.id);
   assert(['confirmed','failed'].includes(final.status),'RECONCILIATION_REQUIRED','Resolve unknown wallet requests before advancing the local clock');
  }
  const target=Date.parse(sale.schedule[stage])+3000;
  assert(target-this.clock.now()<=3*60*60*1000,'CLOCK_LIMIT','Local clock advance is limited to three hours');
  const prior=this.store.get('lab-clock','current');
  assert(!prior||prior.status!=='advancing'||prior.target===target,'CLOCK_BUSY','An earlier clock advance is still running');
  let job=prior;
  if(!prior)job=this.store.insert('lab-clock','current',actor,{target,status:'advancing'});
  else if(prior.target!==target||prior.status==='failed')job=this.store.update('lab-clock','current',prior.owner,prior.version,{target,status:'advancing'});
  this.resumeClock();return {status:job.status,target:new Date(target).toISOString()};
 }
 resumeClock(){
  const job=this.store.get('lab-clock','current');if(!job||job.status!=='advancing'||this.advancePromise)return;
  this.advancePromise=(async()=>{
   try{
    for(let i=0;i<120;i++){
     await this.clock.refresh();
     if(this.clock.now()>=job.target){const r=this.store.get('lab-clock','current');this.store.update('lab-clock','current',r.owner,r.version,{...r,status:'complete'});return;}
     const before=await this.reads.block(),delta=500;
     // Sandbox produces roughly 0.3-second blocks. Bound every skip and verify actual timestamps.
     await this.reads.rpc.call('sandbox_fast_forward',{delta_height:delta},{timeoutMs:30000});
     for(let n=0;n<100;n++){const b=await this.reads.block();if(b.header.height>=before.header.height+delta)break;await new Promise(r=>setTimeout(r,100));}
    }
    throw new Error('Clock advance did not converge');
   }catch(error){const r=this.store.get('lab-clock','current');this.store.update('lab-clock','current',r.owner,r.version,{...r,status:'failed',errorCode:error.code??'CLOCK_FAILED'});}
  })().finally(()=>{this.advancePromise=null;});
 }
 clockState(){this.resumeClock();const r=this.store.get('lab-clock','current');return {status:r?.status??'idle',time:new Date(this.clock.now()).toISOString(),...(r?.errorCode?{errorCode:r.errorCode}:{})};}

 restart(actor){this.testAccount(actor);assert(['seller.sandbox','arbiter.sandbox'].includes(actor),'FORBIDDEN','Owner or arbiter test wallet required',403);
  setTimeout(()=>process.emit('SIGTERM'),150).unref();return {restartScheduled:true};}
}
