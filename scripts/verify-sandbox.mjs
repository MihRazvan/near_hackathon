#!/usr/bin/env node
// Orchestrates the existing real local-chain qualification, never public funds.
import {createRequire} from 'node:module';
import {access, copyFile, mkdir, readFile, readdir} from 'node:fs/promises';
import {createServer} from 'node:net';
import {join, relative} from 'node:path';
import {ROOT, cleanEnvironment, commandOutput, ensureRust, makeRun, parseFlags, prerequisite, readJson, requireBasicTools, runLogged, saveReport, sha256} from './verification-support.mjs';

const help=`Usage: node scripts/verify-sandbox.mjs [--check-only] [--skip-install] [--browser chrome|chromium] [--json]
Prepare pinned build inputs and run owner → purchase → takeover → NFT transfer →
artwork → fulfillment → issue resolution → payouts through the actual interface
against a fresh NEAR Sandbox 2.14.0 chain with valueless fixture tokens.
Requires Node.js 22.23+, npm, rustup, Python 3, bash and tar on Linux or macOS.
Default: locked npm installs, pinned Rust/optimizer setup, hash-checked public
Intents binary download, local fixture builds and browser qualification.
Chrome is used when installed; otherwise bundled Chromium is installed locally.
--skip-install requires dependencies, pinned inputs and a browser already present.
--check-only checks prerequisites without installing, compiling, starting a chain,
or signing. It may report missing prerequisites on a brand-new machine.
--json emits actual results. Private logs/fixtures remain in ignored .local storage.
Exit 0: verified/ready; 1: scenario/assertion failure; 2: prerequisite unavailable.
Setup may download public tooling/code. The scenario uses only a loopback chain;
it never loads personal environment files, mainnet keys, or a production database.`;

const browserDirectory=join(ROOT,'.local/verification-tools/browsers');
const require=createRequire(join(ROOT,'backend/package.json'));

async function available(path){try{await access(path);return true;}catch{return false;}}

async function ensureDependencies(run,flags) {
  const installed=await available(join(ROOT,'backend/node_modules/playwright/cli.js'))&&await available(join(ROOT,'prototype/node_modules/vite/bin/vite.js'));
  if(flags['check-only']||flags['skip-install']) {
    if(!installed)throw prerequisite('Locked JavaScript dependencies are not installed.','Run: node scripts/verify.mjs, or retry this command without --skip-install.');
  } else {
    for(const directory of ['backend','prototype'])await runLogged(run,'install-'+directory,'npm',['ci','--prefix',directory,'--ignore-scripts'],{quiet:flags.json});
  }
}

