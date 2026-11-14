// Private visual drafts only. Nothing in this store establishes a reservation,
// on-chain artwork, approval or installation. Blobs never leave the browser.
const MAX_AGE=30*86400000,MAX_DRAFTS=12,memory=new Map(),revisions=new Map();
let database;
export function previewContext(offer,spot,wallet){
 const asset=offer?.publication?.manifest?.asset,geometry=asset?.spots?.find(p=>p.id===spot?.id);
 if(!offer?.id||!spot?.id||!geometry)return null;
 const binding=JSON.stringify([offer.id,spot.id,spot.contractId??'',offer.publication?.publishedTermsHash??'',asset.id,asset.coverSha256??asset.coverUri??offer.presentation?.coverSha256??'',asset.photoViews??[],geometry]);
 return {key:JSON.stringify([wallet??null,binding]),binding,wallet:wallet??null,saleId:offer.id,spotId:spot.id};
}
export function validPreview(record,context,now=Date.now()){
 return !!(record&&context&&record.binding===context.binding&&record.wallet===context.wallet&&record.updatedAt>now-MAX_AGE&&record.updatedAt<=now+60000&&
  ['image/png','image/jpeg'].includes(record.mime)&&/^[0-9a-f]{64}$/.test(record.sha256??'')&&
  (record.kind==='file'&&record.blob instanceof Blob&&record.blob.size>0&&record.blob.type===record.mime||record.kind==='media'&&typeof record.mediaId==='string'));
}
async function db(){
 if(!globalThis.indexedDB)return null;
 database??=new Promise((resolve,reject)=>{const request=indexedDB.open('everywhere-private-ad-previews',1);request.onupgradeneeded=()=>request.result.createObjectStore('drafts',{keyPath:'key'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('Browser storage is busy'));});
 try{return await database;}catch{return null;}
}
async function transaction(mode,work){
 const connection=await db();if(!connection)throw Error('Browser storage is unavailable');
 return new Promise((resolve,reject)=>{const tx=connection.transaction('drafts',mode),request=work(tx.objectStore('drafts'));tx.oncomplete=()=>resolve(request?.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
}
export async function readPreview(context){
 if(!context)return null;
 const revision=revisions.get(context.key);
 let record=memory.get(context.key);if(!record)try{record=await transaction('readonly',store=>store.get(context.key));}catch{}
 if(revisions.get(context.key)!==revision)record=memory.get(context.key);
 if(!validPreview(record,context))return null;
 memory.set(context.key,record);return record;
}
export async function savePreview(context,draft){
 const record={...draft,...context,updatedAt:Date.now(),persisted:false};
 if(!validPreview(record,context))throw Error('Choose a PNG or JPEG image for this spot.');
 revisions.set(context.key,(revisions.get(context.key)??0)+1);
 memory.set(context.key,record);
 try{
  record.persisted=true;await transaction('readwrite',store=>store.put(record));
  const rows=await transaction('readonly',store=>store.getAll());
  const old=rows.sort((a,b)=>b.updatedAt-a.updatedAt).filter((row,i)=>row.updatedAt<Date.now()-MAX_AGE||i>=MAX_DRAFTS);
  if(old.length)await transaction('readwrite',store=>{for(const row of old){store.delete(row.key);memory.delete(row.key);}});
 }catch{record.persisted=false;}
 return record;
}
export async function resetPreview(context){if(!context)return;revisions.set(context.key,(revisions.get(context.key)??0)+1);memory.delete(context.key);try{await transaction('readwrite',store=>store.delete(context.key));}catch{}}
export async function adoptGuestPreview(offer,spot,wallet){
 if(!wallet)return;const own=previewContext(offer,spot,wallet);if(await readPreview(own))return;
 const guest=previewContext(offer,spot,null),draft=await readPreview(guest);if(!draft)return;
 await savePreview(own,draft);await resetPreview(guest);
}
