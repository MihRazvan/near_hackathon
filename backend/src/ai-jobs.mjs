import {assert,hashObject,text,walletId} from './core.mjs';
import {imageInput,validateDraft} from './asset-ai.mjs';

export class AIJobs {
 constructor({store,config,assetAI,personalAI,now=Date.now}){
  Object.assign(this,{store,config,assetAI,personalAI,now});this.running=new Map();
  for(const job of store.list('ai-job').filter(j=>j.status==='processing'))store.update('ai-job',job.id,job.owner,job.version,{...job,status:'uncertain',error:'The server restarted during this request. No automatic retry was made.'});
 }
 public(job){const {fingerprint,...result}=job;return result;}
 read(wallet,id){const r=this.store.get('ai-job',id);assert(r?.owner===walletId(wallet),'NOT_FOUND','AI request not found.',404);return this.public(r);}
 start(wallet,input){
  const actor=walletId(wallet),id=text(input.requestId,'request ID',80);
  assert(/^[a-zA-Z0-9_-]{16,80}$/.test(id),'INVALID_AI_REQUEST','Use a unique request ID.');
  const prompt=text(input.prompt,'vehicle description',3000),imageDataUrl=input.imageDataUrl;
  if(imageDataUrl)imageInput(imageDataUrl);
  const existing=input.existing?validateDraft(input.existing,{preserveIds:true,allowEmpty:true}):null;
  assert(!input.generateReference||!imageDataUrl,'INVALID_AI_REQUEST','Choose a photo or generate a reference.');
  const fingerprint=hashObject({actor,prompt,imageDataUrl:imageDataUrl??null,existing,generateReference:!!input.generateReference});
  const prior=this.store.get('ai-job',id);
  if(prior){assert(prior.owner===actor&&prior.fingerprint===fingerprint,'AI_REQUEST_CHANGED','This request ID belongs to different input.',409);return this.public(prior);}
  const provider=this.assetAI?.chatgpt;
  assert(this.assetAI||this.personalAI?.availability(actor),'AI_UNAVAILABLE','AI is offline. Continue with the manual editor.',503);
  assert(!input.generateReference||provider?.generateReference,'AI_IMAGE_UNAVAILABLE','Reference generation is offline. Upload a photo or start a manual layout.',503);
  assert(this.running.size<2,'AI_BUSY','AI is processing other vehicles. Try again shortly.',429);
  assert(!this.store.list('ai-job',actor).some(j=>j.status==='processing'),'AI_BUSY','Your previous request is still processing.',409);
  const day=new Date(this.now()).toISOString().slice(0,10),weight=input.generateReference?3:1;
  this.store.transaction(()=>{
   for(const [kind,key,owner,limit] of [['ai-quota',actor+'-'+day,actor,this.config.aiDailyLimit??5],['ai-quota-global','global-'+day,'platform',this.config.aiGlobalDailyLimit??100]]){
    const q=this.store.get(kind,key);assert((q?.count??0)+weight<=limit,'AI_QUOTA','AI capacity is used for now. Your draft can still be edited manually.',429);
    if(q)this.store.update(kind,key,owner,q.version,{count:q.count+weight});else this.store.insert(kind,key,owner,{count:weight});
   }
   this.store.db.prepare("DELETE FROM objects WHERE kind='ai-job' AND created_at<? AND json_extract(data,'$.status')!='processing'").run(new Date(this.now()-86400000).toISOString());
   assert(this.store.list('ai-job').length<150,'AI_BUSY','AI request history is full. Continue manually.',429);
   this.store.insert('ai-job',id,actor,{fingerprint,status:'processing',startedAt:new Date(this.now()).toISOString()});
  });
  const run=Promise.resolve().then(async()=>{
   try{
    const reference=input.generateReference?await provider.generateReference(prompt):null;
    if(reference){const current=this.store.get('ai-job',id);this.store.update('ai-job',id,actor,current.version,{...current,reference});}
    const image=reference?.imageDataUrl??imageDataUrl;
    const result=this.assetAI?await this.assetAI.draft({prompt,...(image?{imageDataUrl:image}:{}),...(existing?{existing}:{})}):await this.personalAI.draft(actor,{prompt,...(image?{imageDataUrl:image}:{})});
    const current=this.store.get('ai-job',id);this.store.update('ai-job',id,actor,current.version,{...current,status:'completed',reference:null,completedAt:new Date(this.now()).toISOString(),result:{...result,...reference}});
   }catch(error){const current=this.store.get('ai-job',id);this.store.update('ai-job',id,actor,current.version,{...current,status:'failed',error:'The AI request did not finish. Your saved layout is available to edit manually.',errorCode:error.code??'AI_UNAVAILABLE'});}
   finally{this.running.delete(id);}
  });this.running.set(id,run);return this.read(actor,id);
 }
}