async function chromeInstalled(){
  for(const path of ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing','/opt/google/chrome/chrome','/usr/bin/google-chrome','/usr/bin/google-chrome-stable'])if(await available(path))return true;
  return commandOutput('google-chrome',['--version']).ok;
}

async function ensureBrowser(run,flags) {
  const channel=flags.browser||(await chromeInstalled()?'chrome':'chromium');
  if(!['chrome','chromium'].includes(channel))throw prerequisite('Unsupported browser choice.','Choose --browser chrome or --browser chromium.');
  const env=cleanEnvironment({PLAYWRIGHT_CHANNEL:channel,...(channel==='chromium'?{PLAYWRIGHT_BROWSERS_PATH:browserDirectory}:{})});
  try{require.resolve('playwright');}catch{throw prerequisite('Playwright is unavailable.','Install the locked backend dependencies first.');}
  const launchCode=`const {chromium}=await import('./backend/node_modules/playwright/index.mjs');const browser=await chromium.launch({headless:true,channel:${JSON.stringify(channel)}});await browser.close();`;
  const canLaunch=()=>commandOutput(process.execPath,['--input-type=module','-e',launchCode],env).ok;
  if(!canLaunch()){
    if(channel==='chrome'||flags['skip-install']||flags['check-only'])throw prerequisite('A headless '+channel+' browser could not be launched.','Install Google Chrome, or run this command with --browser chromium without --skip-install. On Linux, missing system libraries can be installed with: npx --prefix backend playwright install --with-deps chromium');
    await runLogged(run,'install-chromium',process.execPath,['backend/node_modules/playwright/cli.js','install','chromium'],{env,timeoutMs:600000,quiet:flags.json});
    if(!canLaunch())throw prerequisite('Downloaded Chromium could not launch; system libraries may be missing.','On Linux run: node backend/node_modules/playwright/cli.js install --with-deps chromium, then retry.');
  }
  return {channel,env};
}

async function portAvailable() {
  return new Promise(resolvePromise=>{const server=createServer();server.once('error',()=>resolvePromise(false));server.listen(4330,'127.0.0.1',()=>server.close(()=>resolvePromise(true)));});
}

async function pinnedIntents(run,flags) {
  const pin=await readJson('proofs/intents-compatibility/pin.json'),path=join(ROOT,'proofs/intents-compatibility/artifacts/intents-mainnet.wasm');
  if(await available(path)) {
    if(sha256(await readFile(path))!==pin.deployed_code.artifact.sha256)throw new Error('The cached Intents verifier differs from its reviewed pin; refusing to execute it.');
  }else{
    if(flags['skip-install']||flags['check-only'])throw prerequisite('The pinned production Intents binary is not cached.','Run: python3 proofs/intents-compatibility/fetch-pinned.py, or retry without --skip-install.');
    try{await runLogged(run,'fetch-pinned-intents','python3',['proofs/intents-compatibility/fetch-pinned.py'],{quiet:flags.json,timeoutMs:120000});}
    catch(error){throw prerequisite('The exact pinned Intents artifact could not be retrieved.','Inspect '+error.step?.log+'. Public RPC access is required once; a changed upstream binary must not replace the reviewed pin.');}
  }
  return {sha256:sha256(await readFile(path)),codeHash:pin.intents_account.response.result.code_hash};
}

async function main() {
  let flags;
  try{flags=parseFlags(process.argv.slice(2),{values:['--browser']});if(flags.browser&&!['chrome','chromium'].includes(flags.browser))throw prerequisite('Unsupported browser choice.','Choose --browser chrome or --browser chromium.');}
  catch(error){const result={schema:'everywhere-verification/v1',status:'prerequisites-unavailable',kind:'sandbox',message:error.message,action:error.action};if(process.argv.includes('--json'))console.log(JSON.stringify(result,null,2));else console.error(result.message+'\n'+result.action);process.exitCode=2;return;}
  if(flags.help){console.log(help);return;}
  const run=await makeRun('sandbox');
  try{
    requireBasicTools({tar:true});
    if(!['linux','darwin'].includes(process.platform))throw prerequisite('The Sandbox fixture requires Linux or macOS.','Use Linux/WSL2 or macOS.');
    if(!commandOutput('npm',['--version']).ok)throw prerequisite('npm is not available.','Install npm with Node.js and retry.');
    if(!await portAvailable())throw prerequisite('The existing Sandbox harness requires free local port 4330.','Stop the local process using 127.0.0.1:4330, then retry.');
    const toolchain=await ensureRust(run,flags);
    await ensureDependencies(run,flags);
    const browser=await ensureBrowser(run,flags),intents=await pinnedIntents(run,flags);
    if(flags['check-only']){await saveReport(run,{status:'prerequisites-ready',kind:'sandbox',toolchain,browser:browser.channel,intents,scope:'Local prerequisite checks only; no chain started and no transactions signed.'},flags);return;}
    const env=cleanEnvironment({...browser.env,PLAYWRIGHT_CHANNEL:browser.channel,...(browser.channel==='chromium'?{PLAYWRIGHT_BROWSERS_PATH:browserDirectory}:{}),CARGO_TARGET_DIR:join(ROOT,'target'),RUSTUP_TOOLCHAIN:toolchain});
    await runLogged(run,'verify-contract-build',process.execPath,['scripts/verify-build.mjs','--json',...(flags['skip-install']?['--skip-install']:[])],{env,quiet:flags.json});
    await runLogged(run,'build-fixture-token','cargo',['build','--locked','--release','--target','wasm32-unknown-unknown','-p','proof-test-token'],{env,quiet:flags.json});
    await mkdir(join(ROOT,'target/proof-artifacts'),{recursive:true});await copyFile(join(ROOT,'target/wasm32-unknown-unknown/release/proof_test_token.wasm'),join(ROOT,'target/proof-artifacts/test-token.wasm'));
    await runLogged(run,'build-local-chain','cargo',['build','--locked','-p','technical-proof','--bin','hub-lab-chain'],{env,quiet:flags.json});
    for(const [name,args]of [['build-wallet',['run','build:lab','--prefix','backend']],['build-frontend',['run','build','--prefix','prototype']]])await runLogged(run,name,'npm',args,{env,quiet:flags.json});
    const resultDirectory=join(ROOT,'.local/product-sandbox');await mkdir(resultDirectory,{recursive:true,mode:0o700});const before=new Set(await readdir(resultDirectory));
    await runLogged(run,'production-interface',process.execPath,['backend/bin/product-sandbox.mjs'],{env,quiet:flags.json,timeoutMs:900000});
    const created=(await readdir(resultDirectory)).filter(name=>name.startsWith('run-')&&!before.has(name));
    if(created.length!==1)throw new Error('Could not identify the fresh Sandbox result; do not reuse an earlier qualification report.');
    const result=JSON.parse(await readFile(join(resultDirectory,created[0],'result.json'),'utf8'));
    if(result.network!=='isolated NEAR Sandbox'||result.productionMode!==true||result.finalOutcome!=='success'||result.offerLiabilities!=='0'||result.pendingWithdrawals!=='0'||result.totalReceived!==result.totalWithdrawn||!Array.isArray(result.checks)||!result.checks.length)throw new Error('The fresh Sandbox report did not satisfy the required terminal accounting and production-interface assertions.');
    await saveReport(run,{status:'sandbox-verified',kind:'sandbox',network:result.network,toolchain,browser:browser.channel,intents,hubCodeHash:result.hubCodeHash,signatures:result.signatures,checks:result.checks,accounting:{totalReceived:result.totalReceived,totalWithdrawn:result.totalWithdrawn,offerLiabilities:result.offerLiabilities,pendingWithdrawals:result.pendingWithdrawals},coverageLimits:result.coverageLimits,scope:'Fresh local NEAR execution and real cryptographic signatures using generated test identities and valueless tokens. Synthetic pinning transport and injected wallet UI; no physical installation or public Base bridge is established.'},flags);
  }catch(error){
    const exitCode=error.exitCode===2?2:1;
    await saveReport(run,{status:exitCode===2?'prerequisites-unavailable':'failed',kind:'sandbox',message:error.message,...(error.action?{action:error.action}:{})},flags);process.exitCode=exitCode;
  }
}
if(process.argv[1]&&new URL(import.meta.url).pathname===process.argv[1])await main();
