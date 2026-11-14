import {spawn, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {closeSync, lstatSync, mkdirSync, openSync, readFileSync, writeFileSync} from 'node:fs';
import {mkdir, mkdtemp, open, readFile, writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {delimiter, join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
const verificationDirectory = join(ROOT, '.local/verification');
const safeEnvironmentFile = join(verificationDirectory, 'disabled.env');
const environmentContents = 'INTEGRATION_ALLOW_MAINNET=false\nAPP_KEEPER_ENABLED=false\nINTEGRATION_ALLOW_FUNDED_BROWSER_WALLETS=false\n';
const overrideKeys = new Set(['APP_ENV','APP_ENV_FILE','APP_PORT','PORT','APP_ORIGIN','APP_API_ORIGIN','APP_BIND_HOST','APP_STATE_DIR','CARGO_TARGET_DIR','RUSTUP_TOOLCHAIN','RUSTFLAGS','HUB_WASM_OPT','HUB_WASM_OPT_SHA256','PLAYWRIGHT_CHANNEL','PLAYWRIGHT_BROWSERS_PATH']);

// Verification processes cannot inherit developer keys, funded wallets, OAuth
// tokens, preload scripts, or the project's private environment discovery.
export function cleanEnvironment(overrides = {}) {
  mkdirSync(verificationDirectory, {recursive: true, mode: 0o700});
  try {
    const fd = openSync(safeEnvironmentFile, 'wx', 0o600);
    try { writeFileSync(fd, environmentContents); } finally { closeSync(fd); }
  } catch (error) { if (error.code !== 'EEXIST') throw error; }
  const stat = lstatSync(safeEnvironmentFile);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) ||
      (process.getuid && stat.uid !== process.getuid()) || readFileSync(safeEnvironmentFile, 'utf8') !== environmentContents) {
    throw new Error('The isolated verification environment file must be an owner-only regular file containing only disabled execution settings.');
  }
  const env = Object.fromEntries(['PATH','HOME','TMPDIR','LANG','LC_ALL','SSL_CERT_FILE','SSL_CERT_DIR','NODE_EXTRA_CA_CERTS'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
  env.PATH = [join(homedir(), '.cargo/bin'), env.PATH || ''].join(delimiter);
  for (const [key, value] of Object.entries(overrides)) if (overrideKeys.has(key) && value !== undefined) env[key] = String(value);
  Object.assign(env, {CI:'true', CARGO_BUILD_JOBS:'2', APP_ENV:overrides.APP_ENV || 'test', APP_ENV_FILE:safeEnvironmentFile,
    INTEGRATION_ALLOW_MAINNET:'false', INTEGRATION_ALLOW_FUNDED_BROWSER_WALLETS:'false', APP_KEEPER_ENABLED:'false'});
  return env;
}

export function prerequisite(message, action) {
  return Object.assign(new Error(message), {exitCode:2, action});
}

export function commandOutput(command, args = [], env = cleanEnvironment()) {
  const result = spawnSync(command, args, {cwd:ROOT, env, encoding:'utf8', timeout:30000});
  return {ok:!result.error && result.status === 0, output:(result.stdout || '').trim(), error:result.error?.code, status:result.status};
}

export async function makeRun(kind) {
  await mkdir(verificationDirectory, {recursive:true, mode:0o700});
  const directory = await mkdtemp(join(verificationDirectory, kind + '-'));
  return {directory, reportPath:join(directory, 'report.json'), steps:[], startedAt:new Date().toISOString()};
}

export async function runLogged(run, name, command, args = [], {env=cleanEnvironment(), cwd=ROOT, timeoutMs=600000, quiet=false} = {}) {
  const logPath = join(run.directory, name + '.log'), file = await open(logPath, 'w', 0o600), start = performance.now();
  if (!quiet) console.error(name + '…');
  let result;
  try {
    result = await new Promise(resolvePromise => {
      const child = spawn(command, args, {cwd, env, stdio:['ignore', file.fd, file.fd]});
      let timedOut = false, kill;
      const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); kill = setTimeout(() => child.kill('SIGKILL'), 5000); kill.unref(); }, timeoutMs);
      const abort = () => child.kill('SIGTERM');
      process.once('SIGINT', abort);process.once('SIGTERM', abort);
      child.once('error', error => {clearTimeout(timer);clearTimeout(kill);process.off('SIGINT',abort);process.off('SIGTERM',abort);resolvePromise({exitCode:error.code === 'ENOENT' ? 2 : 1, error:error.code});});
      child.once('exit', (code, signal) => {clearTimeout(timer);clearTimeout(kill);process.off('SIGINT',abort);process.off('SIGTERM',abort);resolvePromise({exitCode:timedOut ? 2 : code ?? 1, ...(timedOut ? {error:'TIMEOUT'} : signal ? {signal} : {})});});
    });
  } finally { await file.close(); }
  const step = {name, command:[command,...args], ...result, seconds:Math.round((performance.now()-start)/10)/100, log:relative(ROOT,logPath)};
  run.steps.push(step);
  if (step.exitCode !== 0) {
    const output=await readFile(logPath,'utf8');
    const dependencyNetworkFailure=/Could not resolve host|failed to lookup address|[Cc]onnection (?:reset|refused)|[Nn]etwork is unreachable|[Ee]rror sending request|EAI_AGAIN|ENOTFOUND|ETIMEDOUT|HTTP(?: response)? (?:429|50[234])/.test(output);
    const unavailable=step.exitCode===2||step.error==='ENOENT'||step.error==='TIMEOUT'||dependencyNetworkFailure;
    throw Object.assign(new Error(name + ' failed. See ' + step.log), {exitCode:unavailable?2:1, step});
  }
  return step;
}

