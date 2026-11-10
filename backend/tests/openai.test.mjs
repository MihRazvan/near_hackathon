import test from 'node:test';import assert from 'node:assert/strict';import{OpenAI}from'../src/openai.mjs';
test('public scanning uses only its dedicated API credential with bounded output and no stored responses',async()=>{
 let calls=0;const client=new OpenAI({apiKey:'test-public-key',fetchImpl:async(url,request)=>{calls++;assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(request.headers.Authorization,'Bearer test-public-key');const body=JSON.parse(request.body);assert.equal(body.store,false);assert.equal(body.max_output_tokens,3500);assert.equal(body.input[0].role,'user');return {ok:true,json:async()=>({status:'completed',model:'test',output:[{type:'message',content:[{type:'output_text',text:'draft'}]}]})};}});
 assert.equal((await client.complete({instructions:'draft',input:[{role:'user',content:'car'}]})).text,'draft');assert.equal(calls,1);
});
test('unconfigured, incomplete and unavailable scans cannot become successful drafts or retry requests',async()=>{
 await assert.rejects(new OpenAI({}).complete({}),{code:'AI_UNAVAILABLE'});let calls=0;
 const client=new OpenAI({apiKey:'test',fetchImpl:async()=>{calls++;return {ok:true,json:async()=>({status:'incomplete'})};}});await assert.rejects(client.complete({}),{code:'AI_INCOMPLETE'});assert.equal(calls,1);
 const down=new OpenAI({apiKey:'test',fetchImpl:async()=>{throw new Error('network');}});await assert.rejects(down.complete({}),{code:'AI_UNAVAILABLE'});
});
