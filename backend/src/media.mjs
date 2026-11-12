import { assert, sha256, walletId, AppError } from './core.mjs';

const PNG_MAGIC=Buffer.from([137,80,78,71,13,10,26,10]);
const CID=/^baf[a-z2-7]{30,120}$/;
const validPinnedSize=(size,bytes,max)=>Number.isSafeInteger(size)&&size>=bytes&&size<=max*2;
function validateBytes(bytes,mime,maxBytes){
 assert(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=maxBytes,'MEDIA_LIMIT',`Public artifact must be between 1 byte and ${maxBytes} bytes`,400);
 if(mime==='image/png')assert(bytes.subarray(0,8).equals(PNG_MAGIC),'INVALID_IMAGE','Image content does not match PNG',400);
 else if(mime==='image/jpeg')assert(bytes[0]===255&&bytes[1]===216&&bytes[2]===255,'INVALID_IMAGE','Image content does not match JPEG',400);
 else if(mime==='application/json'){let value;try{value=JSON.parse(bytes.toString('utf8'));}catch{}assert(value&&typeof value==='object','INVALID_MEDIA','Invalid JSON artifact',400);}
 else if(mime==='application/pdf')assert(bytes.subarray(0,5).toString()==='%PDF-','INVALID_MEDIA','Invalid PDF header',400);
 else assert(mime==='text/plain'&&!bytes.includes(0),'INVALID_MEDIA','Use PNG, JPEG, PDF, JSON or plain text',400);
}
export class Media {
 constructor({store,token,fetchImpl=fetch,maxFiles=20,maxBytes=1000000,maxTotalBytes=Math.min(1000000000,maxFiles*maxBytes)}){
  assert(Number.isSafeInteger(maxFiles)&&maxFiles>0&&Number.isSafeInteger(maxBytes)&&maxBytes>0&&maxBytes<=20000000
   &&Number.isSafeInteger(maxTotalBytes)&&maxTotalBytes>0&&maxTotalBytes<=1000000000,'INVALID_MEDIA_LIMIT','Media limits must be positive bounded integers');
  Object.assign(this,{store,fetch:fetchImpl,maxFiles,maxBytes,maxTotalBytes});Object.defineProperty(this,'token',{value:token});
 }
 // BEGIN IMMEDIATE serializes this check with the reservation across processes.
 // Unknown uploads retain their full reservation. Public aliases share one digest
 // reservation while continuing to count toward the existing record-count quota.
 reserveQuota(records,digest,bytes){
  assert(records.length<this.maxFiles,'MEDIA_QUOTA','Public artifact limit reached',429);
  const unique=new Map();
  for(const record of records){
   assert(typeof record.sha256==='string'&&/^[0-9a-f]{64}$/.test(record.sha256)&&Number.isSafeInteger(record.bytes)&&record.bytes>0,'MEDIA_CHANGED','Stored artifact reservation is invalid');
   unique.set(record.sha256,Math.max(unique.get(record.sha256)??0,record.bytes));
  }
  const used=[...unique.values()].reduce((sum,size)=>sum+size,0);
  assert(used+(unique.has(digest)?Math.max(0,bytes-unique.get(digest)):bytes)<=this.maxTotalBytes,'MEDIA_STORAGE_QUOTA','Public artifact storage limit reached',429);
 }
 async upload({owner,bytes,mime,publicContentAcknowledged=false}){
  assert(publicContentAcknowledged===true,'PUBLIC_CONTENT_REQUIRED','Confirm that this artifact is intended for public IPFS storage',400);
  const wallet=walletId(owner);validateBytes(bytes,mime,this.maxBytes);const digest=sha256(bytes),id=sha256(wallet+'\0'+digest);
  let shouldUpload=false;
  let record=this.store.transaction(()=>{
   const prior=this.store.get('media',id);
   if(prior){assert(prior.owner===wallet&&prior.sha256===digest&&prior.bytes===bytes.length&&prior.mime===mime,'MEDIA_CHANGED','Artifact identity changed');return prior;}
   const records=this.store.list('media'),matching=records.filter(m=>m.sha256===digest&&m.public===true);
   const source=matching.find(m=>m.status==='verified')??matching.find(m=>m.status==='uploaded');
   assert(source||!matching.length,'UPLOAD_UNKNOWN','Earlier upload of these bytes needs reconciliation before another upload');
   this.reserveQuota(records,digest,bytes.length);
   if(source){assert(source.bytes===bytes.length,'MEDIA_CHANGED','Artifact reservation differs');return this.store.insert('media',id,wallet,{sha256:digest,bytes:source.bytes,...(source.providerBytes!==undefined?{providerBytes:source.providerBytes}:{}),mime,status:'uploaded',public:true,fileId:source.fileId,cid:source.cid,uri:source.uri});}
   assert(this.token,'MEDIA_NOT_CONFIGURED','Connect the Pinata integration first',503);
   shouldUpload=true;return this.store.insert('media',id,wallet,{sha256:digest,bytes:bytes.length,mime,status:'upload-unknown',public:true});
  });
  if(!shouldUpload){
   if(record.status==='verified')return record;
   if(record.status==='upload-unknown')return this.recoverUnknown(record);
   assert(record.status==='uploaded','UPLOAD_UNKNOWN','Earlier upload needs reconciliation before another upload');return this.verify(record);
  }
  const form=new FormData();form.set('network','public');form.set('file',new Blob([bytes],{type:mime}),'artifact');
  form.set('name','everywhere-'+id);form.set('keyvalues',JSON.stringify({upload_id:id,sha256:digest}));
  let response;try{response=await this.fetch('https://uploads.pinata.cloud/v3/files',{method:'POST',headers:{Authorization:'Bearer '+this.token},body:form,signal:AbortSignal.timeout(30000)});}
  catch{throw new AppError('UPLOAD_UNKNOWN','Public upload outcome is unknown; no automatic upload retry was made',503);}
  assert(response.ok,'UPLOAD_UNKNOWN',`Public upload needs reconciliation (HTTP ${response.status})`,502);
  const result=(await response.json()).data;
  // Pinata's size includes UnixFS block overhead for multi-block files.
  // Keep that provider value separate from the original bytes checked below.
  assert(result&&typeof result.id==='string'&&CID.test(result.cid)&&validPinnedSize(result.size,bytes.length,this.maxBytes),'INVALID_UPLOAD','Pinning provider returned invalid artifact metadata',502);
  record=this.store.update('media',id,wallet,record.version,{...record,status:'uploaded',providerBytes:result.size,fileId:result.id,cid:result.cid,uri:'ipfs://'+result.cid});
  return this.verify(record);
 }
 async recoverUnknown(record){
  assert(record?.status==='upload-unknown'&&record.public===true,'UPLOAD_UNKNOWN','Earlier upload needs reconciliation before another upload',503);
  const url='https://api.pinata.cloud/v3/files/public?'+new URLSearchParams({name:'everywhere-'+record.id,limit:'100'});
  let response;try{response=await this.fetch(url,{headers:{Authorization:'Bearer '+this.token},signal:AbortSignal.timeout(15000)});}
  catch{throw new AppError('UPLOAD_UNKNOWN','Earlier upload needs reconciliation before another upload',503);}
  assert(response.ok,'UPLOAD_UNKNOWN','Earlier upload needs reconciliation before another upload',503);
  const files=(await response.json()).data?.files;
  assert(Array.isArray(files),'UPLOAD_UNKNOWN','Pinning lookup is incomplete; the original upload remains reserved',503);
  const matches=files.filter(file=>file.name==='everywhere-'+record.id&&file.keyvalues?.upload_id===record.id&&file.keyvalues?.sha256===record.sha256&&file.mime_type===record.mime);
  assert(matches.length>0&&matches.every(file=>typeof file.id==='string'&&CID.test(file.cid)&&validPinnedSize(file.size,record.bytes,this.maxBytes)&&file.cid===matches[0].cid&&file.size===matches[0].size),'UPLOAD_UNKNOWN','Earlier upload needs reconciliation before another upload',503);
  const file=matches[0],recovered=this.store.transaction(()=>{
   const current=this.store.get('media',record.id);
   assert(current?.owner===record.owner&&current.sha256===record.sha256&&current.bytes===record.bytes,'MEDIA_CHANGED','Original upload reservation changed');
   if(current.status!=='upload-unknown')return current;
   return this.store.update('media',current.id,current.owner,current.version,{...current,status:'uploaded',providerBytes:file.size,fileId:file.id,cid:file.cid,uri:'ipfs://'+file.cid});
  });
  return recovered.status==='verified'?recovered:this.verify(recovered);
 }
 async reuseVerified({owner,uri,publicContentAcknowledged=false}){
  assert(publicContentAcknowledged===true,'PUBLIC_CONTENT_REQUIRED','Confirm that this artifact is intended for public use');
  assert(typeof uri==='string'&&/^ipfs:\/\/baf[a-z2-7]{30,120}$/.test(uri),'INVALID_MEDIA','Paste an IPFS link to an artifact already verified by this platform');
  const wallet=walletId(owner),record=this.store.transaction(()=>{
   const records=this.store.list('media'),source=records.find(m=>m.uri===uri&&m.public===true&&m.status==='verified');
   assert(source,'VERIFIED_ARTIFACT_REQUIRED','This IPFS link has not been verified here. Upload its file or create a text artifact instead');
   const id=sha256(wallet+'\0'+source.sha256),prior=this.store.get('media',id);
   if(prior){assert(prior.sha256===source.sha256&&prior.uri===uri&&prior.mime===source.mime,'MEDIA_CHANGED','Existing artifact metadata differs');return prior;}
   this.reserveQuota(records,source.sha256,source.bytes);
   return this.store.insert('media',id,wallet,{sha256:source.sha256,bytes:source.bytes,...(source.providerBytes!==undefined?{providerBytes:source.providerBytes}:{}),mime:source.mime,public:true,status:'uploaded',fileId:source.fileId,cid:source.cid,uri});
  });
  return record.status==='verified'?record:this.verify(record);
 }
 async verify(record){
  assert(record?.status==='uploaded'&&record.public===true,'INVALID_MEDIA','An uploaded public artifact is required');
  assert(Number.isSafeInteger(record.bytes)&&record.bytes>0&&record.bytes<=this.maxBytes,'MEDIA_LIMIT','Stored artifact exceeds the configured file limit',400);
  assert(typeof record.fileId==='string'&&record.fileId.length>0&&typeof record.cid==='string'&&CID.test(record.cid)&&record.uri==='ipfs://'+record.cid
   &&typeof record.sha256==='string'&&/^[0-9a-f]{64}$/.test(record.sha256),'MEDIA_CHANGED','Uploaded artifact metadata is invalid');
  let response;try{response=await this.fetch('https://api.pinata.cloud/v3/files/public/'+encodeURIComponent(record.fileId),{headers:{Authorization:'Bearer '+this.token},signal:AbortSignal.timeout(15000)});}
  catch{throw new AppError('MEDIA_UNAVAILABLE','Pinning metadata is temporarily unavailable',503);}
  assert(response.ok,'MEDIA_UNAVAILABLE','Pinning metadata is unavailable',503);
  const metadata=(await response.json()).data;
  assert(metadata?.id===record.fileId&&metadata.cid===record.cid&&metadata.size===(record.providerBytes??record.bytes),'MEDIA_CHANGED','Pinned metadata differs from the uploaded artifact');
  let gateway;try{gateway=await this.fetch('https://gateway.pinata.cloud/ipfs/'+record.cid,{redirect:'error',signal:AbortSignal.timeout(20000)});}
  catch{throw new AppError('MEDIA_UNAVAILABLE','Public artifact retrieval is temporarily unavailable',503);}
  assert(gateway.ok,'MEDIA_UNAVAILABLE','Public artifact is not yet retrievable',503);
  const length=gateway.headers.get('content-length'),encoding=gateway.headers.get('content-encoding');
  if((!encoding||encoding==='identity')&&length!==null&&(!/^\d+$/.test(length)||Number(length)!==record.bytes)){
   try{await gateway.body?.cancel();}catch{}
   assert(false,'MEDIA_CHANGED','Retrieved artifact size differs from the upload');
  }
  let size=0;const parts=[];
  assert(gateway.body,'MEDIA_CHANGED','Retrieved artifact is empty');
  for await(const part of gateway.body){size+=part.length;assert(size<=record.bytes&&size<=this.maxBytes,'MEDIA_CHANGED','Retrieved artifact is larger than the upload');parts.push(part);}
  const retrieved=Buffer.concat(parts);
  assert(size===record.bytes&&sha256(retrieved)===record.sha256,'MEDIA_CHANGED','Retrieved artifact hash differs from the upload');
  validateBytes(retrieved,record.mime,this.maxBytes);
  const current=this.store.get('media',record.id);
  assert(current?.owner===record.owner&&current.sha256===record.sha256&&current.bytes===record.bytes&&current.cid===record.cid&&current.fileId===record.fileId,'MEDIA_CHANGED','Artifact record changed during verification');
  return current.status==='verified'?current:this.store.update('media',record.id,record.owner,current.version,{...current,status:'verified',verifiedAt:new Date().toISOString()});
 }
}
