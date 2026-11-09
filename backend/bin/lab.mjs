#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, chmod, access, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from '../src/config.mjs';
await mkdir(join(ROOT,'.local/lab'),{recursive:true,mode:0o700});
const run=await mkdtemp(join(ROOT,'.local/lab/run-'));await chmod(run,0o700);
await writeFile(join(ROOT,'.local/lab/latest'),run,{mode:0o600});
const fixture=join(run,'chain.json');
const chain=spawn(join(ROOT,'target/debug/lab-chain'),[fixture],{cwd:ROOT,stdio:['pipe','inherit','inherit']});
let exited=false;chain.once('exit',()=>{exited=true;});
for(let i=0;i<600;i++){
 if(exited)throw new Error('Sandbox setup failed; run bash scripts/build-lab.sh first');
 try{await access(fixture);break;}catch{}
 await new Promise(r=>setTimeout(r,100));
}
let server,stopping=false,restarting=false;
function start(){server=spawn(process.execPath,[join(ROOT,'backend/bin/lab-server.mjs')],{cwd:ROOT,env:{...process.env,LAB_RUN:run},stdio:'inherit'});
 server.on('exit',code=>{if(code===0&&!stopping&&!restarting)setTimeout(start,200);});}
start();
// Restart the API while preserving the actual chain, SQLite journal and test identities.
process.on('SIGHUP',()=>{if(stopping||restarting)return;
 if(server.exitCode!==null||server.signalCode!==null){start();return;}
 restarting=true;server.once('exit',()=>{restarting=false;start();});server.kill('SIGTERM');});
function stop(){if(stopping)return;stopping=true;server?.kill('SIGTERM');chain.stdin.end('stop\n');setTimeout(()=>process.exit(0),1500).unref();}
process.once('SIGINT',stop);process.once('SIGTERM',stop);chain.once('exit',()=>{server?.kill('SIGTERM');});
