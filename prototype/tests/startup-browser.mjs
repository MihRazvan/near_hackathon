// Startup UX regression. Static build + isolated API fixtures; no keys or chain calls.
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require=createRequire(new URL('../../backend/package.json',import.meta.url));
const {chromium}=require('playwright');
const root=fileURLToPath(new URL('../dist/',import.meta.url));
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.woff2':'font/woff2'};
const server=http.createServer(async(req,res)=>{
 try{
  assert.equal(req.method,'GET');const pathname=new URL(req.url,'http://localhost').pathname;
  const file=pathname==='/'||!extname(pathname)?resolve(root,'index.html'):resolve(root,'.'+pathname);
  assert.ok(file.startsWith(root));const data=await readFile(file);
  res.writeHead(200,{'Content-Type':types[extname(file)]??'application/octet-stream'});res.end(data);
 }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const config={production:true,network:'sandbox',wallets:[],developmentWallets:[],publicationMode:'hub',aiAvailable:false};
const catalog={sales:[],snapshots:[],owners:[],time:new Date().toISOString()};
const walletSource='export class ExternalWallets { constructor(){} list(){return [];} }';
const report=[],errors=[],writes=[];
async function setup(options={}){
 const context=await browser.newContext({viewport:{width:390,height:844},...options}),page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',async route=>{
  const r=route.request(),url=new URL(r.url());
  if(url.origin!==origin){await route.abort();throw Error('Unexpected external request');}
  if(r.method()!=='GET'){writes.push(r.url());await route.abort();return;}
  if(url.pathname==='/wallets.js')return route.fulfill({contentType:'text/javascript',body:walletSource});
  if(!url.pathname.startsWith('/api/'))return route.continue();
  if(url.pathname==='/api/config'){await options.configGate?.promise;return route.fulfill({status:options.failConfig?503:200,json:options.failConfig?{error:{message:'Fixture service failure'}}:config});}
  if(url.pathname==='/api/auth/session'){await options.sessionGate?.promise;return route.fulfill({status:401,json:{error:{message:'Signed out'}}});}
  if(url.pathname==='/api/catalog'){await options.catalogGate?.promise;return route.fulfill({status:options.failCatalog?503:200,json:options.failCatalog?{error:{message:'Fixture catalog failure'}}:catalog});}
  throw Error('Unexpected fixture API '+url.pathname);
 });
 return {context,page};
}
try{
 const configGate=deferred(),sessionGate=deferred(),catalogGate=deferred();
 const {context,page}=await setup({configGate,sessionGate,catalogGate,reducedMotion:'reduce'});
 await page.goto(origin+'/explore?type=van',{waitUntil:'commit'});
 await page.locator('#startup[aria-busy="true"]').waitFor();
 assert.equal(await page.locator('.site-header').count(),0);
 assert.equal(await page.locator('#startup').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(26, 26, 26)');
 assert.equal(await page.locator('.startup-track span').evaluate(el=>getComputedStyle(el).animationName),'none');
 if(process.env.STARTUP_SCREENSHOT_DIR){await mkdir(process.env.STARTUP_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:resolve(process.env.STARTUP_SCREENSHOT_DIR,'startup-mobile.png')});}
 const sessionRequest=page.waitForRequest(r=>r.url().endsWith('/api/auth/session'));
 configGate.resolve();await sessionRequest;
 await page.evaluate(()=>window.dispatchEvent(new Event('app:changed')));
 assert.equal(await page.locator('#main').count(),0);
 assert.equal(await page.locator('#startup[aria-busy="true"]').count(),1);
 const catalogRequest=page.waitForRequest(r=>r.url().endsWith('/api/catalog'));
 sessionGate.resolve();await catalogRequest;
 assert.equal(await page.locator('#main').count(),0);
 assert.doesNotMatch(await page.locator('body').innerText(),/Connecting your workspace|Preparing the marketplace/);
 catalogGate.resolve();await page.locator('#main').waitFor();
 assert.equal(await page.locator('#startup').count(),0);
 assert.equal(new URL(page.url()).search,'?type=van');
 report.push('Branded first paint, reduced motion, no intermediate account flash, and correct deep link after delayed configuration/session/catalog');
 await context.close();
 for(const failure of ['failConfig','failCatalog']){
  const options={[failure]:true},test=await setup(options);
  await test.page.goto(origin);await test.page.getByRole('button',{name:'Try again',exact:true}).waitFor();
  assert.equal(await test.page.locator('#startup').getAttribute('aria-busy'),'false');
  assert.equal(await test.page.locator('#main').count(),0);
  assert.equal(await test.page.getByRole('alert').count(),1);
  assert.doesNotMatch(await test.page.locator('body').innerText(),/Fixture|Connecting your workspace|Preparing the marketplace/);
  options[failure]=false;await test.page.getByRole('button',{name:'Try again',exact:true}).click();await test.page.locator('#main').waitFor();
  assert.equal(await test.page.locator('#startup').count(),0);
  report.push(failure+' has an accessible retry state and recovers after reload');await test.context.close();
 }
 const noJs=await browser.newContext({javaScriptEnabled:false,viewport:{width:320,height:640}}),fallback=await noJs.newPage();await fallback.goto(origin);
 assert.equal(await fallback.locator('#startup').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(26, 26, 26)');
 assert.match(await fallback.locator('noscript').innerText(),/Enable JavaScript/);
 assert.equal(await fallback.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await noJs.close();report.push('Styled static first paint and JavaScript-disabled guidance fit a 320px screen');
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);console.log(JSON.stringify({checks:report,pageErrors:errors,apiWrites:writes},null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
