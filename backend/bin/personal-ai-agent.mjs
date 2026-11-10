#!/usr/bin/env node
import { open, mkdir, lstat, rename, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { setTimeout as pause } from 'node:timers/promises';
import { ROOT, readPrivateFile } from '../src/config.mjs';
import { ChatGPT } from '../src/chatgpt.mjs';
import { AssetAI } from '../src/asset-ai.mjs';
import { assert, sha256, hashObject, walletId } from '../src/core.mjs';
import { personalAiInput, personalAiResult } from '../src/personal-ai.mjs';

export function personalAgentOptions(env=process.env){
 let origin;try{origin=new URL(env.APP_PERSONAL_AI_ORIGIN);}catch{}
 assert(origin&&!origin.username&&!origin.password&&origin.pathname==='/'&&!origin.search&&!origin.hash,'PERSONAL_AI_ORIGIN','Set APP_PERSONAL_AI_ORIGIN to the exact hosted website origin.');
 const loopback=['localhost','127.0.0.1','[::1]'].includes(origin.hostname);
 assert(origin.protocol==='https:'||(origin.protocol==='http:'&&loopback&&env.APP_PERSONAL_AI_ALLOW_LOOPBACK==='1'),'PERSONAL_AI_HTTPS','Use HTTPS, or explicitly enable loopback-only local development.');
 const token=env.APP_PERSONAL_AI_TOKEN;
 assert(typeof token==='string'&&/^[A-Za-z0-9_-]{43,256}$/.test(token),'PERSONAL_AI_TOKEN','Configure a private personal AI pairing token with at least 256 bits.');
 const wallets=[...new Set((env.APP_PERSONAL_AI_WALLETS??'').split(',').map(s=>s.trim()).filter(Boolean).map(walletId))];
 assert(wallets.length>0&&wallets.length<=8,'PERSONAL_AI_WALLETS','Explicitly configure the personal wallet accounts this ChatGPT installation belongs to.');
 const options={origin:origin.origin,wallets,directory:resolve(env.APP_PERSONAL_AI_DIRECTORY??join(ROOT,'.local/personal-ai-agent')),credentialsFile:resolve(env.APP_CHATGPT_CREDENTIALS??join(ROOT,'.local/chatgpt-auth/credentials.json'))};
 Object.defineProperty(options,'token',{value:token});return options;
}
async function responseJSON(response,max){
 assert(response.ok,'PERSONAL_AI_SERVER','The private companion request was not accepted.');
 let size=0;const chunks=[];
 for await(const chunk of response.body){size+=chunk.length;assert(size<=max,'PERSONAL_AI_RESPONSE_LIMIT','The private companion response exceeded its size limit.');chunks.push(chunk);}
 let result;try{result=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{}
 assert(result&&typeof result==='object'&&!Array.isArray(result),'PERSONAL_AI_RESPONSE','The private companion response was not valid JSON.');return result;
}
export class PersonalAIAgent {
 constructor({options,ai,fetchImpl=fetch,now=Date.now}){
  Object.assign(this,{options,ai,fetch:fetchImpl,now});this.stopped=false;
 }
 async initialize(){
  await mkdir(this.options.directory,{recursive:true,mode:0o700});const stat=await lstat(this.options.directory);
  assert(stat.isDirectory()&&!stat.isSymbolicLink()&&(stat.mode&0o077)===0&&(!process.getuid||stat.uid===process.getuid()),'PERSONAL_AI_DIRECTORY','The local companion directory must be private to this user.');
 }
 async request(body,max=2900000){
  return responseJSON(await this.fetch(this.options.origin+'/api/personal-ai/agent',{method:'POST',headers:{Authorization:'Bearer '+this.options.token,'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(15000)}),max);
 }
 async save(file,value){
  const temp=file+'.'+randomUUID()+'.tmp',handle=await open(temp,'wx',0o600);
  try{await handle.writeFile(JSON.stringify(value)+'\n');await handle.sync();}finally{await handle.close();}
  try{await rename(temp,file);const directory=await open(this.options.directory,'r');try{await directory.sync();}finally{await directory.close();}}finally{await rm(temp,{force:true});}
 }
 async once(){
  const response=await this.request({action:'poll',wallets:this.options.wallets});if(!response.job)return false;
  const job=response.job;
  assert(typeof job.id==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(job.id)&&typeof job.leaseId==='string'&&/^[A-Za-z0-9_-]{43}$/.test(job.leaseId),'PERSONAL_AI_JOB','The job or original lease is invalid.');
  const owner=walletId(job.owner);assert(this.options.wallets.includes(owner),'PERSONAL_AI_OWNER','This request does not belong to the owner of this local ChatGPT installation.');
  assert(Date.parse(job.expiresAt)>this.now()&&Date.parse(job.expiresAt)<=this.now()+95000,'PERSONAL_AI_JOB_EXPIRED','The original request has expired.');
  const input=personalAiInput(job.input),file=join(this.options.directory,sha256(job.id)+'.json'),fingerprint=hashObject({id:job.id,owner,lease:sha256(job.leaseId),input});
  let previous;
  try{previous=JSON.parse(await readPrivateFile(file));}catch(error){if(error.code!=='ENOENT')throw error;}
  if(previous){
   assert(previous.fingerprint===fingerprint,'PERSONAL_AI_JOB_CHANGED','The original AI job changed. No further inference was requested.');
   await this.request({action:'complete',jobId:job.id,leaseId:job.leaseId,...(previous.result?{result:previous.result}:{error:'AI_UNCERTAIN'})},100000);return true;
  }
  const lock=await open(file,'wx',0o600);try{await lock.writeFile(JSON.stringify({fingerprint,status:'started'})+'\n');await lock.sync();}finally{await lock.close();}
  // Persist before inference. A restart may report uncertainty or replay a saved
  // result, but must never perform the original ChatGPT request twice.
  const directory=await open(this.options.directory,'r');try{await directory.sync();}finally{await directory.close();}
  let heartbeatBusy=false;
  const heartbeat=setInterval(()=>{if(heartbeatBusy||this.stopped)return;heartbeatBusy=true;void this.request({action:'poll',wallets:this.options.wallets,busy:true},100000).catch(()=>{}).finally(()=>{heartbeatBusy=false;});},10000);
  heartbeat.unref?.();let result;
  try{
   result=personalAiResult(await this.ai.draft(input));
   await this.save(file,{fingerprint,status:'completed',result});
  }catch{
   // Provider messages may contain user content. Send and log only a fixed code.
   await this.save(file,{fingerprint,status:'uncertain'});
  }finally{clearInterval(heartbeat);}
  await this.request({action:'complete',jobId:job.id,leaseId:job.leaseId,...(result?{result}:{error:'AI_UNCERTAIN'})},100000);return true;
 }
 async run({once=false}={}){
  await this.initialize();
  do{try{await this.once();}catch{if(once)throw new Error('The personal AI request could not complete. Its original inference will not be retried automatically.');}
   if(!once&&!this.stopped)await pause(2000);
  }while(!once&&!this.stopped);
 }
 stop(){this.stopped=true;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const options=personalAgentOptions(),provider=new ChatGPT({credentialsFile:options.credentialsFile}),agent=new PersonalAIAgent({options,ai:new AssetAI(provider)});
  await readPrivateFile(options.credentialsFile); // Check protected local storage before announcing availability.
  process.once('SIGINT',()=>agent.stop());process.once('SIGTERM',()=>agent.stop());
  console.log('Personal AI companion starting. Only your explicitly configured wallets can use this local ChatGPT connection.');
  await agent.run({once:process.argv.includes('--once')});
 }catch{console.error('Personal AI companion could not start or complete its original request. Check the private pairing configuration and local ChatGPT sign-in.');process.exitCode=1;}
}
