#!/usr/bin/env node
// Read-only: no runtime, environment credential file, database, signer or relayer.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Rpc } from '../src/rpc.mjs';
import { verifyEvidence } from '../src/evidence-verifier.mjs';
const manifest=JSON.parse(await readFile(fileURLToPath(new URL('../../deployments/qualification.json',import.meta.url)),'utf8'));
const endpoint=process.argv[2]??'https://near.drpc.org';
try{const url=new URL(endpoint);if(url.protocol!=='https:'||url.username||url.password)throw Error('Use a public HTTPS NEAR RPC URL');
 const result=await verifyEvidence(manifest,{rpc:new Rpc(endpoint,{intervalMs:250})});console.log(JSON.stringify(result,null,2));
}catch(error){console.error(JSON.stringify({status:error.code==='EVIDENCE_MISMATCH'?'mismatch':'unavailable',code:error.code??'VERIFY_UNAVAILABLE'}));process.exitCode=1;}
