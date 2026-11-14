#!/usr/bin/env node
// Rebuild source and compare bytes. No signer, runtime configuration or RPC.
import {copyFile, mkdir, readFile, rename, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {ROOT, cleanEnvironment, commandOutput, ensureRust, makeRun, parseFlags, prerequisite, readJson, requireBasicTools, runLogged, saveReport, sha256} from './verification-support.mjs';

const help = `Usage: node scripts/verify-build.mjs [--check-only] [--skip-install] [--json]
Rebuild the marketplace hub with pinned Rust 1.95.0 and Binaryen 133; compare
its bytes with the committed mainnet deployment artifact and manifest.
Requires Node.js 22.23+, rustup, Python 3, bash and tar on Linux or macOS.
Default: installs the pinned Rust toolchain/target if needed and downloads the
platform's SHA256-pinned official Binaryen archive into ignored .local storage.
--skip-install requires the toolchain, target and verified archive already cached.
--check-only checks prerequisites without downloading, building or reading a chain.
--json emits the actual result as JSON. Reports and logs stay in .local/verification.
Exit 0: verified/ready; 1: build or integrity failure; 2: prerequisite unavailable.
This does not deploy, spend funds, or independently establish current chain state.`;

export function base58(bytes) {
  const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let value=BigInt('0x'+bytes.toString('hex')),result='';
  while(value){result=alphabet[Number(value%58n)]+result;value/=58n;}
  for(const byte of bytes){if(byte!==0)break;result='1'+result;}
  return result;
}

async function optimizer(run, pin, flags) {
  const entry=pin.optimizer.archives[process.platform+'-'+process.arch];
  if(!entry)throw prerequisite('No pinned optimizer archive for this platform.','Use Linux x64/arm64 or macOS x64/arm64.');
  const cache=join(ROOT,'.local/verification-tools/archives');await mkdir(cache,{recursive:true,mode:0o700});
  const destination=join(cache,entry.file),previous=join(ROOT,'.local/tooling',entry.file);
  let bytes;
  for(const file of [destination,previous]){try{bytes=await readFile(file);if(sha256(bytes)!==entry.sha256)throw Object.assign(new Error('Cached Binaryen archive checksum mismatch.'),{exitCode:1});if(file!==destination)await copyFile(file,destination);break;}catch(e){if(e.code!=='ENOENT')throw e;}}
  if(!bytes){
    if(flags['skip-install'])throw prerequisite('The pinned Binaryen archive is not cached.','Run this command without --skip-install to download and verify the official release.');
    const url='https://github.com/WebAssembly/binaryen/releases/download/'+pin.optimizer.version+'/'+entry.file;
    if(!flags.json)console.error('Downloading SHA256-pinned official Binaryen archive…');
    try {
      const response=await fetch(url,{signal:AbortSignal.timeout(120000)});
      if(!response.ok)throw new Error('HTTP '+response.status);
      const length=Number(response.headers.get('content-length'));if(length>160000000)throw new Error('Archive exceeds the bounded download size');
      bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>160000000)throw new Error('Archive exceeds the bounded download size');
    } catch(error){throw prerequisite('The official Binaryen archive could not be downloaded.','Check network access to github.com and retry. '+error.message);}
    if(sha256(bytes)!==entry.sha256)throw Object.assign(new Error('Downloaded Binaryen archive checksum mismatch; refusing to execute it.'),{exitCode:1});
    const temporary=destination+'.'+process.pid+'.tmp';await writeFile(temporary,bytes,{mode:0o600});await rename(temporary,destination);
  }
  // Extract from the verified archive afresh, so an edited executable cache is
  // never trusted. Only the optimizer and its adjacent shared library are needed.
  const listing=commandOutput('tar',['-tzf',destination]);
  if(!listing.ok)throw prerequisite('Cannot list the verified Binaryen archive.','Install tar with gzip support.');
  const prefix='binaryen-'+pin.optimizer.version+'/',files=listing.output.split('\n').filter(file=>file===prefix+'bin/wasm-opt'||new RegExp('^'+prefix+'lib/libbinaryen[^/]*\\.(?:so(?:\\.[0-9]+)*|dylib)$').test(file));
  if(!files.includes(prefix+'bin/wasm-opt')||files.some(file=>file.startsWith('/')||file.split('/').includes('..')))throw new Error('Pinned archive has an unexpected optimizer layout.');
  const extraction=join(run.directory,'optimizer');await mkdir(extraction,{mode:0o700});
  await runLogged(run,'extract-optimizer','tar',['-xzf',destination,'-C',extraction,...files],{quiet:flags.json});
  const path=join(extraction,prefix,'bin/wasm-opt'),binary=await readFile(path),version=commandOutput(path,['--version']);
  if(!version.ok||!/^wasm-opt version 133\b/.test(version.output))throw new Error('The pinned optimizer cannot run or has an unexpected version.');
  return {path,sha256:sha256(binary),version:version.output,archiveSha256:entry.sha256,archive:entry.file};
}

