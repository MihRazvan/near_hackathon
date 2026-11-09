import { randomBytes } from 'node:crypto';
import { assert,sha256,walletId } from './core.mjs';
import { imageInput } from './asset-ai.mjs';
export class Capture {
 constructor({store,config,now=Date.now}){Object.assign(this,{store,config,now});}
 create(wallet){
  const actor=walletId(wallet),id=randomBytes(16).toString('hex'),token=randomBytes(32).toString('base64url');
  assert(this.store.list('capture',actor).filter(s=>s.expiresAt>this.now()).length<5,'CAPTURE_LIMIT','Use or let an earlier capture session expire before creating another');
  this.store.insert('capture',id,actor,{tokenHash:sha256(token),expiresAt:this.now()+1800000,status:'waiting'});
  return {id,expiresAt:new Date(this.now()+1800000).toISOString(),uploadUrl:this.config.origin+'/capture/'+id+'?token='+token};
 }
 read(wallet,id){const r=this.store.get('capture',id);assert(r?.owner===walletId(wallet),'NOT_FOUND','Capture session not found',404);const {tokenHash,...publicRecord}=r;return publicRecord;}
 upload(id,{token,imageDataUrl}){
  const r=this.store.get('capture',id);
  assert(r&&typeof token==='string'&&token.length<=100&&sha256(token)===r.tokenHash&&r.expiresAt>this.now(),'CAPTURE_EXPIRED','This capture link expired or is invalid',403);
  if(r.status==='received'&&r.imageDataUrl===imageDataUrl)return {saved:true,id};
  assert(r.status==='waiting','CAPTURE_ALREADY_SAVED','This link already saved a photo. Continue from the owner workspace.');
  imageInput(imageDataUrl);this.store.update('capture',id,r.owner,r.version,{...r,status:'received',imageDataUrl});
  return {saved:true,id};
 }
}
