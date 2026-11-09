import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ChatGPT, consumeResponse } from '../src/chatgpt.mjs';
import { validateDraft, imageInput, AssetAI } from '../src/asset-ai.mjs';

const completed=text=>({type:'response.completed',response:{status:'completed',model:'gpt-6-luna',output:[{type:'message',content:[{type:'output_text',text}]}],usage:{input_tokens:1,output_tokens:1}}});
async function* chunks(text){const bytes=Buffer.from(text);for(let i=0;i<bytes.length;i++)yield bytes.subarray(i,i+1);}
test('stream consumption handles chunk boundaries and requires terminal completion; late usage failures never become success',async()=>{
 const good='data: '+JSON.stringify(completed('Vehicle 🚗'))+'\r\n\r\n';assert.equal((await consumeResponse(chunks(good))).text,'Vehicle 🚗');
 for(const events of [[{type:'response.output_text.delta',delta:'looks done'}],[{type:'response.failed'}],[{type:'response.incomplete'}],[completed('draft'),{type:'error'}]]){
  await assert.rejects(consumeResponse(chunks(events.map(e=>'data: '+JSON.stringify(e)+'\n\n').join(''))));
 }
});
test('renewal uses the issued client and original resource, rotates credentials atomically, and never serializes bearer tokens',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'everywhere-oauth-')),file=join(dir,'credentials.json'),now=Date.now();let refreshes=0;
 const credentials={issuer:'https://auth.openai.com',subject:'test-user',client_id:'issued-test-client',access_token:'expired-test-access',refresh_token:'old-test-refresh',token_type:'bearer',
  scopes:['chatgpt.tokens.use.direct'],saved_at:new Date(now-7200000).toISOString(),expires_in:3600,earliest_refresh_at:Math.floor(now/1000)-10};
 try{
  await writeFile(file,JSON.stringify(credentials),{mode:0o600});
  const ai=new ChatGPT({credentialsFile:file,fetchImpl:async(url,options)=>{
   if(url.endsWith('/oauth/token')){refreshes++;assert.equal(options.body.get('client_id'),'issued-test-client');assert.equal(options.body.get('resource'),'https://api.openai.com/v1');assert.equal(options.body.has('scope'),false);
    return Response.json({access_token:'fresh-test-access',refresh_token:'new-test-refresh',token_type:'bearer',expires_in:3600,earliest_refresh_at:Math.floor(now/1000)+30,scope:'chatgpt.tokens.use.direct'});}
   assert.equal(options.headers.Authorization,'Bearer fresh-test-access');
   if(url.endsWith('/models'))return Response.json({models:[{slug:'gpt-6-luna',visibility:'list'}]});
   const body=JSON.parse(options.body);assert.equal(body.store,false);assert.equal(body.stream,true);assert.ok(Array.isArray(body.input));assert.equal('max_output_tokens'in body,false);
   return new Response('data: '+JSON.stringify(completed('READY'))+'\n\n');
  }});
  assert.equal((await ai.complete({instructions:'test',input:[{role:'user',content:'test'}]})).text,'READY');
  assert.equal(await ai.token(),'fresh-test-access');assert.equal(refreshes,1);assert.equal(JSON.stringify(ai).includes('fresh-test-access'),false);
  assert.equal(JSON.parse(await readFile(file)).refresh_token,'new-test-refresh');
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('an interrupted rotating-token renewal stays locked and cannot be retried blindly',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'everywhere-oauth-fail-')),file=join(dir,'credentials.json'),now=Date.now();let attempts=0;
 try{await writeFile(file,JSON.stringify({issuer:'https://auth.openai.com',subject:'test',client_id:'issued',access_token:'test',refresh_token:'test',token_type:'bearer',scopes:['chatgpt.tokens.use.direct'],saved_at:new Date(now-7200000).toISOString(),expires_in:3600,earliest_refresh_at:0}),{mode:0o600});
  const ai=new ChatGPT({credentialsFile:file,fetchImpl:async()=>{attempts++;throw Error('network timeout');}});
  await assert.rejects(ai.token(),/interrupted/);await assert.rejects(ai.token(),/refresh is active/);assert.equal(attempts,1);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('AI drafts stay editable and unmeasured; invalid geometry, prices and disguised image content are rejected',async()=>{
 const draft={title:'Test vehicle',description:'Synthetic description',assetType:'car',assumptions:['Verify dimensions'],spots:[{name:'Rear panel',side:'rear',box:{x:0.2,y:0.4,width:0.3,height:0.2},suggestedPriceCents:'100',confidence:'low'}]};
 const result=validateDraft(draft);assert.equal(result.requiresOwnerApproval,true);assert.equal(result.spots[0].dimensionsCm,null);
 for(const change of [d=>d.spots[0].box.width=1,d=>d.spots[0].suggestedPriceCents='1.1',d=>d.spots[0].side='windshield']){const bad=structuredClone(draft);change(bad);assert.throws(()=>validateDraft(bad));}
 assert.throws(()=>imageInput('data:image/png;base64,'+Buffer.from('not a picture').toString('base64')));
 const ai=new AssetAI({complete:async()=>({text:JSON.stringify(draft),model:'test',usage:null})});assert.equal((await ai.draft({prompt:'Synthetic car'})).draft.spots.length,1);
});