async function main() {
  let flags;
  try{flags=parseFlags(process.argv.slice(2));}
  catch(error){const result={schema:'everywhere-verification/v1',status:'prerequisites-unavailable',kind:'build',message:error.message,action:error.action};if(process.argv.includes('--json'))console.log(JSON.stringify(result,null,2));else console.error(result.message+'\n'+result.action);process.exitCode=2;return;}
  if(flags.help){console.log(help);return;}
  const run=await makeRun('build');
  try {
    requireBasicTools({tar:true});
    if(!['linux','darwin'].includes(process.platform))throw prerequisite('The build verification runner requires Linux or macOS.','Use Linux/WSL2 or macOS.');
    const pin=await readJson('deployments/build.json');
    if(!pin.optimizer.archives[process.platform+'-'+process.arch])throw prerequisite('This platform has no pinned optimizer archive.','Use one of the platforms listed in deployments/build.json.');
    const rust=await ensureRust(run,flags);
    if(flags['check-only']){await saveReport(run,{status:'prerequisites-ready',kind:'build',toolchain:rust,platform:process.platform+'-'+process.arch,scope:'Prerequisite checks only; no compilation, downloads, chain reads or deployment.'},flags);return;}
    const tool=await optimizer(run,pin,flags);
    const env=cleanEnvironment({HUB_WASM_OPT:tool.path,HUB_WASM_OPT_SHA256:tool.sha256,RUSTUP_TOOLCHAIN:pin.compiler});
    await runLogged(run,'compile-hub','bash',['scripts/build-hub.sh'],{env,quiet:flags.json});
    const bytes=await readFile(join(ROOT,'target/proof-artifacts/marketplace-hub.wasm')),committed=await readFile(join(ROOT,pin.expected.artifact)),digest=sha256(bytes);
    const codeHash=base58(Buffer.from(digest,'hex')),manifest=await readJson('deployments/qualification.json');
    if(!bytes.equals(committed)||digest!==pin.expected.sha256||bytes.length!==pin.expected.bytes||codeHash!==pin.expected.nearCodeHash||codeHash!==manifest.contract.codeHash)throw Object.assign(new Error('Rebuilt contract differs from the committed deployed artifact or pinned manifest. Do not treat this as a verified build.'),{exitCode:1});
    const inputs={};for(const path of ['Cargo.toml','Cargo.lock','rust-toolchain.toml','contracts/marketplace-hub/Cargo.toml','contracts/marketplace-hub/src/lib.rs'])inputs[path]=sha256(await readFile(join(ROOT,path)));
    const top=commandOutput('git',['rev-parse','--show-toplevel']);
    const sourceCommit=top.ok&&resolve(top.output)===resolve(ROOT)?commandOutput('git',['rev-parse','HEAD']).output:null;
    await saveReport(run,{status:'build-verified',kind:'build',sourceCommit,toolchain:rust,platform:process.platform+'-'+process.arch,optimizer:{version:tool.version,archive:tool.archive,archiveSha256:tool.archiveSha256,binarySha256:tool.sha256},artifact:{bytes:bytes.length,sha256:digest,nearCodeHash:codeHash,matchesCommitted:true},sourceInputs:inputs,scope:'Compiled source matches the committed deployment binary. No RPC reads, deployment, wallet keys or public funds are used; live chain state is a separate check.'},flags);
  } catch(error) {
    const exitCode=error.exitCode===2?2:1;
    await saveReport(run,{status:exitCode===2?'prerequisites-unavailable':'failed',kind:'build',message:error.message,...(error.action?{action:error.action}:{})},flags);process.exitCode=exitCode;
  }
}
if(process.argv[1]&&new URL(import.meta.url).pathname===process.argv[1])await main();
