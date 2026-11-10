import { constants } from 'node:fs';
import { open,lstat,realpath,mkdir,rename,copyFile,rm } from 'node:fs/promises';
import { dirname,join,resolve,relative,isAbsolute,basename,sep } from 'node:path';
import { createHash,randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { assert,AppError } from './core.mjs';

const ESSENTIAL={
 objects:{kind:'TEXT',id:'TEXT',owner:'TEXT',data:'TEXT',version:'INTEGER',created_at:'TEXT',updated_at:'TEXT'},
 operations:{id:'TEXT',kind:'TEXT',scope:'TEXT',plan_hash:'TEXT',plan:'TEXT',phase:'TEXT',transaction_hash:'TEXT',result:'TEXT',created_at:'TEXT',updated_at:'TEXT'},
 budget_entries:{operation_id:'TEXT',category:'TEXT',reserved:'TEXT',actual:'TEXT',status:'TEXT'},
 events:{seq:'INTEGER',kind:'TEXT',entity_id:'TEXT',data:'TEXT',actor:'TEXT',created_at:'TEXT'},
 challenges:{id:'TEXT',wallet:'TEXT',origin:'TEXT',nonce:'TEXT',message:'TEXT',expires_ms:'INTEGER',consumed:'INTEGER'},
 sessions:{token_hash:'TEXT',wallet:'TEXT',expires_ms:'INTEGER'},
};
const PRIMARY={objects:{kind:1,id:2},operations:{id:1},budget_entries:{operation_id:1,category:2},events:{seq:1},challenges:{id:1},sessions:{token_hash:1}};
async function statOptional(path){try{return await lstat(path);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
const within=(root,path)=>{const rel=relative(root,path);return rel!==''&&!rel.startsWith('..'+sep)&&rel!=='..'&&!isAbsolute(rel);};
async function syncDirectory(path){const file=await open(path,'r');try{await file.sync();}finally{await file.close();}}
async function digestFile(path){const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{const hash=createHash('sha256');for await(const bytes of file.createReadStream({autoClose:false}))hash.update(bytes);return hash.digest('hex');}finally{await file.close();}}
async function noLiveSidecars(path){for(const suffix of ['-wal','-journal']){const stat=await statOptional(path+suffix);assert(!stat||stat.isFile()&&!stat.isSymbolicLink()&&stat.size===0,'STATE_IMPORT_SIDECAR','Import requires a standalone checkpointed snapshot without a live WAL or journal');}}
function inspectDatabase(path,{empty=false,checkpoint=false}={}){
 let db;
 try{
  db=new DatabaseSync(path,{readOnly:!checkpoint,timeout:5000});db.exec('PRAGMA trusted_schema=OFF');
  const integrity=db.prepare('PRAGMA integrity_check').all();assert(integrity.length===1&&integrity[0].integrity_check==='ok','STATE_IMPORT_INTEGRITY','SQLite integrity verification failed');
  for(const [table,columns]of Object.entries(ESSENTIAL)){
   const schema=db.prepare(`PRAGMA table_info("${table}")`).all();
   assert(Object.entries(columns).every(([name,type])=>schema.some(column=>column.name===name&&column.type.toUpperCase()===type))&&Object.entries(PRIMARY[table]).every(([name,position])=>schema.some(column=>column.name===name&&column.pk===position)),'STATE_IMPORT_SCHEMA','Snapshot is missing a compatible essential table');
  }
  assert(db.prepare('PRAGMA foreign_key_check').all().length===0,'STATE_IMPORT_INTEGRITY','Snapshot contains broken journal references');
  if(empty){
   assert(Object.keys(ESSENTIAL).every(table=>db.prepare(`SELECT COUNT(*) count FROM "${table}"`).get().count===0),'STATE_IMPORT_NONEMPTY','Existing application state is not empty and will not be replaced');
   if(checkpoint){const result=db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();assert(result.busy===0,'STATE_IMPORT_BUSY','Existing state is still in use');}
   return;
  }
  assert(db.prepare("SELECT COUNT(*) count FROM objects WHERE NOT json_valid(data)").get().count===0
   &&db.prepare("SELECT COUNT(*) count FROM operations WHERE NOT json_valid(plan) OR (result IS NOT NULL AND NOT json_valid(result))").get().count===0,'STATE_IMPORT_SCHEMA','Snapshot contains incompatible JSON records');
  assert(db.prepare("SELECT COUNT(*) count FROM operations WHERE phase NOT IN ('confirmed','failed','superseded','cancelled')").get().count===0
   &&db.prepare("SELECT COUNT(*) count FROM budget_entries WHERE status NOT IN ('settled','released')").get().count===0,'STATE_IMPORT_PENDING','Finish or cancel all original financial operations before exporting state');
  assert(db.prepare("SELECT COUNT(*) count FROM objects WHERE kind IN ('near-lock','base-lock','intent-dispatch') OR (kind='wallet-request' AND COALESCE(json_extract(data,'$.status'),'') NOT IN ('confirmed','failed','rejected')) OR (kind IN ('native-plan','publication-plan') AND json_extract(data,'$.transactionHash') IS NOT NULL AND COALESCE(json_extract(data,'$.status'),'') NOT IN ('confirmed','failed'))").get().count===0,'STATE_IMPORT_PENDING','Reconcile all wallet dispatches before exporting state');
 }catch(error){if(error instanceof AppError)throw error;throw new AppError('STATE_IMPORT_INVALID','State import is not a valid compatible SQLite snapshot');}
 finally{db?.close();}
}
async function writeMarker(path,value){const temporary=path+'.'+randomUUID()+'.tmp',file=await open(temporary,'wx',0o600);try{await file.writeFile(JSON.stringify(value)+'\n');await file.sync();}finally{await file.close();}try{await rename(temporary,path);await syncDirectory(dirname(path));}finally{await rm(temporary,{force:true});}}

// Operator process environment only: no HTTP route, no key import, no database
// fallback. Deployment must provide a quiesced snapshot and one mounted instance.
export async function importState({config,environment=process.env}){
 const sourceValue=environment.APP_STATE_IMPORT_PATH,expected=environment.APP_STATE_IMPORT_SHA256;
 if(sourceValue===undefined&&expected===undefined)return {status:'not-requested'};
 assert(config.production===true,'STATE_IMPORT_PRODUCTION_ONLY','State import is available only at production startup');
 assert(typeof sourceValue==='string'&&isAbsolute(sourceValue)&&typeof expected==='string'&&/^[0-9a-f]{64}$/.test(expected),'STATE_IMPORT_CONFIG','Configure an absolute import path and its exact SHA256 together');
 const directory=resolve(config.stateDir),volume=dirname(directory),source=resolve(sourceValue),target=join(directory,'state.sqlite'),marker=join(directory,'.state-import.json');
 assert(volume!==dirname(volume)&&within(volume,source)&&source!==target&&source!==marker,'STATE_IMPORT_PATH','Snapshot must be a separate file inside the application state volume');
 const volumeStat=await lstat(volume);assert(volumeStat.isDirectory()&&!volumeStat.isSymbolicLink(),'STATE_IMPORT_PATH','State volume must be a regular directory');
 const realVolume=await realpath(volume);await mkdir(directory,{recursive:true,mode:0o700});await syncDirectory(volume);const dirStat=await lstat(directory);
 assert(dirStat.isDirectory()&&!dirStat.isSymbolicLink()&&within(realVolume,await realpath(directory)),'STATE_IMPORT_PATH','Application state directory must stay inside its volume');
 const targetStat=await statOptional(target),markerStat=await statOptional(marker);
 assert(!targetStat||targetStat.isFile()&&!targetStat.isSymbolicLink(),'STATE_IMPORT_PATH','Application database must not be a symlink');
 if(markerStat){
  assert(markerStat.isFile()&&!markerStat.isSymbolicLink()&&markerStat.size<=16384,'STATE_IMPORT_MARKER','Import marker is invalid');
  const file=await open(marker,constants.O_RDONLY|constants.O_NOFOLLOW);let proof;try{proof=JSON.parse(await file.readFile('utf8'));}catch{throw new AppError('STATE_IMPORT_MARKER','Import marker is invalid');}finally{await file.close();}
  assert(proof&&typeof proof==='object'&&!Array.isArray(proof)&&proof.schema==='everywhere-state-import/v1'&&proof.sha256===expected&&proof.target==='state.sqlite'&&Number.isSafeInteger(proof.bytes)&&proof.bytes>0,'STATE_IMPORT_MARKER','A different or invalid import marker already exists');
  assert(targetStat&&targetStat.size>=512,'STATE_IMPORT_TARGET_MISSING','Imported state is missing; automatic rollback to the original snapshot is forbidden');
  return {status:'already-imported',sha256:expected};
 }
 const sourceStat=await lstat(source);assert(sourceStat.isFile()&&!sourceStat.isSymbolicLink()&&sourceStat.size>0&&sourceStat.size<=1073741824,'STATE_IMPORT_PATH','Snapshot must be a regular file no larger than its state volume');
 assert(within(realVolume,await realpath(source)),'STATE_IMPORT_PATH','Snapshot path escapes its state volume');await noLiveSidecars(source);
 const temporary=join(directory,'.state-import-'+randomUUID()+'.sqlite');let installed=false;
 try{
  const input=await open(source,constants.O_RDONLY|constants.O_NOFOLLOW),output=await open(temporary,'wx',0o600),hash=createHash('sha256');let bytes=0;
  try{for await(const part of input.createReadStream({autoClose:false})){bytes+=part.length;assert(bytes<=sourceStat.size,'STATE_IMPORT_CHANGED','Snapshot changed during copying');hash.update(part);await output.writeFile(part);}await output.sync();}finally{await input.close();await output.close();}
  assert(bytes===sourceStat.size&&hash.digest('hex')===expected,'STATE_IMPORT_SHA','Snapshot bytes do not match the approved SHA256');inspectDatabase(temporary);
  let backup;
  if(targetStat){
   if(await digestFile(target)===expected){await noLiveSidecars(target);installed=true;}
   else{inspectDatabase(target,{empty:true,checkpoint:true});await noLiveSidecars(target);backup=join(directory,'state.before-import-'+randomUUID()+'.sqlite');await copyFile(target,backup,constants.COPYFILE_EXCL);const saved=await open(backup,'r');try{await saved.sync();}finally{await saved.close();}}
  }
  if(!installed){await rename(temporary,target);await syncDirectory(directory);installed=true;}
  await writeMarker(marker,{schema:'everywhere-state-import/v1',sha256:expected,bytes,target:'state.sqlite',source:basename(source),...(backup?{backup:basename(backup)}:{}),importedAt:new Date().toISOString()});
  return {status:'imported',sha256:expected,bytes};
 }finally{await rm(temporary,{force:true});}
}
