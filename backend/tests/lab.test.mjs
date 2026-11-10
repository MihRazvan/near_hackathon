import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { IntegrationLab } from '../src/lab.mjs';
import { httpApp } from '../src/http.mjs';
import { Auth } from '../src/auth.mjs';
import { Store } from '../src/store.mjs';

test('mainnet lab serves isolated static files with a fresh connector nonce and never exposes test signing controls',async()=>{
 const store=new Store(),config={origin:'http://127.0.0.1:0',network:'mainnet',enabled:false};
 const auth=new Auth(store,{origin:config.origin}),lab=new IntegrationLab({config,store,auth,testSecretKey:'must-not-be-returned',testWallets:[{label:'hidden',address:'test.near'}]});
 const server=httpApp({config,store,auth,lab});server.listen(0,'127.0.0.1');await once(server,'listening');config.origin='http://127.0.0.1:'+server.address().port;
 try{
  const response=await fetch(config.origin+'/lab'),html=await response.text(),csp=response.headers.get('content-security-policy');assert.equal(response.status,200);
  const nonce=html.match(/name="lab-csp-nonce" content="([A-Za-z0-9+/=]+)"/)[1];assert.ok(csp.includes("'nonce-"+nonce+"'"));assert.ok(csp.includes('wss://mc.meteorwallet.app'));assert.ok(csp.includes("font-src 'self' data:"));assert.equal(html.includes('must-not-be-returned'),false);
  const second=await fetch(config.origin+'/lab');assert.notEqual(second.headers.get('content-security-policy'),csp);
  const publicConfig=await (await fetch(config.origin+'/api/lab-config')).json();assert.deepEqual(publicConfig.wallets,[]);assert.equal(publicConfig.sandbox,false);assert.equal('testSecretKey' in publicConfig,false);
  assert.throws(()=>lab.testAccount('test.near'),{code:'SANDBOX_ONLY'});
  const signed=await fetch(config.origin+'/api/lab-wallet/sign-in',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(signed.status,401);
  const traversal=await fetch(config.origin+'/lab/../../.local/integration.env');assert.notEqual(traversal.status,200);
 }finally{server.close();await once(server,'close');store.close();}
});
test('Sandbox clock advances cannot discard an unresolved wallet request',async()=>{
 const store=new Store(),now=1800000000000;
 store.insert('sale','sale','seller.sandbox',{arbiterId:'arbiter.sandbox',schedule:{biddingClose:new Date(now+60000).toISOString()}});
 store.insert('wallet-request','unknown','seller.sandbox',{kind:'native',planId:'unknown-plan',status:'requested'});
 let advanced=false;
 const lab=new IntegrationLab({config:{network:'sandbox'},store,clock:{now:()=>now},testWallets:[{address:'seller.sandbox'}],walletRequests:{reconcile:async()=>({status:'requested'})}});
 lab.resumeClock=()=>{advanced=true;};
 try{await assert.rejects(lab.advance('seller.sandbox',{saleId:'sale',stage:'biddingClose'}),{code:'RECONCILIATION_REQUIRED'});assert.equal(advanced,false);assert.equal(store.get('lab-clock','current'),null);}
 finally{store.close();}
});
