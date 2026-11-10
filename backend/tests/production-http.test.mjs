import test from 'node:test';import assert from 'node:assert/strict';import{once}from'node:events';
import{request as httpRequest}from'node:http';
import{privateKeyToAccount}from'viem/accounts';import{Store}from'../src/store.mjs';import{Auth}from'../src/auth.mjs';import{httpApp}from'../src/http.mjs';
test('public runtime hides test signers and uses a secure revocable HttpOnly session',async()=>{
 const store=new Store(),config={origin:'http://127.0.0.1:0',production:true,network:'mainnet',enabled:false},auth=new Auth(store,{origin:config.origin});
 let devCalls=0;const server=httpApp({config,store,auth,lab:{serve:()=>{devCalls++;}},fundedWallets:{enabled:true,list:()=>['secret'],signIn:()=>assert.fail('test signer reachable')}});server.listen(0,'127.0.0.1');await once(server,'listening');config.origin='http://127.0.0.1:'+server.address().port;auth.origin=config.origin;
 const post=(path,body,cookie)=>fetch(config.origin+'/api/'+path,{method:'POST',headers:{Origin:config.origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
 try{
  for(const path of ['/lab','/lab/wallets.js','/api/lab-config','/api/funded-wallet/sign-in','/api/integration'])assert.equal((await fetch(config.origin+path)).status,404);
  const publicConfig=await(await fetch(config.origin+'/api/config')).json();assert.deepEqual(publicConfig.developmentWallets,[]);assert.equal(publicConfig.production,true);assert.equal(devCalls,0);
  const account=privateKeyToAccount('0x'+'01'.repeat(32)),challenge=await(await post('auth/challenge',{wallet:account.address})).json();const response=await post('auth/verify',{challengeId:challenge.id,signature:await account.signMessage({message:challenge.message})});
  const body=await response.json();assert.equal(response.status,200);assert.equal(body.wallet,account.address.toLowerCase());assert.equal('token'in body,false);const setCookie=response.headers.get('set-cookie');assert.ok(setCookie.includes('__Host-everywhere_session='));assert.ok(setCookie.includes('HttpOnly'));assert.ok(setCookie.includes('Secure'));assert.ok(setCookie.includes('SameSite=Lax'));const cookie=setCookie.split(';')[0];
  const restored=await fetch(config.origin+'/api/auth/session',{headers:{Cookie:cookie}});assert.equal(restored.status,200);assert.equal((await restored.json()).wallet,body.wallet);
  assert.equal((await post('auth/logout',{},cookie)).status,200);assert.equal((await fetch(config.origin+'/api/auth/session',{headers:{Cookie:cookie}})).status,401);
 }finally{server.close();await once(server,'close');store.close();}
});

// https://docs.railway.com/deployments/healthchecks documents the fixed probe Host.
test('Railway probe Host is allowed only for production GET/HEAD health without sessions or application data',async()=>{
 const config={origin:'http://127.0.0.1:0',production:true,network:'mainnet',enabled:false};let authCalls=0;
 const server=httpApp({config,auth:{authenticate:()=>{authCalls++;throw Error('Probe must not authenticate');}},product:{serve:()=>assert.fail('Probe reached product')}});
 server.listen(0,'127.0.0.1');await once(server,'listening');config.origin='http://127.0.0.1:'+server.address().port;
 const call=(path,{method='GET',host='healthcheck.railway.app',headers={}}={})=>new Promise((resolve,reject)=>{const req=httpRequest(config.origin+path,{method,headers:{Host:host,...headers}},response=>{let body='';response.on('data',chunk=>body+=chunk);response.on('end',()=>resolve({status:response.statusCode,headers:response.headers,body}));});req.on('error',reject);req.end();});
 try{const get=await call('/api/health',{headers:{Cookie:'__Host-everywhere_session='+'x'.repeat(43),Authorization:'Bearer '+'y'.repeat(43)}});assert.equal(get.status,200);assert.deepEqual(JSON.parse(get.body),{ok:true});assert.equal(get.headers['set-cookie'],undefined);assert.equal(authCalls,0);
  const head=await call('/api/health',{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.body,'');assert.equal(authCalls,0);
  for(const path of ['/api/config','/api/auth/session','/api/workspace','/api/health?query=1','/api/health/','/'])assert.equal((await call(path)).status,403);
  for(const method of ['POST','PATCH','OPTIONS'])assert.equal((await call('/api/health',{method})).status,403);
  for(const host of ['evil.example','healthcheck.railway.app.evil','healthcheck.railway.app:8080'])assert.equal((await call('/api/health',{host})).status,403);
  assert.equal((await call('/api/health',{headers:{Origin:'https://evil.example'}})).status,403);
  config.production=false;assert.equal((await call('/api/health')).status,403);assert.equal(authCalls,0);
 }finally{server.close();await once(server,'close');}
});
