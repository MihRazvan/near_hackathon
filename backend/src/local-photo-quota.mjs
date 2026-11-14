import { assert } from './core.mjs';

export const LOCAL_PHOTO_MAX_BYTES=128*1024*1024;
export const OWNER_ASSET_MAX=20;
export const GLOBAL_ASSET_MAX=2000;
export const OWNER_CAPTURE_MAX=2;
export const GLOBAL_CAPTURE_MAX=100;
export const CAPTURE_RECORD_MAX=2000;
const initialized=new WeakSet();
const bytesFor=row=>`(COALESCE(length(CAST(CASE ${row}.kind WHEN 'asset' THEN json_extract(${row}.data,'$.photoDataUrl') WHEN 'capture' THEN json_extract(${row}.data,'$.imageDataUrl') ELSE NULL END AS BLOB)),0)+CASE WHEN ${row}.kind='asset' THEN COALESCE((SELECT SUM(length(CAST(json_extract(photo.value,'$.photoDataUrl') AS BLOB))) FROM json_each(${row}.data,'$.photoViews') photo),0) ELSE 0 END)`;

// The counter follows actual UTF-8 fields, including replacements and pruning.
// Triggers keep it correct across independent processes and database connections.
export function initializeLocalPhotoQuota(store){
 if(initialized.has(store))return;
 store.transaction(()=>{
  // Migrate old counters once, under the same write lock used by photo edits.
  const existing=store.db.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name='local_photo_insert'").get();
  if(existing&&!existing.sql.includes('$.photoViews'))store.db.exec('DROP TRIGGER IF EXISTS local_photo_insert; DROP TRIGGER IF EXISTS local_photo_delete; DROP TRIGGER IF EXISTS local_photo_update; DROP TABLE IF EXISTS local_photo_storage;');
  store.db.exec(`
  CREATE TABLE IF NOT EXISTS local_photo_storage(id INTEGER PRIMARY KEY CHECK(id=1),bytes INTEGER NOT NULL CHECK(bytes>=0));
  INSERT OR IGNORE INTO local_photo_storage(id,bytes) SELECT 1,COALESCE(SUM(${bytesFor('objects')}),0) FROM objects WHERE kind IN ('asset','capture');
  CREATE TRIGGER IF NOT EXISTS local_photo_insert AFTER INSERT ON objects WHEN NEW.kind IN ('asset','capture') BEGIN UPDATE local_photo_storage SET bytes=bytes+${bytesFor('NEW')} WHERE id=1; END;
  CREATE TRIGGER IF NOT EXISTS local_photo_delete AFTER DELETE ON objects WHEN OLD.kind IN ('asset','capture') BEGIN UPDATE local_photo_storage SET bytes=bytes-${bytesFor('OLD')} WHERE id=1; END;
  CREATE TRIGGER IF NOT EXISTS local_photo_update AFTER UPDATE OF data,kind ON objects WHEN OLD.kind IN ('asset','capture') OR NEW.kind IN ('asset','capture') BEGIN UPDATE local_photo_storage SET bytes=bytes-${bytesFor('OLD')}+${bytesFor('NEW')} WHERE id=1; END;
 `);});
 initialized.add(store);
}
export function assertLocalPhotoQuota(store,{kind,id,value,values,config={}}){
 const limit=config.localPhotoMaxBytes??LOCAL_PHOTO_MAX_BYTES;
 assert(Number.isSafeInteger(limit)&&limit>0&&limit<=LOCAL_PHOTO_MAX_BYTES,'INVALID_LIMIT','Local reference photo storage must be at most 128 MiB');
 const used=store.db.prepare('SELECT bytes FROM local_photo_storage WHERE id=1').get().bytes;
 const prior=id?store.db.prepare(`SELECT ${bytesFor('objects')} bytes FROM objects WHERE kind=? AND id=?`).get(kind,id)?.bytes??0:0;
 const next=(values??[value]).reduce((n,item)=>n+(typeof item==='string'?Buffer.byteLength(item,'utf8'):0),0);
 assert(next<=prior||used-prior+next<=limit,'LOCAL_PHOTO_QUOTA','Reference photo storage is full. Remove an older photo or use a public image instead.',429);
}
// Capture IDs are transient handoff history, never financial journals. Assets
// retain their own photo copy; expiry removes both the photo and upload capability.
// Call inside the caller's transaction; needed reserves room for a new record.
export function pruneCaptureStorage(store,now,{needed=0}={}){
 store.db.prepare("UPDATE objects SET data=json_remove(json_set(data,'$.status','expired'),'$.imageDataUrl','$.tokenHash'),version=version+1,updated_at=? WHERE kind='capture' AND CAST(json_extract(data,'$.expiresAt') AS INTEGER)<=? AND (json_type(data,'$.imageDataUrl') IS NOT NULL OR json_type(data,'$.tokenHash') IS NOT NULL OR json_extract(data,'$.status')!='expired')").run(new Date(now).toISOString(),now);
 const count=store.db.prepare("SELECT COUNT(*) count FROM objects WHERE kind='capture'").get().count;
 const excess=Math.max(0,count+needed-CAPTURE_RECORD_MAX);
 if(excess)store.db.prepare("DELETE FROM objects WHERE kind='capture' AND id IN (SELECT id FROM objects WHERE kind='capture' AND CAST(json_extract(data,'$.expiresAt') AS INTEGER)<=? ORDER BY CAST(json_extract(data,'$.expiresAt') AS INTEGER),created_at,id LIMIT ?)").run(now,excess);
}
