import test from 'node:test';import assert from 'node:assert/strict';import{once}from'node:events';
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
