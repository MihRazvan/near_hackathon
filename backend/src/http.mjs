import { createServer } from 'node:http';
import { AIJobs } from './ai-jobs.mjs';
import { CampaignRecords } from './campaign-records.mjs';
import { assert, AppError, walletId } from './core.mjs';
import { sessionToken,sessionCookie } from './session-http.mjs';
import { serveWalletAssets } from './wallet-assets.mjs';
import { serveReferencePhoto } from './reference-photo.mjs';
import { USDC_ABI } from './base-executor.mjs';

async function jsonBody(request,maxBytes=3000000){
 assert(request.headers['content-type']?.split(';')[0]==='application/json','JSON_REQUIRED','Use application/json',415);
 return new Promise((resolve,reject)=>{
  let size=0,done=false;const parts=[];
  request.on('data',part=>{if(done)return;size+=part.length;if(size>maxBytes){done=true;parts.length=0;reject(new AppError('BODY_LIMIT','This upload exceeds the supported size.',413));}else parts.push(part);});
  request.on('end',()=>{if(done)return;try{const value=JSON.parse(Buffer.concat(parts));assert(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length<=64,'INVALID_JSON','JSON object required',400);resolve(value);}catch(error){reject(error instanceof AppError?error:new AppError('INVALID_JSON','Invalid JSON body',400));}});
  request.on('error',()=>reject(new AppError('REQUEST_INTERRUPTED','Request was interrupted',400)));
 });
}
function publicOperation(op){return {id:op.id,phase:op.phase,transactionHash:op.transaction_hash};}
export function httpApp({config,store,auth,marketplace,chain,nativeActions,publication,walletRequests,assetAI,personalAI,supportService,media,budget,near,source,routes,reads,client,returnVerifier,lab,product,funding,capture,provisioning,fundedWallets}){
 const records=new CampaignRecords({config,store,chain,marketplace,product});
 const aiJobs=store?.db?new AIJobs({store,config,assetAI,personalAI}):null;
 const rates=new Map();let activeUploads=0;
 const server=createServer(async(request,response)=>{
  let uploadSlot=false;
  function send(status,body){response.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});response.end(JSON.stringify(body));}
  response.setHeader('Cache-Control','no-store');response.setHeader('X-Content-Type-Options','nosniff');response.setHeader('Referrer-Policy','no-referrer');
  try{
   const production=config.production===true||config.environment==='production',origin=new URL(config.apiOrigin??config.origin),allowedOrigins=config.allowedOrigins??[config.origin];
   // Railway's deployment probe uses its fixed internal Host. This exception
   // never reaches authentication, application routes or wallet configuration.
   const railwayProbe=production&&request.headers.host==='healthcheck.railway.app'&&['GET','HEAD'].includes(request.method)&&request.url==='/api/health';
   assert(request.headers.host===origin.host||railwayProbe,'INVALID_HOST','API host does not match its public configuration',403);
   assert(!request.headers.origin||allowedOrigins.includes(request.headers.origin),'INVALID_ORIGIN','This origin is not allowed',403);
   if(request.headers.origin){response.setHeader('Access-Control-Allow-Origin',request.headers.origin);response.setHeader('Access-Control-Allow-Credentials','true');response.setHeader('Vary','Origin');}
   if(production){response.setHeader('Strict-Transport-Security','max-age=31536000');response.setHeader('Permissions-Policy','camera=(self), microphone=(), geolocation=(self)');}

   if(railwayProbe){response.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});response.end(request.method==='HEAD'?undefined:JSON.stringify({ok:true}));return;}

   if(request.method==='OPTIONS'){
    response.setHeader('Access-Control-Allow-Methods','GET, POST, PATCH, OPTIONS');response.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');response.writeHead(204);response.end();return;
   }
   const url=new URL(request.url,origin);assert(url.origin===origin.origin,'INVALID_HOST','Absolute request origin does not match',403);
   if(url.pathname.startsWith('/api/')){
    let principal=request.socket.remoteAddress;try{const token=sessionToken(request,config);if(token)principal=auth.authenticate(token);}catch{}
    const read=['GET','HEAD'].includes(request.method),key=principal+':'+(read?'read':'write'),now=Date.now(),rate=rates.get(key);
    if(!rate||now-rate.since>=60000)rates.set(key,{since:now,count:1});else{rate.count++;assert(rate.count<=(read?600:config.network==='sandbox'?600:120),'RATE_LIMIT','Local API rate limit reached',429);}
   }
   const path=url.pathname.split('/').filter(Boolean),method=request.method;
   if(await serveWalletAssets(request,response,url))return;
   const developmentRoute=url.pathname==='/lab'||url.pathname.startsWith('/lab/')||path[0]==='api'&&(['funded-wallet','integration'].includes(path[1])||path[1]?.startsWith('lab-'));
   assert(!production||!developmentRoute,'NOT_FOUND','Route not found',404);
   if(!production&&lab&&await lab.serve(request,response,url))return;
   if(product&&await product.serve(request,response,url))return;
   assert(path[0]==='api','NOT_FOUND','API route not found',404);
   if(method==='GET'&&path[1]==='health'){send(200,{ok:true,service:'everywhere-backend',network:config.network});return;}
   if(method==='GET'&&path[1]==='config'){
    const defaults={network:config.network,executionEnabled:config.enabled,origin:config.origin,sandbox:false,walletMode:'External wallets',wallets:[],factory:config.factory?.accountId??null,defaultArbiter:config.defaultArbiter??null,publicationMode:config.hub?'hub':config.factory?'factory':'recoverable',time:new Date().toISOString()};
    send(200,{...(lab&&!production?await lab.publicConfig():defaults),...(config.hub?{publicationMode:'hub'}:{}),production,aiImageAvailable:!!config.aiImageAvailable,aiAvailable:config.aiAvailable??!production,mediaMaxBytes:config.mediaMaxBytes??1000000,apiOrigin:config.apiOrigin??config.origin,customerRouteMax:config.customerRouteMax??'300000',developmentWallets:!production?fundedWallets?.list()??[]:[]});return;
   }
   if(method==='GET'&&path[1]==='lab-config'&&lab){send(200,{...await lab.publicConfig(),developmentWallets:fundedWallets?.list()??[]});return;}
   if(method==='POST'&&path[1]==='funded-wallet'&&path[2]==='sign-in'&&fundedWallets?.enabled){send(200,await fundedWallets.signIn(await jsonBody(request)));return;}
   if(method==='GET'&&path[1]==='campaign-records'&&path.length===3){send(200,await records.record(path[2]));return;}
   if(method==='GET'&&path[1]==='evidence'&&path[2]==='qualification'&&path.length===3){send(200,await records.qualification());return;}
   if(method==='GET'&&path[1]==='catalog'&&product){send(200,await product.catalog());return;}
   if(method==='POST'&&path[1]==='captures'&&path[3]==='photo'&&capture){send(201,capture.upload(path[2],await jsonBody(request)));return;}
   if(method==='POST'&&path[1]==='lab-wallet'&&path[2]==='sign-in'&&lab?.sandbox){send(200,await lab.signIn(await jsonBody(request)));return;}
   if(method==='GET'&&path[1]==='browse'){send(200,marketplace.browse({city:url.searchParams.get('city')||undefined,assetType:url.searchParams.get('type')||undefined}));return;}
   if(method==='GET'&&path[1]==='sales'&&path.length===3){send(200,marketplace.sale(path[2]));return;}
   if(method==='POST'&&path[1]==='auth'&&path[2]==='challenge'){const body=await jsonBody(request);send(201,auth.challenge(body.wallet));return;}
   if(method==='POST'&&path[1]==='auth'&&path[2]==='verify'){const session=await auth.verify(await jsonBody(request));response.setHeader('Set-Cookie',sessionCookie(session.token,config));send(200,production?{wallet:session.wallet,expiresAt:session.expiresAt}:session);return;}
   if(method==='POST'&&path[1]==='personal-ai'&&path[2]==='agent'&&personalAI){send(200,await personalAI.agent(await jsonBody(request),request.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]+)$/)?.[1]));return;}
   const token=sessionToken(request,config),wallet=auth.authenticate(token);
   if(['GET','HEAD'].includes(method)&&path[1]==='assets'&&path[3]==='photo'){serveReferencePhoto({store,wallet,assetId:path[2],request,response});return;}
   if(method==='GET'&&path[1]==='auth'&&path[2]==='session'){send(200,auth.session(token));return;}
   if(method==='POST'&&path[1]==='auth'&&path[2]==='logout'){auth.revoke(token);response.setHeader('Set-Cookie',sessionCookie('',config,{clear:true}));send(200,{signedOut:true});return;}
   const largeUpload=method==='POST'&&path[1]==='media'&&path.length===2;
   if(largeUpload){assert(activeUploads<2,'UPLOAD_BUSY','Uploads are busy. Please try again shortly.',429);activeUploads++;uploadSlot=true;}
   const maxMediaBase64=Math.ceil((config.mediaMaxBytes??1000000)/3)*4;
   const body=['POST','PATCH'].includes(method)?await jsonBody(request,largeUpload?maxMediaBase64+10000:3000000):{};
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
   else if(method==='GET'&&path[1]==='support'&&path.length===3&&supportService)result=supportService.read(wallet,path[2]);
   else if(method==='POST'&&path[1]==='support'&&path[3]==='reply'&&supportService)result=supportService.reply(wallet,path[2],body);
   else if(method==='POST'&&path[1]==='support'&&path.length===2&&product)result=product.support(wallet,body);
   else if(method==='POST'&&path[1]==='captures'&&path.length===2&&capture)result=capture.create(wallet);
   else if(method==='GET'&&path[1]==='captures'&&path.length===3&&capture)result=capture.read(wallet,path[2]);
   else if(method==='POST'&&path[1]==='captures'&&path[3]==='use'&&capture)result=capture.consume(wallet,path[2],marketplace);
   else if(method==='GET'&&path[1]==='lab-state'&&lab)result=await lab.state(wallet);
   else if(method==='POST'&&path[1]==='lab-wallet'&&lab?.sandbox)result=await lab.wallet(wallet,path[2],body);
   else if(method==='POST'&&path[1]==='lab-clock'&&lab?.sandbox)result=await lab.advance(wallet,body);
   else if(method==='GET'&&path[1]==='lab-clock'&&lab?.sandbox)result=lab.clockState();
   else if(method==='POST'&&path[1]==='lab-restart'&&lab?.sandbox)result=lab.restart(wallet);
   else if(method==='GET'&&path[1]==='integration')result={network:config.network,executionEnabled:config.enabled,budget:budget.totals()};
   else if(method==='GET'&&path[1]==='publication-capacity')result=await publication.capacity(wallet);
   else if(method==='GET'&&path[1]==='sale-requests'&&path.length===3)result=marketplace.saleRequest(wallet,path[2]);
   else if(method==='POST'&&path[1]==='assets'&&path.length===2){result=marketplace.createAsset(wallet,body);status=201;}
   else if(method==='PATCH'&&path[1]==='assets'&&path.length===3)result=marketplace.updateAsset(wallet,path[2],body.version,body.asset);
   else if(method==='POST'&&path[1]==='ai'&&path[2]==='jobs'){result=aiJobs.start(wallet,body);status=202;}
   else if(method==='GET'&&path[1]==='ai'&&path[2]==='jobs'&&path.length===4)result=aiJobs.read(wallet,path[3]);
   else if(method==='POST'&&path[1]==='ai'&&path[2]==='draft'){
    assert(assetAI||personalAI?.availability(wallet),'AI_UNAVAILABLE','AI scanning is currently offline. You can edit surfaces manually.',503);
    const day=new Date().toISOString().slice(0,10),quotaId=wallet+'-'+day;
    store.transaction(()=>{const quota=store.get('ai-quota',quotaId),globalId='global-'+day,global=store.get('ai-quota-global',globalId);
     assert((quota?.count??0)<(config.aiDailyLimit??5),'AI_QUOTA','AI draft limit reached for this wallet today',429);
     assert((global?.count??0)<(config.aiGlobalDailyLimit??100),'AI_QUOTA','AI drafting is at its daily capacity. You can continue editing manually.',429);
     if(quota)store.update('ai-quota',quotaId,wallet,quota.version,{count:quota.count+1});else store.insert('ai-quota',quotaId,wallet,{count:1});
     if(global)store.update('ai-quota-global',globalId,'platform',global.version,{count:global.count+1});else store.insert('ai-quota-global',globalId,'platform',{count:1});});
    assert(assetAI||personalAI?.availability(wallet),'AI_UNAVAILABLE','AI scanning is currently offline. You can upload a photo and edit surfaces manually.',503);result=assetAI?await assetAI.draft(body):await personalAI.draft(wallet,body);
   }
   else if(method==='POST'&&path[1]==='media'&&path[2]==='import')result=await media.reuseVerified({owner:wallet,uri:body.uri,publicContentAcknowledged:body.publicContentAcknowledged});
   else if(method==='POST'&&path[1]==='media'&&path.length===2){
    assert(typeof body.base64==='string'&&Buffer.byteLength(body.base64)<=maxMediaBase64,'MEDIA_LIMIT','This artifact exceeds the upload size limit.',400);
    const bytes=Buffer.from(body.base64,'base64');assert(bytes.toString('base64')===body.base64,'INVALID_MEDIA','Canonical base64 required',400);
    result=await media.upload({owner:wallet,bytes,mime:body.mime,publicContentAcknowledged:body.publicContentAcknowledged});status=201;
   }
   else if(method==='POST'&&path[1]==='sales'&&path.length===2){result=marketplace.createSale(wallet,body);status=201;}
   else if(method==='PATCH'&&path[1]==='sales'&&path.length===3)result=marketplace.updateSale(wallet,path[2],body.version,body.sale);
   else if(method==='POST'&&path[1]==='sales'&&path[3]==='publication')result=marketplace.publication(wallet,path[2]);
   else if(method==='POST'&&path[1]==='sales'&&path[3]==='prepare-publish')result=await publication.prepare(wallet,path[2]);
   else if(method==='POST'&&path[1]==='sales'&&path[3]==='publication-options')result=config.hub||config.factory?{mode:config.hub?'hub':'factory',...await publication.prepare(wallet,path[2])}:{mode:'recoverable',...await provisioning.prepare(wallet,path[2])};
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
   else if(method==='POST'&&path[1]==='native-actions'&&path.length===2)result=wallet.startsWith('0x')?{...await chain.prepareAction(wallet,body),type:'intent'}:await nativeActions.prepare(wallet,body);
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
    const plan=await routes.quote({direction:body.direction,wallet,amount:body.amount,maxInput:body.direction==='fund'?(production?config.customerRouteMax??'1000000000':'300000'):body.amount,minOutput:body.minOutput??'1',dry:body.dry!==false});
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
   if(['POST','PATCH'].includes(method)&&['wallet-requests','claims','native-actions','publication-actions','provision-plans','sales','bookings'].includes(path[1]))product?.invalidate?.();
   send(status,result);
  }catch(error){const known=error instanceof AppError;if(!known)console.error('API_INTERNAL_ERROR',error?.name??'Error',String(error?.stack??'').split('\n').slice(1,4).join('\n'));send(known?error.status:500,{error:{code:known?error.code:'INTERNAL_ERROR',message:known?error.message:'The request could not be completed. Your saved progress is retained.'}});}
  finally{if(uploadSlot)activeUploads--;}
 });
 server.aiJobs=aiJobs;server.headersTimeout=5000;server.requestTimeout=120000;return server;
}
