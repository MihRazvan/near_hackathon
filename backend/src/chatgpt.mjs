import { open, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { readPrivateFile } from './config.mjs';
import { assert, sha256, AppError } from './core.mjs';

async function atomicCredentials(file,value){
 const temp=file+'.'+randomUUID()+'.tmp',handle=await open(temp,'wx',0o600);
 try{await handle.writeFile(JSON.stringify(value)+'\n');await handle.sync();}finally{await handle.close();}
 try{await rename(temp,file);const directory=await open(dirname(file),'r');try{await directory.sync();}finally{await directory.close();}}
 finally{await rm(temp,{force:true});}
}
const valid=c=>c&&c.issuer==='https://auth.openai.com'&&typeof c.subject==='string'&&c.client_id&&c.client_id!=='dynamic_agent_client'&&c.access_token&&c.refresh_token
 &&c.token_type?.toLowerCase()==='bearer'&&c.scopes?.includes('chatgpt.tokens.use.direct');

export class ChatGPT {
 constructor({credentialsFile,fetchImpl=fetch,now=Date.now,model='gpt-6-luna'}){Object.assign(this,{credentialsFile,fetch:fetchImpl,now,model});}
 async token(){
  let source=await readPrivateFile(this.credentialsFile),c=JSON.parse(source);
  assert(valid(c),'CHATGPT_SIGN_IN_REQUIRED','Connect ChatGPT plan access from the local sign-in page',401);
  const fresh=value=>Number.isFinite(value.expires_in)&&Date.parse(value.saved_at)+value.expires_in*1000>this.now()+60000;
  if(fresh(c))return c.access_token;
  assert(Number.isFinite(c.earliest_refresh_at)&&this.now()>=c.earliest_refresh_at*1000,'REFRESH_TOO_EARLY','ChatGPT session cannot be refreshed yet',429);
  const lockFile=this.credentialsFile+'.refresh.lock';let lock;
  try{lock=await open(lockFile,'wx',0o600);}catch(error){if(error.code==='EEXIST')throw new AppError('REFRESH_BUSY','Another refresh is active or needs reconciliation; reconnect ChatGPT if it was interrupted',409);throw error;}
  let release=true;
  try{
   source=await readPrivateFile(this.credentialsFile);c=JSON.parse(source);assert(valid(c),'CHATGPT_SIGN_IN_REQUIRED','ChatGPT session changed',401);
   if(fresh(c))return c.access_token;
   await lock.writeFile(JSON.stringify({credentialHash:sha256(source),startedAt:new Date(this.now()).toISOString()})+'\n');await lock.sync();
   let response;
   try{response=await this.fetch('https://auth.openai.com/api/accounts/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'refresh_token',client_id:c.client_id,refresh_token:c.refresh_token,resource:'https://api.openai.com/v1'}),signal:AbortSignal.timeout(30000)});}
   catch{release=false;throw new AppError('REFRESH_UNKNOWN','ChatGPT renewal was interrupted; reconnect before another renewal',503);}
   if(response.status>=500){release=false;throw new AppError('REFRESH_UNKNOWN','ChatGPT renewal outcome is unknown; reconnect before another renewal',503);}
   assert(response.ok,'CHATGPT_SIGN_IN_REQUIRED','ChatGPT session renewal was rejected; reconnect the account',401);
   release=false; // A 200 may rotate the refresh token. Do not silently retry if parsing or persistence fails.
   const tokens=await response.json(),scopes=typeof tokens.scope==='string'?tokens.scope.split(' '):c.scopes;
   assert(tokens.access_token&&tokens.refresh_token&&tokens.token_type?.toLowerCase()==='bearer'&&Number.isFinite(tokens.expires_in)&&tokens.expires_in>0
    &&Number.isFinite(tokens.earliest_refresh_at)&&scopes.includes('chatgpt.tokens.use.direct'),'INVALID_TOKEN_RESPONSE','ChatGPT did not return renewable plan access');
   assert(sha256(await readPrivateFile(this.credentialsFile))===sha256(source),'SESSION_CHANGED','ChatGPT sign-in changed during renewal');
   await atomicCredentials(this.credentialsFile,{...c,access_token:tokens.access_token,refresh_token:tokens.refresh_token,token_type:tokens.token_type,
    expires_in:tokens.expires_in,earliest_refresh_at:tokens.earliest_refresh_at,scopes,saved_at:new Date(this.now()).toISOString()});
   release=true;return tokens.access_token;
  }finally{await lock.close();if(release)await rm(lockFile,{force:true});}
 }
 async complete({instructions,input}){
  const token=await this.token(),headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
  let catalog;try{catalog=await this.fetch('https://api.openai.com/v1/models',{headers,signal:AbortSignal.timeout(15000)});}catch{throw new AppError('AI_UNAVAILABLE','Model catalog is unavailable',503);}
  assert(catalog.ok,'AI_UNAVAILABLE','ChatGPT model catalog is unavailable',503);
  const models=(await catalog.json()).models;
  assert(models?.some(m=>m.slug===this.model&&m.visibility==='list'),'MODEL_UNAVAILABLE','Selected model is not available to this ChatGPT account',409);
  let response;
  try{response=await this.fetch('https://api.openai.com/v1/responses',{method:'POST',headers,body:JSON.stringify({model:this.model,instructions,input,store:false,stream:true}),signal:AbortSignal.timeout(60000)});}
  catch{throw new AppError('AI_UNAVAILABLE','ChatGPT request was interrupted; no automatic retry was made',503);}
  assert(response.ok,'AI_REJECTED',`ChatGPT rejected the request (HTTP ${response.status})`,502);
  return consumeResponse(response.body);
 }
}

export async function consumeResponse(stream){
 const decoder=new TextDecoder();let buffer='',size=0,completed;
 function event(chunk){
  const data=chunk.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');
  if(!data||data==='[DONE]')return;
  let value;try{value=JSON.parse(data);}catch{throw new AppError('INVALID_AI_STREAM','ChatGPT returned an invalid event',502);}
  assert(!['response.failed','response.incomplete','error'].includes(value.type),'AI_INCOMPLETE','ChatGPT did not complete the request; check plan availability and try again later',502);
  if(value.type==='response.completed'){
   assert(value.response?.status==='completed','AI_INCOMPLETE','ChatGPT response was not complete',502);completed=value.response;
  }
 }
 try{for await(const chunk of stream){size+=chunk.length;assert(size<=1000000,'AI_RESPONSE_LIMIT','ChatGPT response exceeded the local size limit',502);
  buffer=(buffer+decoder.decode(chunk,{stream:true})).replace(/\r\n/g,'\n');let index;while((index=buffer.indexOf('\n\n'))>=0){event(buffer.slice(0,index));buffer=buffer.slice(index+2);}
 }}catch(error){if(error instanceof AppError)throw error;throw new AppError('AI_INTERRUPTED','ChatGPT stream ended unexpectedly; no automatic retry was made',502);}
 buffer+=decoder.decode();if(buffer.trim())event(buffer);
 assert(completed,'AI_INTERRUPTED','ChatGPT stream ended without a completed response',502);
 const text=completed.output?.filter(item=>item.type==='message').flatMap(item=>item.content??[]).filter(item=>item.type==='output_text').map(item=>item.text).join('')??'';
 assert(text.length>0,'EMPTY_AI_RESPONSE','ChatGPT returned no text',502);return {text,model:completed.model,usage:completed.usage??null};
}
