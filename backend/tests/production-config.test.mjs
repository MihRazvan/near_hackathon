import test from 'node:test';import assert from 'node:assert/strict';
import{configFromEnv,loadConfig}from'../src/config.mjs';
const production={APP_ENV:'production',APP_ORIGIN:'https://everywhere.example',APP_STATE_DIR:'/data/everywhere'};
test('production configuration requires explicit HTTPS origins and persistent state',()=>{
 assert.throws(()=>configFromEnv({APP_ENV:'production'}),{code:'ORIGIN_REQUIRED'});
 assert.throws(()=>configFromEnv({...production,APP_ORIGIN:'http://everywhere.example'}),{code:'HTTPS_REQUIRED'});
 assert.throws(()=>configFromEnv({...production,APP_ORIGIN:'https://everywhere.example/path'}),{code:'INVALID_ORIGIN'});
 assert.throws(()=>configFromEnv({...production,APP_STATE_DIR:'relative'}),{code:'PERSISTENT_STATE_REQUIRED'});
 const c=configFromEnv({...production,PORT:'8080'});assert.equal(c.host,'0.0.0.0');assert.equal(c.port,8080);assert.equal(c.origin,'https://everywhere.example');assert.equal(c.apiOrigin,c.origin);
});
test('production never enables customer test signers or serializes operator credentials',()=>{
 const c=configFromEnv({...production,INTEGRATION_ALLOW_FUNDED_BROWSER_WALLETS:'true',INTEGRATION_BUYER_A_PRIVATE_KEY:'must-not-load',INTEGRATION_NEAR_PRIVATE_KEY:'operator-secret'});
 assert.equal(c.allowFundedWallets,false);assert.equal(c.keys.buyerA,null);assert.equal(c.keys.near,'operator-secret');assert.equal(JSON.stringify(c).includes('operator-secret'),false);
});
test('hosted config does not discover a developer private file and supports a distinct API origin',async()=>{
 const c=await loadConfig(undefined,{...production,APP_API_ORIGIN:'https://api.everywhere.example'});assert.equal(c.enabled,false);assert.equal(c.keys.near,null);assert.deepEqual(c.allowedOrigins,['https://everywhere.example','https://api.everywhere.example']);
 assert.throws(()=>configFromEnv({...production,INTEGRATION_ALLOW_MAINNET:'true'}),{code:'OPERATOR_NOT_CONFIGURED'});
});
