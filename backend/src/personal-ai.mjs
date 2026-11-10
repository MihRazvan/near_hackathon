import { randomUUID, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { setTimeout as pause } from 'node:timers/promises';
import { assert, AppError, text, walletId, canonical, hashObject, sha256 } from './core.mjs';
import { imageInput, validateDraft } from './asset-ai.mjs';

// This queue carries one person's requests to their own local ChatGPT installation.
// OAuth credentials never enter this service. A lease is issued exactly once.
export const personalAiTokenEqual=(provided,expected)=>{
 const digest=value=>createHash('sha256').update(typeof value==='string'?value:'').digest();
 const same=timingSafeEqual(digest(provided),digest(expected));
 return same&&typeof provided==='string'&&typeof expected==='string'&&expected.length>=43&&expected.length<=256;
};
export function personalAiInput(value){
 assert(value&&typeof value==='object'&&!Array.isArray(value),'INVALID_AI_INPUT','Describe the space you want to add.',400);
 const prompt=text(value.prompt,'vehicle description',3000),result={prompt};
 if(value.imageDataUrl!==undefined&&value.imageDataUrl!==null&&value.imageDataUrl!==''){
  assert(typeof value.imageDataUrl==='string'&&value.imageDataUrl.length<=2700000,'IMAGE_LIMIT','Image must be at most 2 MB.',400);
  result.imageDataUrl=imageInput(value.imageDataUrl).dataUrl;
 }
 return result;
}
export function personalAiResult(value){
 assert(value&&typeof value==='object'&&!Array.isArray(value),'INVALID_AI_RESULT','The local AI did not return a draft.',502);
 assert(Buffer.byteLength(JSON.stringify(value))<=100000,'AI_RESPONSE_LIMIT','The local AI result is too large.',502);
 const draft=validateDraft(value.draft),model=text(value.model,'model',100),usage={};
 if(value.usage&&typeof value.usage==='object')for(const key of ['input_tokens','output_tokens','total_tokens']){
  const count=value.usage[key];if(Number.isSafeInteger(count)&&count>=0&&count<=10000000)usage[key]=count;
 }
 return {draft,model,usage:Object.keys(usage).length?usage:null};
}
export class PersonalAI {
 constructor({store,config,now=Date.now,waitMs=90000,pollMs=250,heartbeatMs=35000,leaseMs=85000,retentionMs=900000}){
  Object.assign(this,{store,now,waitMs:Math.min(waitMs,90000),pollMs,heartbeatMs,leaseMs,retentionMs});
  Object.defineProperty(this,'token',{value:config.keys?.personalAi??''});
  this.wallets=new Set((config.personalAiWallets??[]).map(walletId));
  store.db.exec(`CREATE TABLE IF NOT EXISTS personal_ai_jobs(id TEXT PRIMARY KEY,wallet TEXT NOT NULL,fingerprint TEXT NOT NULL,input TEXT,status TEXT NOT NULL,created_ms INTEGER NOT NULL,expires_ms INTEGER NOT NULL,lease_hash TEXT,lease_until INTEGER,result TEXT,error_code TEXT);
   CREATE INDEX IF NOT EXISTS personal_ai_wallet ON personal_ai_jobs(wallet,created_ms);
   CREATE TABLE IF NOT EXISTS personal_ai_presence(id INTEGER PRIMARY KEY CHECK(id=1),seen_ms INTEGER NOT NULL,wallets TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS personal_ai_quota(day INTEGER PRIMARY KEY,total INTEGER NOT NULL);`);
 }
 availability(wallet){
  if(!this.wallets.has(wallet)||!personalAiTokenEqual(this.token,this.token))return false;
  const presence=this.store.db.prepare('SELECT * FROM personal_ai_presence WHERE id=1').get();
  return !!presence&&presence.seen_ms<=this.now()&&this.now()-presence.seen_ms<this.heartbeatMs&&JSON.parse(presence.wallets).includes(wallet);
 }
 expire(){
  const now=this.now();
  this.store.db.prepare("UPDATE personal_ai_jobs SET status=CASE WHEN status='leased' THEN 'uncertain' ELSE 'failed' END,error_code=CASE WHEN status='leased' THEN 'AI_UNCERTAIN' ELSE 'AI_EXPIRED' END,input=NULL WHERE status IN ('queued','leased') AND (expires_ms<=? OR (lease_until IS NOT NULL AND lease_until<=?))").run(now,now);
  this.store.db.prepare("DELETE FROM personal_ai_jobs WHERE status IN ('completed','failed','uncertain') AND created_ms<?").run(now-this.retentionMs);
 }
 async draft(wallet,input){
  wallet=walletId(wallet);
  assert(this.wallets.has(wallet),'PERSONAL_AI_FORBIDDEN','This personal AI connection is available only to its owner. You can upload a photo or describe your space manually.',403);
  const validated=personalAiInput(input),fingerprint=hashObject({wallet,input:validated});
  let job=this.store.transaction(()=>{
   this.expire();const prior=this.store.db.prepare('SELECT * FROM personal_ai_jobs WHERE wallet=? AND fingerprint=? ORDER BY created_ms DESC LIMIT 1').get(wallet,fingerprint);
   if(prior)return prior;
   assert(this.availability(wallet),'PERSONAL_AI_OFFLINE','Your personal AI companion is offline. Add the space manually or reconnect the companion on your computer.',503);
   assert(!this.store.db.prepare("SELECT id FROM personal_ai_jobs WHERE wallet=? AND status IN ('queued','leased')").get(wallet),'PERSONAL_AI_BUSY','Your previous draft is still being checked. Please wait before requesting another.',409);
   const day=Math.floor(this.now()/86400000);
   assert((this.store.db.prepare('SELECT total FROM personal_ai_quota WHERE day=?').get(day)?.total??0)<100,'PERSONAL_AI_LIMIT','The personal AI request limit has been reached. Add the space manually for now.',429);
   this.store.db.prepare('INSERT INTO personal_ai_quota(day,total) VALUES(?,1) ON CONFLICT(day) DO UPDATE SET total=total+1').run(day);
   this.store.db.prepare('DELETE FROM personal_ai_quota WHERE day<?').run(day-2);
   const id=randomUUID(),created=this.now();this.store.db.prepare("INSERT INTO personal_ai_jobs(id,wallet,fingerprint,input,status,created_ms,expires_ms) VALUES(?,?,?,?,'queued',?,?)").run(id,wallet,fingerprint,canonical(validated),created,created+this.waitMs);
   return this.store.db.prepare('SELECT * FROM personal_ai_jobs WHERE id=?').get(id);
  });
  const deadline=Date.now()+this.waitMs;
  while(true){
   if(job.status==='completed')return JSON.parse(job.result);
   if(['failed','uncertain'].includes(job.status))throw new AppError(job.error_code??'AI_UNAVAILABLE',job.status==='uncertain'?'The original AI request was interrupted. No automatic retry was made; use the manual editor for this space.':'The local AI could not complete this draft. You can add the space manually.',503);
   if(Date.now()>=deadline){
    this.store.db.prepare("UPDATE personal_ai_jobs SET status=CASE WHEN status='leased' THEN 'uncertain' ELSE 'failed' END,error_code=CASE WHEN status='leased' THEN 'AI_UNCERTAIN' ELSE 'AI_EXPIRED' END,input=NULL WHERE id=? AND status IN ('queued','leased')").run(job.id);
   }else await pause(this.pollMs);
   this.expire();job=this.store.db.prepare('SELECT * FROM personal_ai_jobs WHERE id=?').get(job.id);
   assert(job,'AI_EXPIRED','The AI draft expired. Add the space manually.',503);
  }
 }
 agent(body,token){
  assert(personalAiTokenEqual(token,this.token),'PERSONAL_AI_UNAUTHORIZED','The personal AI companion could not authenticate.',401);
  assert(body&&typeof body==='object'&&!Array.isArray(body),'INVALID_AI_AGENT','Invalid companion request.',400);
  if(body.action==='poll')return this.store.transaction(()=>{
   this.expire();assert(Array.isArray(body.wallets)&&body.wallets.length>0&&body.wallets.length<=8,'INVALID_AI_AGENT','Configure the personal wallets this local companion belongs to.',400);
   const wallets=[...new Set(body.wallets.map(walletId))];assert(wallets.every(wallet=>this.wallets.has(wallet)),'PERSONAL_AI_FORBIDDEN','This companion may serve only its configured personal wallets.',403);
   this.store.db.prepare('INSERT INTO personal_ai_presence(id,seen_ms,wallets) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET seen_ms=excluded.seen_ms,wallets=excluded.wallets').run(this.now(),canonical(wallets));
   if(body.busy===true||this.store.db.prepare("SELECT id FROM personal_ai_jobs WHERE status='leased'").get())return {job:null};
   const job=this.store.db.prepare("SELECT * FROM personal_ai_jobs WHERE status='queued' ORDER BY created_ms,id").all().find(row=>wallets.includes(row.wallet));
   if(!job)return {job:null};
   const leaseId=randomBytes(32).toString('base64url'),until=Math.min(job.expires_ms,this.now()+this.leaseMs);
   this.store.db.prepare("UPDATE personal_ai_jobs SET status='leased',lease_hash=?,lease_until=? WHERE id=? AND status='queued'").run(sha256(leaseId),until,job.id);
   return {job:{id:job.id,owner:job.wallet,leaseId,input:JSON.parse(job.input),expiresAt:new Date(until).toISOString()}};
  });
  assert(body.action==='complete','INVALID_AI_AGENT','Unknown companion action.',400);
  return this.store.transaction(()=>{
   this.expire();const job=this.store.db.prepare('SELECT * FROM personal_ai_jobs WHERE id=?').get(typeof body.jobId==='string'?body.jobId:'');
   assert(job&&typeof body.leaseId==='string'&&body.leaseId.length<=256&&job.lease_hash&&personalAiTokenEqual(sha256(body.leaseId),job.lease_hash),'INVALID_AI_LEASE','The original AI request lease does not match.',409);
   if(job.status==='completed')return {accepted:true};
   assert(job.status==='leased'&&job.lease_until>this.now()&&job.expires_ms>this.now(),'AI_LEASE_EXPIRED','The original AI request expired. It will not be issued again.',409);
   if(body.error){
    this.store.db.prepare("UPDATE personal_ai_jobs SET status='uncertain',error_code='AI_UNCERTAIN',input=NULL WHERE id=?").run(job.id);return {accepted:true};
   }
   let result;
   try{result=personalAiResult(body.result);}catch(error){this.store.db.prepare("UPDATE personal_ai_jobs SET status='failed',error_code='INVALID_AI_DRAFT',input=NULL WHERE id=?").run(job.id);return {accepted:false,error:'INVALID_AI_DRAFT'};}
   this.store.db.prepare("UPDATE personal_ai_jobs SET status='completed',result=?,input=NULL WHERE id=?").run(canonical(result),job.id);return {accepted:true};
  });
 }
}
