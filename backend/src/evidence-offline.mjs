import {readFile,realpath} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {assert,AppError} from './core.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest();
export function base58(bytes){
 const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let n=BigInt('0x'+Buffer.from(bytes).toString('hex')),encoded='';
 while(n){encoded=alphabet[Number(n%58n)]+encoded;n/=58n;}
 let zeros=0;while(bytes[zeros]===0)zeros++;return '1'.repeat(zeros)+encoded;
}
function rawCidDigest(uri){
 assert(/^ipfs:\/\/bafkrei[a-z2-7]+$/.test(uri),'EVIDENCE_MISMATCH','Expected a raw SHA-256 IPFS CID.');
 const alphabet='abcdefghijklmnopqrstuvwxyz234567';let bits=0,value=0;const decoded=[];
 for(const c of uri.slice(8)){value=(value<<5)|alphabet.indexOf(c);bits+=5;if(bits>=8){bits-=8;decoded.push((value>>>bits)&255);}}
 const bytes=Buffer.from(decoded);assert(bytes.length===36&&bits===2&&(value&3)===0&&bytes.subarray(0,4).equals(Buffer.from([1,85,18,32])),'EVIDENCE_MISMATCH','IPFS CID codec, padding or digest differs.');return bytes.subarray(4).toString('hex');
}
export async function verifyOfflineEvidence(manifest,{root,read=readFile}={}){
 assert(manifest.schema==='everywhere-qualification/v1'&&manifest.network==='mainnet','INVALID_EVIDENCE','Expected a mainnet qualification manifest.');
 const directory=await realpath(root),deployment=JSON.parse(await read(resolve(directory,'deployments/mainnet.json'),'utf8'));
 assert(deployment.network===manifest.network&&deployment.marketplaceHub?.accountId===manifest.record.hubId&&deployment.marketplaceHub.codeHash===manifest.contract.codeHash&&deployment.marketplaceHub.wasmSha256===manifest.contract.wasmSha256&&deployment.syntheticQualification?.offerId===manifest.record.offerId,'EVIDENCE_MISMATCH','Deployment and qualification manifests disagree.');
 const entries=[['wasm',manifest.contract.wasmFile,manifest.contract.wasmSha256],...Object.entries(manifest.record.artifacts).map(([name,a])=>[name,a.file,a.sha256])],files=[];
 assert(entries.length===3,'INVALID_EVIDENCE','Expected WASM, artwork and delivery files.');
 for(const [kind,path,expected]of entries){
  assert(typeof path==='string'&&/^deployments\/evidence\/[a-z0-9-]+\.(?:wasm|txt)$/.test(path)&&/^[a-f0-9]{64}$/.test(expected),'INVALID_EVIDENCE','Evidence file path or digest is invalid.');
  let file;try{file=await realpath(resolve(directory,path));}catch{throw new AppError('EVIDENCE_FILE_MISSING','A committed evidence file is missing. Restore deployments/evidence from the repository.',400);}
  assert(file.startsWith(directory+sep),'INVALID_EVIDENCE','Evidence files must stay inside the repository.');
  const bytes=await read(file),digest=sha(bytes);
  assert(digest.toString('hex')===expected,'EVIDENCE_MISMATCH',`Committed ${kind} bytes do not match the qualification manifest.`);
  if(kind==='wasm')assert(bytes.subarray(0,8).equals(Buffer.from([0,97,115,109,1,0,0,0]))&&base58(digest)===manifest.contract.codeHash,'EVIDENCE_MISMATCH','WASM header or NEAR code hash differs.');
  else assert(rawCidDigest(manifest.record.artifacts[kind].uri)===expected,'EVIDENCE_MISMATCH',`${kind} CID does not bind the recorded SHA-256.`);
  files.push({kind,path,sha256:expected,bytes:bytes.length});
 }
 return {status:'offline-verified',scope:'Committed file hashes, IPFS CID digests and deployment manifest consistency only.',chainVerification:'not-performed',physicalInstallationVerified:false,files};
}
