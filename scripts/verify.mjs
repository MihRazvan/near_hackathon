#!/usr/bin/env node
// Local reproducibility checks only. Does not import the funded runtime here,
// load operator credentials, call public RPCs, or sign any transactions.
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdir,readFile,readdir,writeFile,open} from 'node:fs/promises';
import {join,relative,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {ROOT,isEntryPoint,cleanEnvironment} from './verification-support.mjs';

export function parseOptions(args){
 const result={offline:false,skipInstall:false,json:false,help:false};
 for(const arg of args){if(arg==='--offline')result.offline=true;else if(arg==='--skip-install')result.skipInstall=true;else if(arg==='--json')result.json=true;else if(arg==='--help'||arg==='-h')result.help=true;else throw Error('Unknown option. Use node scripts/verify.mjs --help.');}
 if(result.offline&&result.skipInstall)throw Error('--skip-install is unnecessary with --offline.');
 return result;
}
export function supportedNode(version){const [major,minor]=version.replace(/^v/,'').split('.').map(Number);return major>22||major===22&&minor>=23;}
export function sourceIdentity(directory=ROOT){
 const top=spawnSync('git',['rev-parse','--show-toplevel'],{cwd:directory,env:cleanEnvironment(),encoding:'utf8',timeout:5000});
 if(top.status!==0||resolve(top.stdout.trim())!==resolve(directory))return {kind:'source-archive',commit:null};
 const commit=spawnSync('git',['rev-parse','HEAD'],{cwd:directory,env:cleanEnvironment(),encoding:'utf8',timeout:5000});
 const status=spawnSync('git',['status','--porcelain','--untracked-files=normal'],{cwd:directory,env:cleanEnvironment(),encoding:'utf8',timeout:5000});
 return {kind:'git-checkout',commit:/^[a-f0-9]{40}$/.test(commit.stdout.trim())?commit.stdout.trim():null,uncommittedChanges:status.status===0?!!status.stdout.trim():null};
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function runStage(report,{name,command,args,env,timeoutMs=180000}){
 const logPath=join(report.directory,name+'.log'),handle=await open(logPath,'w',0o600),start=performance.now();
 if(!report.json)process.stdout.write(name+'… ');
 let result;
 try{
  result=await new Promise(resolve=>{
   const child=spawn(command,args,{cwd:ROOT,env,stdio:['ignore',handle.fd,handle.fd]});
   let expired=false;
   const timer=setTimeout(()=>{expired=true;child.kill('SIGTERM');setTimeout(()=>child.kill('SIGKILL'),3000).unref();},timeoutMs);
   child.once('error',error=>{clearTimeout(timer);resolve({exitCode:null,errorCode:error.code??'SPAWN_FAILED'});});
   child.once('exit',(exitCode,signal)=>{clearTimeout(timer);resolve({exitCode,signal,timedOut:expired});});
  });
 }finally{await handle.close();}
 const item={name,command:[command,...args],...result,seconds:Math.round((performance.now()-start)/10)/100,logPath:relative(ROOT,logPath)};
 report.checks.push(item);if(!report.json)console.log(item.exitCode===0?'passed':'failed (see '+item.logPath+')');
 if(item.exitCode!==0){const error=Error(name+' failed. See '+item.logPath);const output=await readFile(logPath,'utf8');const unavailable=item.errorCode==='ENOENT'||name.endsWith('install')&&(item.timedOut||/EAI_AGAIN|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|ECONNRESET|E429|E502|E503|E504/.test(output));error.exitCode=unavailable?2:1;throw error;}
 return logPath;
}
async function unusedPort(){const server=createServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const port=server.address().port;await new Promise(r=>server.close(r));return port;}
export async function probeServer(report,env){
 const port=await unusedPort(),origin='http://127.0.0.1:'+port,logPath=join(report.directory,'startup.log'),handle=await open(logPath,'w',0o600),start=performance.now();
 const child=spawn(process.execPath,['backend/bin/server.mjs'],{cwd:ROOT,env:cleanEnvironment({...env,APP_PORT:String(port),APP_ORIGIN:origin,APP_BIND_HOST:'127.0.0.1',APP_STATE_DIR:join(report.directory,'state')}),stdio:['ignore',handle.fd,handle.fd]});
 let spawnError;child.once('error',e=>{spawnError=e;});
 const exited=new Promise(resolve=>child.once('exit',resolve));
 try{
  let ready=false;
  for(let i=0;i<100;i++){
   if(spawnError||child.exitCode!==null)throw Error('Isolated API exited. See '+relative(ROOT,logPath));
   try{const response=await fetch(origin+'/api/health',{signal:AbortSignal.timeout(500)});const data=await response.json();if(response.ok&&data.ok&&data.service==='everywhere-backend'){ready=true;break;}}catch{}
   await sleep(100);
  }
  if(!ready)throw Error('Isolated API did not become healthy. See '+relative(ROOT,logPath));
  const read=async path=>{const r=await fetch(origin+path,{signal:AbortSignal.timeout(3000)});if(!r.ok)throw Error('Isolated API read failed: '+path);return r;};
  const config=await(await read('/api/config')).json(),catalog=await(await read('/api/catalog')).json(),html=await(await read('/')).text();
  if(config.executionEnabled!==false||config.developmentWallets?.length||catalog.sales?.length!==0||!html.includes('/assets/index-'))throw Error('Fresh startup must serve the build with execution disabled, no funded identities and empty local inventory.');
  report.checks.push({name:'isolated-startup',exitCode:0,seconds:Math.round((performance.now()-start)/10)/100,observed:{health:'ok',frontend:'built',executionEnabled:false,sales:0,fundedWallets:0},logPath:relative(ROOT,logPath)});
  if(!report.json)console.log('isolated-startup… passed (empty local inventory; transactions disabled)');
 }finally{
  if(child.exitCode===null&&!spawnError){child.kill('SIGTERM');const timer=setTimeout(()=>child.kill('SIGKILL'),25000);timer.unref();await exited;clearTimeout(timer);}
  await handle.close();
 }
}
export async function main(args=process.argv.slice(2)){
 let options;
 try{options=parseOptions(args);}catch(error){if(args.includes('--json'))console.log(JSON.stringify({schema:'everywhere-verification/v1',kind:'quick',status:'invalid',error:error.message,checks:[]}));else console.error(error.message);return 2;}
 if(options.help){console.log('Usage: node scripts/verify.mjs [--offline | --skip-install] [--json]\nDefault: install pinned dependencies, run tests/builds and check isolated local startup.\n--offline: only committed artifact integrity; no installs, RPC or chain verification.\n--skip-install: require existing backend/frontend dependencies.\nReports and logs: .local/verification/quick-<run>/\nExit codes: 0 passed, 1 a check failed, 2 invalid options or unavailable prerequisites/install.\nNo wallet keys, funded accounts, public chain calls or transactions.');return 0;}
 if(!supportedNode(process.version)){const error='Node.js 22.23 or newer is required. Current: '+process.version;if(options.json)console.log(JSON.stringify({schema:'everywhere-verification/v1',kind:'quick',status:'unavailable',error,checks:[]}));else console.error(error);return 2;}
 const directory=join(ROOT,'.local/verification','quick-'+Date.now()+'-'+randomUUID().slice(0,8));await mkdir(directory,{recursive:true,mode:0o700});
 const report={schema:'everywhere-verification/v1',kind:options.offline?'offline-integrity':'quick',startedAt:new Date().toISOString(),source:sourceIdentity(),node:process.version,platform:process.platform,architecture:process.arch,scope:options.offline?'Committed file integrity only; no chain verification.':'Application unit tests, builds and isolated empty-state startup. No wallet, mainnet, AI, bridge or physical-delivery qualification.',checks:[],directory,json:options.json};
 let exitCode=0;
 try{
  const env=cleanEnvironment();
  const offlineLog=await runStage(report,{name:'offline-integrity',command:process.execPath,args:['backend/bin/verify-evidence.mjs','--offline'],env});
  const offline=JSON.parse(await readFile(offlineLog,'utf8'));if(offline.status!=='offline-verified'||offline.chainVerification!=='not-performed')throw Error('Unexpected offline verification result.');
  if(!options.offline){
   if(!options.skipInstall)for(const prefix of ['backend','prototype'])await runStage(report,{name:prefix+'-install',command:process.platform==='win32'?'npm.cmd':'npm',args:['ci','--prefix',prefix,'--ignore-scripts'],env});
   await runStage(report,{name:'verification-tests',command:process.execPath,args:['--test',...(await readdir(join(ROOT,'scripts'))).filter(name=>name.endsWith('.test.mjs')).sort().map(name=>'scripts/'+name)],env});
   for(const prefix of ['backend','prototype'])await runStage(report,{name:prefix+'-tests',command:process.platform==='win32'?'npm.cmd':'npm',args:['test','--prefix',prefix],env});
   for(const [name,prefix,script] of [['wallet-build','backend','build:lab'],['frontend-build','prototype','build']])await runStage(report,{name,command:process.platform==='win32'?'npm.cmd':'npm',args:['run',script,'--prefix',prefix],env});
   await probeServer(report,env);
  }
  report.status='passed';
 }catch(error){exitCode=error.exitCode??1;report.status=exitCode===2?'unavailable':'failed';report.error=error.message;}
 report.finishedAt=new Date().toISOString();delete report.json;delete report.directory;
 const reportPath=join(directory,'report.json');await writeFile(reportPath,JSON.stringify(report,null,2)+'\n',{mode:0o600});
 const result={...report,reportPath:relative(ROOT,reportPath)};
 if(options.json)console.log(JSON.stringify(result,null,2));else console.log((exitCode===0?'Verification passed.':report.error)+'\nReport: '+result.reportPath+'\n'+report.scope);
 return exitCode;
}
if(isEntryPoint(import.meta.url))process.exitCode=await main();
