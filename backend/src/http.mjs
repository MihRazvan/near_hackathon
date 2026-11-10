import { createServer } from 'node:http';
import { assert, AppError, walletId } from './core.mjs';
import { USDC_ABI } from './base-executor.mjs';

async function jsonBody(request){
 assert(request.headers['content-type']?.split(';')[0]==='application/json','JSON_REQUIRED','Use application/json',415);
 return new Promise((resolve,reject)=>{
  let size=0,done=false;const parts=[];
  request.on('data',part=>{if(done)return;size+=part.length;if(size>3000000){done=true;parts.length=0;reject(new AppError('BODY_LIMIT','Request exceeds 3 MB',413));}else parts.push(part);});
  request.on('end',()=>{if(done)return;try{const value=JSON.parse(Buffer.concat(parts));assert(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length<=64,'INVALID_JSON','JSON object required',400);resolve(value);}catch(error){reject(error instanceof AppError?error:new AppError('INVALID_JSON','Invalid JSON body',400));}});
  request.on('error',()=>reject(new AppError('REQUEST_INTERRUPTED','Request was interrupted',400)));
 });
}
function publicOperation(op){return {id:op.id,phase:op.phase,transactionHash:op.transaction_hash};}
export function httpApp({config,store,auth,marketplace,chain,nativeActions,publication,walletRequests,assetAI,media,budget,near,source,routes,reads,client,returnVerifier,lab,product,funding,capture,provisioning,fundedWallets}){
 const rates=new Map();
 const server=createServer(async(request,response)=>{
  function send(status,body){response.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});response.end(JSON.stringify(body));}
  response.setHeader('Cache-Control','no-store');response.setHeader('X-Content-Type-Options','nosniff');response.setHeader('Referrer-Policy','no-referrer');
  try{
   const origin=new URL(config.origin);
   assert(request.headers.host===origin.host,'INVALID_HOST','Local API host does not match configuration',403);
   assert(!request.headers.origin||request.headers.origin===config.origin,'INVALID_ORIGIN','This origin is not allowed',403);
   if(request.headers.origin){response.setHeader('Access-Control-Allow-Origin',config.origin);response.setHeader('Vary','Origin');}
   if(request.method==='OPTIONS'){
    response.setHeader('Access-Control-Allow-Methods','GET, POST, PATCH, OPTIONS');response.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');response.writeHead(204);response.end();return;
   }
   const url=new URL(request.url,origin);assert(url.origin===config.origin,'INVALID_HOST','Absolute request origin does not match',403);
   if(url.pathname.startsWith('/api/')){
    const read=['GET','HEAD'].includes(request.method),key=request.socket.remoteAddress+':'+(read?'read':'write'),now=Date.now(),rate=rates.get(key);
    if(!rate||now-rate.since>=60000)rates.set(key,{since:now,count:1});else{rate.count++;assert(rate.count<=(read?600:config.network==='sandbox'?600:120),'RATE_LIMIT','Local API rate limit reached',429);}
   }
   const path=url.pathname.split('/').filter(Boolean),method=request.method;
   if(lab&&await lab.serve(request,response,url))return;
   if(product&&await product.serve(request,response,url))return;
   assert(path[0]==='api','NOT_FOUND','API route not found',404);
   if(method==='GET'&&path[1]==='health'){send(200,{ok:true,service:'everywhere-local-backend'});return;}
   if(method==='GET'&&path[1]==='lab-config'&&lab){send(200,{...await lab.publicConfig(),developmentWallets:fundedWallets?.list()??[]});return;}
   if(method==='POST'&&path[1]==='funded-wallet'&&path[2]==='sign-in'&&fundedWallets?.enabled){send(200,await fundedWallets.signIn(await jsonBody(request)));return;}
   if(method==='GET'&&path[1]==='catalog'&&product){send(200,await product.catalog());return;}
   if(method==='POST'&&path[1]==='captures'&&path[3]==='photo'&&capture){send(201,capture.upload(path[2],await jsonBody(request)));return;}
   if(method==='POST'&&path[1]==='lab-wallet'&&path[2]==='sign-in'&&lab?.sandbox){send(200,await lab.signIn(await jsonBody(request)));return;}
   if(method==='GET'&&path[1]==='browse'){send(200,marketplace.browse({city:url.searchParams.get('city')||undefined,assetType:url.searchParams.get('type')||undefined}));return;}
   if(method==='GET'&&path[1]==='sales'&&path.length===3){send(200,marketplace.sale(path[2]));return;}
   if(method==='POST'&&path[1]==='auth'&&path[2]==='challenge'){const body=await jsonBody(request);send(201,auth.challenge(body.wallet));return;}
   if(method==='POST'&&path[1]==='auth'&&path[2]==='verify'){send(200,await auth.verify(await jsonBody(request)));return;}
   const token=request.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]+)$/)?.[1],wallet=auth.authenticate(token);
   if(method==='POST'&&path[1]==='auth'&&path[2]==='logout'){auth.revoke(token);send(200,{signedOut:true});return;}
   const body=['POST','PATCH'].includes(method)?await jsonBody(request):{};
   let result,status=200;
   if(method==='GET'&&path[1]==='me')result={wallet,dashboard:marketplace.dashboard(wallet)};
   else if(method==='POST'&&path[1]==='funded-wallet'&&fundedWallets?.enabled){
    if(path[2]==='sign-intent')result=await fundedWallets.signIntent(wallet,body);
    else if(path[2]==='send-native')result=await fundedWallets.sendNative(wallet,body);
    else if(path[2]==='send-base')result=await fundedWallets.sendBase(wallet,body);
    else assert(false,'NOT_FOUND','Development wallet action not found',404);
   }
   else if(method==='GET'&&path[1]==='workspace'&&product)result=await product.workspace(wallet);
   else if(method==='PATCH'&&path[1]==='profile'&&product)result=product.profile(wallet,body);
   else if(method==='POST'&&path[1]==='saved'&&product)result=product.save(wallet,body);
   else if(method==='POST'&&path[1]==='support'&&product)result=product.support(wallet,body);
   else if(method==='POST'&&path[1]==='captures'&&path.length===2&&capture)result=capture.create(wallet);
   else if(method==='GET'&&path[1]==='captures'&&path.length===3&&capture)result=capture.read(wallet,path[2]);
   else if(method==='GET'&&path[1]==='lab-state'&&lab)result=await lab.state(wallet);
   else if(method==='POST'&&path[1]==='lab-wallet'&&lab?.sandbox)result=await lab.wallet(wallet,path[2],body);
   else if(method==='POST'&&path[1]==='lab-clock'&&lab?.sandbox)result=await lab.advance(wallet,body);
   else if(method==='GET'&&path[1]==='lab-clock'&&lab?.sandbox)result=lab.clockState();
   else if(method==='POST'&&path[1]==='lab-restart'&&lab?.sandbox)result=lab.restart(wallet);
   else if(method==='GET'&&path[1]==='integration')result={network:config.network,executionEnabled:config.enabled,budget:budget.totals()};
   else if(method==='POST'&&path[1]==='assets'&&path.length===2){result=marketplace.createAsset(wallet,body);status=201;}
   else if(method==='PATCH'&&path[1]==='assets'&&path.length===3)result=marketplace.updateAsset(wallet,path[2],body.version,body.asset);
   else if(method==='POST'&&path[1]==='ai'&&path[2]==='draft'){
    const day=new Date().toISOString().slice(0,10),quotaId=wallet+'-'+day;
    store.transaction(()=>{const quota=store.get('ai-quota',quotaId);assert((quota?.count??0)<5,'AI_QUOTA','Local draft limit reached for this wallet today',429);
     if(quota)store.update('ai-quota',quotaId,wallet,quota.version,{count:quota.count+1});else store.insert('ai-quota',quotaId,wallet,{count:1});});
    assert(assetAI,'AI_UNAVAILABLE','AI drafting is not configured',503);result=await assetAI.draft(body);
   }
   else if(method==='POST'&&path[1]==='media'&&path[2]==='import')result=await media.reuseVerified({owner:wallet,uri:body.uri,publicContentAcknowledged:body.publicContentAcknowledged});
   else if(method==='POST'&&path[1]==='media'&&path.length===2){
    assert(typeof body.base64==='string'&&Buffer.byteLength(body.base64)<=1400000,'MEDIA_LIMIT','Artifact exceeds the local size limit',400);
    const bytes=Buffer.from(body.base64,'base64');assert(bytes.toString('base64')===body.base64,'INVALID_MEDIA','Canonical base64 required',400);
    result=await media.upload({owner:wallet,bytes,mime:body.mime,publicContentAcknowledged:body.publicContentAcknowledged});status=201;
   }
   else if(method==='POST'&&path[1]==='sales'&&path.length===2){result=marketplace.createSale(wallet,body);status=201;}
   else if(method==='PATCH'&&path[1]==='sales'&&path.length===3)result=marketplace.updateSale(wallet,path[2],body.version,body.sale);
   else if(method==='POST'&&path[1]==='sales'&&path[3]==='publication')result=marketplace.publication(wallet,path[2]);
   else if(method==='POST'&&path[1]==='sales'&&path[3]==='prepare-publish')result=await publication.prepare(wallet,path[2]);
   else if(method==='POST'&&path[1]==='sales'&&path[3]==='publication-options')result=config.factory?{mode:'factory',...await publication.prepare(wallet,path[2])}:{mode:'recoverable',...await provisioning.prepare(wallet,path[2])};
   else if(method==='GET'&&path[1]==='provision-plans'&&path.length===3)result=provisioning.owned(wallet,path[2]);
   else if(method==='POST'&&path[1]==='provision-plans'&&path[3]==='start')result=await provisioning.start(wallet,path[2],body);
   else if(method==='POST'&&path[1]==='publication-actions'&&path[3]==='confirm')result=await publication.confirm(wallet,path[2],body.transactionHash);
   else if(method==='POST'&&path[1]==='sales'&&path[3]==='publish')result=await marketplace.publish(wallet,path[2],body);
   else if(method==='POST'&&path[1]==='campaigns'&&path.length===2){result=marketplace.createCampaign(wallet,body);status=201;}
   else if(method==='POST'&&path[1]==='bookings'&&path.length===2){result=await marketplace.prepareBooking(wallet,body);status=201;}
   else if(method==='GET'&&path[1]==='bookings'&&path.length===3)result=await marketplace.booking(wallet,path[2]);
   else if(method==='POST'&&path[1]==='bookings'&&path[3]==='submit')result=await marketplace.submitBooking(wallet,path[2],body.signature);
   else if(method==='POST'&&path[1]==='bookings'&&path[3]==='cancel')result=marketplace.cancelBooking(wallet,path[2]);
   else if(method==='POST'&&path[1]==='bookings'&&path[3]==='native-plan')result=await nativeActions.prepareBooking(wallet,path[2]);
   else if(path[1]==='bookings'&&path[3]==='messages'&&['GET','POST'].includes(method))result=marketplace.thread(wallet,path[2],method==='POST'?body.message:undefined);
   else if(path[1]==='placements'&&path[3]==='messages'&&['GET','POST'].includes(method))result=await marketplace.placementThread(wallet,path[2],method==='POST'?body.message:undefined);
   else if(method==='POST'&&path[1]==='placements'&&path[3]==='issues')result=await marketplace.placementIssue(wallet,path[2],body);
   else if(method==='POST'&&path[1]==='bookings'&&path[3]==='issues'){result=marketplace.issue(wallet,path[2],body);status=201;}
   else if(method==='GET'&&path[1]==='intents'&&path.length===3){const record=store.get('intent',path[2]);assert(record?.owner===wallet,'NOT_FOUND','Intent not found',404);result=record.plan;}
   else if(method==='POST'&&path[1]==='intents'&&path[3]==='relay'){const op=await chain.relay({buyerId:wallet,planId:path[2],signature:body.signature});result={...publicOperation(op),intentStatus:store.get('intent',path[2]).status};}
   else if(method==='POST'&&path[1]==='withdrawal-intent')result=await chain.prepareWithdrawal({buyerId:wallet,recipientId:body.recipientId,amount:body.amount});
   else if(method==='POST'&&path[1]==='claims')result=await chain.claimForWallet({contractId:body.contractId,creditorId:wallet});
   else if(method==='GET'&&path[1]==='wallet'&&path[2]==='balances'){
    result={wallet,intentsUsdc:await reads.view(config.assets.intentsId,'mt_balance_of',{account_id:wallet,token_id:config.assets.nearAsset})};
    if(wallet.startsWith('0x')&&config.network==='mainnet')Object.assign(result,{baseUsdc:(await client.readContract({address:config.assets.baseUsdc,abi:USDC_ABI,functionName:'balanceOf',args:[wallet]})).toString(),baseEth:(await client.getBalance({address:wallet})).toString()});
    else if(!wallet.startsWith('0x'))Object.assign(result,{near:(await reads.account(wallet)).amount,nearUsdc:await reads.view(config.assets.nearUsdc,'ft_balance_of',{account_id:wallet}),tokenStorageRegistered:!!await reads.view(config.assets.nearUsdc,'storage_balance_of',{account_id:wallet})});
   }
   else if(method==='POST'&&path[1]==='nomination')result=await chain.prepareNomination({buyerId:wallet,contractId:body.contractId,recipientId:body.recipientId});
   else if(method==='POST'&&path[1]==='native-actions'&&path.length===2)result=await nativeActions.prepare(wallet,body);
   else if(method==='POST'&&path[1]==='token-actions'&&path.length===2)result=await nativeActions.prepareToken(wallet,body);
   else if(method==='POST'&&path[1]==='native-actions'&&path[3]==='confirm')result=await nativeActions.confirm(wallet,path[2],body.transactionHash);
   else if(method==='GET'&&path[1]==='wallet-requests')result=walletRequests.list(wallet);
   else if(method==='POST'&&path[1]==='wallet-requests'&&path.length===2)result=await walletRequests.prepare(wallet,body);
   else if(method==='POST'&&path[1]==='wallet-requests'&&path[3]==='reject')result=walletRequests.reject(wallet,path[2],body);
   else if(method==='POST'&&path[1]==='wallet-requests'&&path[3]==='cancel-unsent')result=walletRequests.cancelUnsent(wallet,path[2]);
   else if(method==='POST'&&path[1]==='wallet-requests'&&path[3]==='dispatch')result=walletRequests.dispatch(wallet,path[2]);
   else if(method==='POST'&&path[1]==='wallet-requests'&&path[3]==='reconcile')result=await walletRequests.reconcile(wallet,path[2],body.transactionHash);
   else if(method==='POST'&&path[1]==='wallet-requests'&&path[3]==='resume-intent')result=await walletRequests.resumeIntent(wallet,path[2]);
   else if(method==='POST'&&path[1]==='wallet-requests'&&path[3]==='submit')result=await walletRequests.submitIntent(wallet,path[2],body.signature);
   else if(method==='POST'&&path[1]==='routes'){
    assert(wallet.startsWith('0x'),'EVM_WALLET_REQUIRED','Connect a Base wallet for this route',400);
    assert(['fund','exit'].includes(body.direction),'INVALID_ROUTE','Choose fund or exit',400);
    const plan=await routes.quote({direction:body.direction,wallet,amount:body.amount,maxInput:body.direction==='fund'?'300000':body.amount,minOutput:body.minOutput??'1',dry:body.dry!==false});
    store.insert('route',plan.planId,wallet,{plan});result=plan;
   }
   else if(method==='POST'&&path[1]==='exit-intent')result=await chain.prepareExit({buyerId:wallet,routeId:body.routeId});
   else if(method==='POST'&&path[1]==='wallet-funding'&&path.length===2&&funding)result=await funding.prepare(wallet,body.routeId);
   else if(method==='GET'&&path[1]==='wallet-funding'&&funding)result=funding.list(wallet);
   else if(method==='POST'&&path[1]==='wallet-funding'&&path[3]==='cancel-unsent'&&funding)result=funding.cancelUnsent(wallet,path[2]);
   else if(method==='POST'&&path[1]==='wallet-funding'&&path[3]==='dispatch'&&funding)result=funding.dispatch(wallet,path[2]);
   else if(method==='POST'&&path[1]==='wallet-funding'&&path[3]==='reject'&&funding)result=funding.reject(wallet,path[2],body);
   else if(method==='POST'&&path[1]==='wallet-funding'&&path[3]==='reconcile'&&funding)result=await funding.reconcile(wallet,path[2],body.transactionHash);
   else if(method==='GET'&&path[1]==='routes'&&path[3]==='reconcile')result=await returnVerifier.verify(path[2],wallet);
   else if(method==='GET'&&path[1]==='routes'&&path.length===3){const route=store.get('route',path[2]);assert(route?.owner===wallet,'NOT_FOUND','Route not found',404);const status=await routes.status(route.plan);result={providerStatus:status.status,updatedAt:status.updatedAt,swapDetails:status.swapDetails??null,providerStatusIsFinalChainEvidence:false};}
   else if(method==='GET'&&path[1]==='operations'&&path.length===3){
    let op=store.operation(path[2]);const claim=op?.kind==='near'&&op.id.startsWith('wallet-claim-')&&op.plan.actions?.length===1&&op.plan.actions[0].method==='release_credit'&&op.plan.actions[0].args.account_id===wallet;assert(op&&(op.scope===wallet||claim||store.list('intent',wallet).some(i=>i.operationId===op.id)),'NOT_FOUND','Operation not found for this wallet',404);
    if(op.kind==='near')op=await near.reconcile(op.id);else if(op.kind==='base-fund')op=await source.reconcile(op.id);result=publicOperation(op);
   }
   else assert(false,'NOT_FOUND','API route not found',404);
   send(status,result);
  }catch(error){const known=error instanceof AppError;send(known?error.status:500,{error:{code:known?error.code:'INTERNAL_ERROR',message:known?error.message:'Local API request failed; credentials and upstream payloads omitted'}});}
 });
 server.headersTimeout=5000;server.requestTimeout=30000;return server;
}