export async function saveReport(run, report, {json=false} = {}) {
  const result = {schema:'everywhere-verification/v1', startedAt:run.startedAt, finishedAt:new Date().toISOString(), ...report, steps:run.steps, reportPath:relative(ROOT,run.reportPath)};
  await writeFile(run.reportPath, JSON.stringify(result,null,2)+'\n', {mode:0o600});
  if (json) console.log(JSON.stringify(result,null,2));
  else {console.log(result.status);if(result.message)console.log(result.message);if(result.action)console.log(result.action);console.log('Report: ' + result.reportPath);}
  return result;
}

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export async function readJson(path) { return JSON.parse(await readFile(resolve(ROOT,path),'utf8')); }

export function parseFlags(args, {values=[]} = {}) {
  const flags = {};
  for(let i=0;i<args.length;i++) {
    const arg=args[i];
    if(['--help','--json','--check-only','--skip-install'].includes(arg)) flags[arg.slice(2)]=true;
    else if(values.includes(arg) && args[i+1] && !args[i+1].startsWith('--')) flags[arg.slice(2)]=args[++i];
    else throw prerequisite('Unknown or incomplete option: ' + arg, 'Use --help for supported options.');
  }
  return flags;
}

export function requireBasicTools({rust=true, python=true, tar=false} = {}) {
  const [major,minor]=process.versions.node.split('.').map(Number);
  if(major<22 || major===22&&minor<23)throw prerequisite('Node.js 22.23 or newer is required.','Install Node.js 22.23+ or the production version, 24.12.0.');
  const env=cleanEnvironment(), tools=[...(rust?['rustup']:[]),...(python?['python3']:[]),...(tar?['tar']:[])];
  for(const tool of tools)if(!commandOutput(tool,['--version'],env).ok)throw prerequisite(tool+' is not available.',tool==='rustup'?'Install rustup from https://rustup.rs, then retry.':'Install '+tool+' and add it to PATH, then retry.');
  return env;
}

export async function ensureRust(run, flags) {
  const env=cleanEnvironment(),version='1.95.0';
  const hasCompiler=commandOutput('rustup',['run',version,'rustc','--version'],env).ok;
  if(!hasCompiler) {
    if(flags['skip-install'] || flags['check-only'])throw prerequisite('Pinned Rust '+version+' is not installed.','Run: rustup toolchain install '+version+' --profile minimal --target wasm32-unknown-unknown');
    await runLogged(run,'rust-toolchain','rustup',['toolchain','install',version,'--profile','minimal','--target','wasm32-unknown-unknown'],{env,quiet:flags.json});
  }
  const targets=commandOutput('rustup',['target','list','--installed','--toolchain',version],env);
  if(!targets.ok || !targets.output.split('\n').includes('wasm32-unknown-unknown')) {
    if(flags['skip-install'] || flags['check-only'])throw prerequisite('The pinned Wasm target is not installed.','Run: rustup target add wasm32-unknown-unknown --toolchain '+version);
    await runLogged(run,'rust-wasm-target','rustup',['target','add','wasm32-unknown-unknown','--toolchain',version],{env,quiet:flags.json});
  }
  return version;
}
