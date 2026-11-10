import { assert, sha256, walletId, AppError } from './core.mjs';
import { imageInput } from './asset-ai.mjs';

function validateBytes(bytes,mime){
 assert(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=1000000,'MEDIA_LIMIT','Public artifact must be between 1 byte and 1 MB',400);
 if(['image/png','image/jpeg'].includes(mime))imageInput(`data:${mime};base64,${bytes.toString('base64')}`);
 else if(mime==='application/json'){let value;try{value=JSON.parse(bytes.toString('utf8'));}catch{}assert(value&&typeof value==='object','INVALID_MEDIA','Invalid JSON artifact',400);}
 else if(mime==='application/pdf')assert(bytes.subarray(0,5).toString()==='%PDF-','INVALID_MEDIA','Invalid PDF header',400);
 else assert(mime==='text/plain'&&!bytes.includes(0),'INVALID_MEDIA','Use PNG, JPEG, PDF, JSON or plain text',400);
}
export class Media {
 constructor({store,token,fetchImpl=fetch,maxFiles=20}){Object.assign(this,{store,fetch:fetchImpl,maxFiles});Object.defineProperty(this,'token',{value:token});}
 async upload({owner,bytes,mime,publicContentAcknowledged=false}){
  assert(publicContentAcknowledged===true,'PUBLIC_CONTENT_REQUIRED','Confirm that this artifact is intended for public IPFS storage',400);
  const wallet=walletId(owner);validateBytes(bytes,mime);const digest=sha256(bytes),id=sha256(wallet+'\0'+digest);
  let record=this.store.get('media',id);
  if(record){assert(record.owner===wallet&&record.sha256===digest&&record.mime===mime,'MEDIA_CHANGED','Artifact identity changed');
   if(record.status==='verified')return record;
   assert(record.status==='uploaded','UPLOAD_UNKNOWN','Earlier upload needs reconciliation before another upload');return this.verify(record);
  }
  assert(this.token,'MEDIA_NOT_CONFIGURED','Connect the local Pinata integration first',503);
  this.store.transaction(()=>{
   assert(this.store.list('media').length<this.maxFiles,'MEDIA_QUOTA','Local integration upload limit reached',429);
   record=this.store.insert('media',id,wallet,{sha256:digest,bytes:bytes.length,mime,status:'upload-unknown',public:true});
  });
  const form=new FormData();form.set('network','public');form.set('file',new Blob([bytes],{type:mime}),'artifact');
  form.set('name','everywhere-'+id);form.set('keyvalues',JSON.stringify({upload_id:id,sha256:digest}));
  let response;try{response=await this.fetch('https://uploads.pinata.cloud/v3/files',{method:'POST',headers:{Authorization:'Bearer '+this.token},body:form,signal:AbortSignal.timeout(30000)});}
  catch{throw new AppError('UPLOAD_UNKNOWN','Public upload outcome is unknown; no automatic upload retry was made',503);}
  assert(response.ok,'UPLOAD_UNKNOWN',`Public upload needs reconciliation (HTTP ${response.status})`,502);
  const result=(await response.json()).data;
  assert(result&&typeof result.id==='string'&&/^baf[a-z2-7]{30,120}$/.test(result.cid)&&result.size===bytes.length,'INVALID_UPLOAD','Pinning provider returned invalid artifact metadata',502);
  record=this.store.update('media',id,wallet,record.version,{...record,status:'uploaded',fileId:result.id,cid:result.cid,uri:'ipfs://'+result.cid});
  return this.verify(record);
 }
 async reuseVerified({owner,uri,publicContentAcknowledged=false}){
  assert(publicContentAcknowledged===true,'PUBLIC_CONTENT_REQUIRED','Confirm that this artifact is intended for public use');
  assert(typeof uri==='string'&&/^ipfs:\/\/baf[a-z2-7]{30,120}$/.test(uri),'INVALID_MEDIA','Paste an IPFS link to an artifact already verified by this platform');
  const wallet=walletId(owner),source=this.store.list('media').find(m=>m.uri===uri&&m.public===true&&m.status==='verified');
  assert(source,'VERIFIED_ARTIFACT_REQUIRED','This IPFS link has not been verified here. Upload its file or create a text artifact instead');
  const id=sha256(wallet+'\0'+source.sha256),prior=this.store.get('media',id);
  if(prior){assert(prior.sha256===source.sha256&&prior.uri===uri&&prior.mime===source.mime,'MEDIA_CHANGED','Existing artifact metadata differs');return prior.status==='verified'?prior:this.verify(prior);}
  assert(this.store.list('media').length<this.maxFiles,'MEDIA_QUOTA','Local integration artifact limit reached',429);
  const record=this.store.insert('media',id,wallet,{sha256:source.sha256,bytes:source.bytes,mime:source.mime,public:true,status:'uploaded',fileId:source.fileId,cid:source.cid,uri});
  return this.verify(record);
 }
 async verify(record){
  assert(record?.status==='uploaded'&&record.public===true,'INVALID_MEDIA','An uploaded public artifact is required');
  let response;try{response=await this.fetch('https://api.pinata.cloud/v3/files/public/'+encodeURIComponent(record.fileId),{headers:{Authorization:'Bearer '+this.token},signal:AbortSignal.timeout(15000)});}
  catch{throw new AppError('MEDIA_UNAVAILABLE','Pinning metadata is temporarily unavailable',503);}
  assert(response.ok,'MEDIA_UNAVAILABLE','Pinning metadata is unavailable',503);
  const metadata=(await response.json()).data;
  assert(metadata?.id===record.fileId&&metadata.cid===record.cid&&metadata.size===record.bytes,'MEDIA_CHANGED','Pinned metadata differs from the uploaded artifact');
  let gateway;try{gateway=await this.fetch('https://gateway.pinata.cloud/ipfs/'+record.cid,{redirect:'error',signal:AbortSignal.timeout(20000)});}
  catch{throw new AppError('MEDIA_UNAVAILABLE','Public artifact retrieval is temporarily unavailable',503);}
  assert(gateway.ok,'MEDIA_UNAVAILABLE','Public artifact is not yet retrievable',503);
  let size=0;const parts=[];for await(const part of gateway.body){size+=part.length;assert(size<=record.bytes,'MEDIA_CHANGED','Retrieved artifact is larger than the upload');parts.push(part);}
  assert(size===record.bytes&&sha256(Buffer.concat(parts))===record.sha256,'MEDIA_CHANGED','Retrieved artifact hash differs from the upload');
  return this.store.update('media',record.id,record.owner,record.version,{...record,status:'verified',verifiedAt:new Date().toISOString()});
 }
}
