#!/usr/bin/env node
// Read-only: no runtime, environment credentials, database, signer or relayer.
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {verifyOfflineEvidence} from '../src/evidence-offline.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const args=process.argv.slice(2),offline=args.length===1&&args[0]==='--offline';
let rpc;
try{
 if(args.length===1&&args[0]==='--help'){console.log('Usage: node backend/bin/verify-evidence.mjs [<https-rpc-url> | --offline]\nDefault: automatic fallback across three public mainnet RPCs. A custom URL is used exclusively.\nOffline: verifies committed file hashes only; no network or chain verification.');}
 else{
  if(args.length>1||args[0]?.startsWith('-')&&!offline)throw Object.assign(Error('Use --offline, or supply one HTTPS RPC URL.'),{code:'INVALID_ARGUMENT'});
  const manifest=JSON.parse(await readFile(new URL('../../deployments/qualification.json',import.meta.url),'utf8'));
  if(offline)console.log(JSON.stringify(await verifyOfflineEvidence(manifest,{root}),null,2));
  else{
   const [{EvidenceRpc},{verifyEvidence}]=await Promise.all([import('../src/evidence-rpc.mjs'),import('../src/evidence-verifier.mjs')]);
   rpc=new EvidenceRpc(args.length?[args[0]]:undefined);const result=await verifyEvidence(manifest,{rpc});
   console.log(JSON.stringify({...result,rpc:rpc.diagnostics()},null,2));
  }
 }
}catch(error){
 const mismatch=['EVIDENCE_MISMATCH','HUB_CHANGED','CODE_CHANGED','ASSET_CHANGED','PROTOCOL_CHANGED','OFFER_CHANGED','CAMPAIGN_MISMATCH','INSOLVENT_ESCROW','MUTABLE_GLOBAL_CODE','UNBOUND_QUERY'].includes(error.code),invalid=['INVALID_ARGUMENT','INVALID_RPC_URL','INVALID_EVIDENCE','WRONG_NETWORK'].includes(error.code);
 const message=mismatch?'Evidence mismatch. Restore the committed files or investigate the recorded transaction and pinned deployment; this is not a successful verification.':error.code==='WRONG_NETWORK'?'The RPC is not on NEAR mainnet. Retry with an HTTPS mainnet RPC URL.':invalid?error.message:error.code==='EVIDENCE_FILE_MISSING'?error.message:error.code==='ENOENT'?'A committed manifest or evidence file is missing. Restore deployments/mainnet.json, deployments/qualification.json and deployments/evidence, then retry.':offline?'Offline verification could not read the committed evidence files. Restore deployments/evidence and retry.':'Network access to a NEAR mainnet RPC is required. Retry with: node backend/bin/verify-evidence.mjs <rpc-url>';
 console.error(JSON.stringify({status:mismatch?'mismatch':invalid?'invalid':offline?'offline-unavailable':'unavailable',code:error.code??'VERIFY_UNAVAILABLE',message,...(rpc?{rpc:rpc.diagnostics()}:{} )}));process.exitCode=1;
}
