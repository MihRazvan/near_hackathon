import { randomBytes } from 'node:crypto';
import { assert,sha256,walletId } from './core.mjs';
import { imageInput } from './asset-ai.mjs';
import { initializeLocalPhotoQuota,assertLocalPhotoQuota,pruneCaptureStorage,OWNER_CAPTURE_MAX,GLOBAL_CAPTURE_MAX,CAPTURE_RECORD_MAX } from './local-photo-quota.mjs';
export class Capture {
 constructor({store,config,now=Date.now}){Object.assign(this,{store,config,now});initializeLocalPhotoQuota(store);this.prune();}
 prune(){this.store.transaction(()=>pruneCaptureStorage(this.store,this.now()));}
 create(wallet){
  const actor=walletId(wallet),id=randomBytes(16).toString('hex'),token=randomBytes(32).toString('base64url');
  return this.store.transaction(()=>{
   pruneCaptureStorage(this.store,this.now(),{needed:1});
   const active="kind='capture' AND CAST(json_extract(data,'$.expiresAt') AS INTEGER)>? AND json_extract(data,'$.status') IN ('waiting','received')";
   assert(this.store.db.prepare('SELECT COUNT(*) count FROM objects WHERE '+active+' AND owner=?').get(this.now(),actor).count<OWNER_CAPTURE_MAX,'CAPTURE_LIMIT','Use or let an earlier capture session expire before creating another');
   assert(this.store.db.prepare('SELECT COUNT(*) count FROM objects WHERE '+active).get(this.now()).count<GLOBAL_CAPTURE_MAX,'CAPTURE_LIMIT','Camera handoffs are at capacity. Please try again shortly.',429);
   assert(this.store.db.prepare("SELECT COUNT(*) count FROM objects WHERE kind='capture'").get().count<CAPTURE_RECORD_MAX,'CAPTURE_LIMIT','Camera handoff history is at capacity.',429);
   this.store.insert('capture',id,actor,{tokenHash:sha256(token),expiresAt:this.now()+1800000,status:'waiting'});
   return {id,expiresAt:new Date(this.now()+1800000).toISOString(),uploadUrl:this.config.origin+'/capture/'+id+'?token='+token};
  });
 }
 read(wallet,id){this.prune();const r=this.store.get('capture',id);assert(r?.owner===walletId(wallet),'NOT_FOUND','Capture session not found',404);const {tokenHash,...publicRecord}=r;return publicRecord;}
 upload(id,{token,imageDataUrl}){
  this.prune();
  return this.store.transaction(()=>{
   const r=this.store.get('capture',id);
   assert(r&&typeof token==='string'&&token.length<=100&&sha256(token)===r.tokenHash&&r.expiresAt>this.now(),'CAPTURE_EXPIRED','This capture link expired or is invalid',403);
   if(r.status==='received'&&r.imageDataUrl===imageDataUrl)return {saved:true,id};
   assert(r.status==='waiting','CAPTURE_ALREADY_SAVED','This link already saved a photo. Continue from the owner workspace.');
   imageInput(imageDataUrl);assertLocalPhotoQuota(this.store,{kind:'capture',id,value:imageDataUrl,config:this.config});
   this.store.update('capture',id,r.owner,r.version,{...r,status:'received',imageDataUrl});return {saved:true,id};
  });
 }
}
