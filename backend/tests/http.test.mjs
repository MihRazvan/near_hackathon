import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { get } from 'node:http';
import { privateKeyToAccount } from 'viem/accounts';
import { Store } from '../src/store.mjs';
import { Auth } from '../src/auth.mjs';
import { Marketplace } from '../src/marketplace.mjs';
import { httpApp } from '../src/http.mjs';

test('HTTP sign-in, draft creation, ownership isolation and sign-out work together; foreign origins and host rebinding are refused',async()=>{
 const store=new Store(),config={origin:'http://127.0.0.1:0',network:'mainnet',enabled:false};
 const auth=new Auth(store,{origin:config.origin}),marketplace=new Marketplace({store,chain:{}}),server=httpApp({config,store,auth,marketplace,budget:{totals:()=>({})}});
 server.listen(0,'127.0.0.1');await once(server,'listening');config.origin='http://127.0.0.1:'+server.address().port;auth.origin=config.origin;
 async function request(path,{method='GET',body,token,headers={}}={}){const r=await fetch(config.origin+'/api/'+path,{method,headers:{Origin:config.origin,...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};}
 async function signIn(key){const account=privateKeyToAccount('0x'+key.repeat(32)),challenge=await request('auth/challenge',{method:'POST',body:{wallet:account.address}});
  const verified=await request('auth/verify',{method:'POST',body:{challengeId:challenge.body.id,signature:await account.signMessage({message:challenge.body.message})}});assert.equal(verified.status,200);return verified.body.token;}
 try{
  assert.equal((await request('me')).status,401);assert.equal((await request('health',{headers:{Origin:'https://evil.example'}})).status,403);
  const rebound=await new Promise((resolve,reject)=>get(config.origin+'/api/health',{headers:{Host:'evil.example'}},r=>{r.resume();r.on('end',()=>resolve(r.statusCode));}).on('error',reject));assert.equal(rebound,403);
  const a=await signIn('01'),b=await signIn('02');
  const input={title:'Synthetic vehicle',description:'Synthetic exterior panel',assetType:'car',city:'Bucharest',spots:[{name:'Rear panel',side:'rear',box:{x:.2,y:.2,width:.3,height:.2},suggestedPriceCents:'10',confidence:'low'}]};
  const created=await request('assets',{method:'POST',token:a,body:input});assert.equal(created.status,201);
  assert.equal((await request('me',{token:a})).body.dashboard.assets.length,1);assert.equal((await request('me',{token:b})).body.dashboard.assets.length,0);
  assert.equal((await request('assets/'+created.body.id,{method:'PATCH',token:b,body:{version:1,asset:input}})).status,404);
  assert.equal((await request('browse')).body.length,0);
  assert.equal((await request('auth/logout',{method:'POST',token:a})).status,200);assert.equal((await request('me',{token:a})).status,401);
 }finally{server.close();await once(server,'close');store.close();}
});
