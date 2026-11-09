import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { generateKeyPair, SignJWT, createLocalJWKSet, exportJWK } from 'jose';
import { createAuthServer, validateIdentity } from '../src/chatgpt-auth.mjs';

test('OIDC identities require the expected issuer, issued client, subject and nonce',async()=>{
 const {publicKey,privateKey}=await generateKeyPair('RS256'),jwk=await exportJWK(publicKey),keys=createLocalJWKSet({keys:[{...jwk,kid:'test',alg:'RS256'}]});
 const token=await new SignJWT({nonce:'expected-nonce'}).setProtectedHeader({alg:'RS256',kid:'test'}).setIssuer('https://auth.openai.com').setAudience('issued-client').setSubject('test-user').setExpirationTime('5m').sign(privateKey);
 assert.equal((await validateIdentity(token,keys,'issued-client','expected-nonce')).subject,'test-user');
 await assert.rejects(validateIdentity(token,keys,'wrong-client','expected-nonce'));await assert.rejects(validateIdentity(token,keys,'issued-client','wrong-nonce'));
});
test('local OAuth setup requires same-origin CSRF, pins discovery endpoints and emits a scoped PKCE authorization request',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'everywhere-sign-in-'));let metadataRequests=0;
 // A fixed test listener differs from the production helper and never starts an OpenAI sign-in.
 const port=4399,origin='http://127.0.0.1:'+port;
 const server=await createAuthServer({directory,port,fetchImpl:async url=>{
  assert.equal(url,'https://auth.openai.com/.well-known/openid-configuration');metadataRequests++;
  return Response.json({issuer:'https://auth.openai.com',authorization_endpoint:'https://auth.openai.com/api/accounts/authorize',token_endpoint:'https://auth.openai.com/api/accounts/oauth/token',jwks_uri:'https://auth.openai.com/.well-known/jwks.json'});
 }});server.listen(port,'127.0.0.1');await once(server,'listening');
 try{
  const page=await fetch(origin),html=await page.text(),csrf=html.match(/name="csrf" value="([^"]+)"/)[1];
  assert.equal(page.headers.get('referrer-policy'),'same-origin');
  assert.equal((await fetch(origin+'/auth/start',{method:'POST',body:new URLSearchParams({csrf}),headers:{Origin:'https://other.example'},redirect:'manual'})).status,403);
  assert.equal((await fetch(origin+'/auth/start',{method:'POST',body:new URLSearchParams({csrf:'wrong'}),headers:{Origin:origin},redirect:'manual'})).status,403);
  const start=await fetch(origin+'/auth/start',{method:'POST',body:new URLSearchParams({csrf}),headers:{Origin:origin},redirect:'manual'});assert.equal(start.status,303);
  const authorize=new URL(start.headers.get('location'));assert.equal(authorize.origin,'https://auth.openai.com');assert.equal(authorize.searchParams.get('code_challenge_method'),'S256');
  assert.equal(authorize.searchParams.get('resource'),'https://api.openai.com/v1');assert.ok(authorize.searchParams.get('scope').includes('chatgpt.tokens.use.direct'));assert.ok(authorize.searchParams.get('code_challenge'));
  assert.equal(metadataRequests,1);assert.equal((await fetch(origin+'/auth/callback?state=wrong&code=fake')).status,400);
 }finally{server.close();await once(server,'close');await rm(directory,{recursive:true,force:true});}
});
