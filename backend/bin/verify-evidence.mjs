#!/usr/bin/env node
// Read-only: no runtime, environment credentials, database, signer or relayer.
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {verifyOfflineEvidence} from '../src/evidence-offline.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),args=process.argv.slice(2);
const usage='Usage: node backend/bin/verify-evidence.mjs [<https-state-rpc-url>] [--history-rpc <https-archival-rpc-url>]\n       node backend/bin/verify-evidence.mjs --offline\nDefault: independent current-state and archival-history provider preferences.\nA positional URL alone is used exclusively for every read. --history-rpc explicitly replaces only historical receipt providers.\nOffline: committed file integrity only; no network or chain verification.\nExit codes: 0 verified, 1 mismatch/invalid input/local-file failure, 2 online verification unavailable.';
let rpc,offline=false,progress={stage:'network',verified:0};
try{
 if(args.length===1&&args[0]==='--help')console.log(usage);
 else{
  let endpoint,historyEndpoint;
  offline=args.length===1&&args[0]==='--offline';
  if(!offline)for(let i=0;i<args.length;i++){
   const value=args[i];
   if(value==='--history-rpc'&&!historyEndpoint&&args[i+1]&&!args[i+1].startsWith('-'))historyEndpoint=args[++i];
   else if(!value.startsWith('-')&&!endpoint)endpoint=value;
   else throw Object.assign(Error('Use --offline alone, one positional HTTPS RPC URL, and optionally --history-rpc <https-archival-rpc-url>.'),{code:'INVALID_ARGUMENT'});
  }
  const manifest=JSON.parse(await readFile(new URL('../../deployments/qualification.json',import.meta.url),'utf8'));
  if(offline)console.log(JSON.stringify(await verifyOfflineEvidence(manifest,{root}),null,2));
  else{
   const [{EvidenceRpc},{verifyEvidence}]=await Promise.all([import('../src/evidence-rpc.mjs'),import('../src/evidence-verifier.mjs')]);
   rpc=new EvidenceRpc(endpoint?[endpoint]:undefined,{...(historyEndpoint?{historyEndpoints:[historyEndpoint]}:{})});
   const result=await verifyEvidence(manifest,{rpc,onProgress:value=>progress=value});
   console.log(JSON.stringify({...result,rpc:rpc.diagnostics()},null,2));
  }
 }
}catch(error){
 const mismatch=['EVIDENCE_MISMATCH','HUB_CHANGED','CODE_CHANGED','ASSET_CHANGED','PROTOCOL_CHANGED','OFFER_CHANGED','CAMPAIGN_MISMATCH','INSOLVENT_ESCROW','MUTABLE_GLOBAL_CODE','UNBOUND_QUERY'].includes(error.code),invalid=['INVALID_ARGUMENT','INVALID_RPC_URL','INVALID_EVIDENCE','WRONG_NETWORK'].includes(error.code);
 const provider=['RPC_UNAVAILABLE','RPC_RATE_LIMITED','HISTORY_UNAVAILABLE'].includes(error.code);
 const message=mismatch?'Evidence mismatch. Restore the committed files or investigate the recorded transaction and pinned deployment; this is not a successful verification.':error.code==='WRONG_NETWORK'?'The RPC is not on NEAR mainnet. Retry with an HTTPS mainnet RPC URL.':invalid||provider?error.message:error.code==='EVIDENCE_FILE_MISSING'?error.message:error.code==='ENOENT'?'A committed manifest or evidence file is missing. Restore deployments/mainnet.json, deployments/qualification.json and deployments/evidence, then retry.':error.code==='STALE_BLOCK'?'Current finalized chain state was too old to qualify. Retry using a healthy current-state RPC.':offline?'Offline verification could not read the committed evidence files. Restore deployments/evidence and retry.':'Verification could not complete. No successful chain verification is asserted; inspect the error code and retry the appropriate verification step.';
 const unavailable=!offline&&!mismatch&&!invalid&&error.code!=='EVIDENCE_FILE_MISSING'&&error.code!=='ENOENT';
 console.error(JSON.stringify({status:mismatch?'mismatch':invalid?'invalid':offline?'offline-unavailable':'unavailable',code:error.code??'VERIFY_UNAVAILABLE',message,...(!offline?{progress}:{}),...(rpc?{rpc:rpc.diagnostics()}:{} )}));process.exitCode=unavailable?2:1;
}
