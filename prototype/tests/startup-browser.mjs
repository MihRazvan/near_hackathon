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
const now=Date.now(),ns=ms=>(BigInt(ms)*1000000n).toString();
const asset={id:'vehicle',title:'City van',description:'Delivery van',city:'Dublin',assetType:'van',spots:[{id:'side',name:'Side panel',box:{x:.2,y:.3,width:.4,height:.2}}]};
const sale={id:'sale',assetId:asset.id,owner:'owner.near',title:'Van campaign',status:'published',createdAt:new Date(now).toISOString(),rules:'Reviewed content',publication:{manifest:{asset}},schedule:{biddingClose:new Date(now+600000).toISOString(),serviceStart:new Date(now+1200000).toISOString(),serviceEnd:new Date(now+1800000).toISOString()},spots:[{id:'side',contractId:'offer',takeoverEnabled:true}]};
const catalog={sales:[sale],snapshots:[{accountId:'offer',state:{outcome:'open',cutoff_ns:ns(now+600000),next_price:'10000',holder:null},rights:{},campaign:{terms:{sale_id:sale.id}}}],owners:[],time:new Date(now).toISOString()};
const workspace={...catalog,wallet:'owner.near',chainPending:false,profile:{displayName:'Space owner'},dashboard:{assets:[],sales:[],bookings:[],incomingBookings:[],campaigns:[]},...Object.fromEntries(['arbiterSales','placements','media','requests','intents','nativePlans','publicationPlans','provisionPlans','issues','messages','placementMessages','support','saved','captures','routes','routeResults','operations','events'].map(k=>[k,[]]))};
const walletSource='export class ExternalWallets { constructor(){} list(){return [];} }';
const report=[],errors=[],writes=[];
async function setup(options={}){
 const context=await browser.newContext({viewport:{width:390,height:844},...options}),page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',async route=>{
  const r=route.request(),url=new URL(r.url()),accountWorkspace=options.workspace??workspace;
  if(url.origin!==origin){await route.abort();throw Error('Unexpected external request');}
  if(r.method()!=='GET'){writes.push(r.url());await route.abort();return;}
  if(url.pathname==='/wallets.js'){await options.walletGate?.promise;return route.fulfill({contentType:'text/javascript',body:walletSource});}
  if(!url.pathname.startsWith('/api/'))return route.continue();
  if(url.pathname==='/api/config'){await options.configGate?.promise;return route.fulfill({status:options.failConfig?503:200,json:options.failConfig?{error:{message:'Fixture service failure'}}:config});}
  if(url.pathname==='/api/browse'){await options.browseGate?.promise;return route.fulfill({json:catalog.sales});}
  if(url.pathname==='/api/auth/session'){await options.sessionGate?.promise;return route.fulfill({status:options.signedIn?200:401,json:options.signedIn?{wallet:'owner.near',expiresAt:new Date(now+3600000).toISOString()}:{error:{message:'Signed out'}}});}
  if(url.pathname==='/api/catalog'){await options.catalogGate?.promise;return route.fulfill({status:options.failCatalog?503:200,json:options.failCatalog?{error:{message:'Availability check is temporarily unavailable.'}}:catalog});}
  if(url.pathname==='/api/workspace'){
   if(url.searchParams.get('local')==='1'&&options.localWorkspace)return route.fulfill({json:{...accountWorkspace,snapshots:[],chainPending:true}});
   await options.workspaceGate?.promise;return route.fulfill({status:options.localWorkspace?200:503,json:options.localWorkspace?accountWorkspace:{error:{message:'Workspace temporarily unavailable.'}}});
  }
  if(url.pathname==='/api/wallet/balances'){await options.balanceGate?.promise;return route.fulfill({json:{wallet:'owner.near',intentsUsdc:'10000',nearUsdc:'10000',near:'1000000000000000000000000',tokenStorageRegistered:true}});}
  throw Error('Unexpected fixture API '+url.pathname);
 });
 return {context,page};
}
try{
 const configGate=deferred(),walletGate=deferred(),browseGate=deferred(),sessionGate=deferred(),catalogGate=deferred();
 const {context,page}=await setup({configGate,walletGate,browseGate,sessionGate,catalogGate,reducedMotion:'reduce'});
 await page.goto(origin,{waitUntil:'commit'});
 await page.locator('#startup[aria-busy="true"]').waitFor();
 assert.equal(await page.locator('.site-header').count(),0);
 assert.equal(await page.locator('#startup').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(26, 26, 26)');
 assert.equal(await page.locator('.startup-track span').evaluate(el=>getComputedStyle(el).animationName),'none');
 if(process.env.STARTUP_SCREENSHOT_DIR){await mkdir(process.env.STARTUP_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:resolve(process.env.STARTUP_SCREENSHOT_DIR,'startup-mobile.png')});}
 configGate.resolve();await page.locator('#home-title').waitFor();
 assert.equal(await page.locator('#startup').count(),0);
 assert.match(await page.locator('.market-invitation').innerText(),/Loading available spaces/);
 assert.doesNotMatch(await page.locator('body').innerText(),/List the first space/);
 browseGate.resolve();await page.locator('.asset-card').waitFor();
 assert.match(await page.locator('.asset-card').innerText(),/City van[\s\S]*Checking availability/i);
 await page.locator('.market-card-link').click();await page.locator('.placement-picker').waitFor();
 assert.match(await page.locator('.placement-booking').innerText(),/Checking availability/);
 assert.equal(await page.locator('a[href^="/checkout/"]').count(),0);
 await page.getByRole('link',{name:'Sign in',exact:true}).click();
 assert.match(await page.locator('#main').innerText(),/Opening your workspace/);
 const sessionRequest=page.waitForRequest(r=>r.url().endsWith('/api/auth/session'));
 walletGate.resolve();await sessionRequest;
 const catalogRequest=page.waitForRequest(r=>r.url().endsWith('/api/catalog'));
 sessionGate.resolve();await catalogRequest;
 await page.getByRole('button',{name:'Connect NEAR wallet · Meteor',exact:true}).waitFor();
 // Sign-in and public navigation work while the chain response is still held.
 await page.locator('.mobile-nav-links a[href="/explore"]').click();await page.locator('.asset-card').waitFor();
 await page.locator('.market-card-link').click();
 catalogGate.resolve();await page.getByRole('link',{name:'Reserve this spot',exact:true}).waitFor();
 assert.match(await page.locator('.placement-booking-price').innerText(),/0\.01 USDC/);
 assert.equal(new URL(page.url()).search,'?sale=sale');
 report.push('Homepage, published vehicles, deep links and wallet choice work before chain reads finish; checkout only appears after verification');
 await context.close();
 {
  const catalogGate=deferred(),test=await setup({catalogGate});
  const catalogRequest=test.page.waitForRequest(r=>r.url().endsWith('/api/catalog'));
  await test.page.goto(origin+'/explore');await catalogRequest;
  await test.page.locator('.search-bar [name="q"]').fill('Dublin');
  const catalogResponse=test.page.waitForResponse(r=>r.url().endsWith('/api/catalog'));
  catalogGate.resolve();await catalogResponse;
  await test.page.evaluate(()=>window.dispatchEvent(new Event('app:changed')));
  assert.equal(await test.page.locator('.search-bar [name="q"]').inputValue(),'Dublin');
  assert.equal(await test.page.locator('.search-bar [name="q"]').evaluate(e=>document.activeElement===e),true);
  await test.page.locator('.mobile-nav-links a[href="/explore"]').click();
  assert.match(await test.page.locator('.asset-card').innerText(),/0\.01 USDC/);
  report.push('Background verification preserves search text and keyboard focus');await test.context.close();
 }
 {
  const options={failConfig:true},test=await setup(options);
  await test.page.goto(origin);await test.page.getByRole('button',{name:'Try again',exact:true}).waitFor();
  assert.equal(await test.page.locator('#startup').getAttribute('aria-busy'),'false');
  assert.equal(await test.page.locator('#main').count(),0);
  assert.equal(await test.page.getByRole('alert').count(),1);
  assert.doesNotMatch(await test.page.locator('body').innerText(),/Fixture|Connecting your workspace|Preparing the marketplace/);
  options.failConfig=false;await test.page.getByRole('button',{name:'Try again',exact:true}).click();await test.page.locator('#main').waitFor();
  assert.equal(await test.page.locator('#startup').count(),0);
  report.push('Configuration failures retain the branded accessible retry screen');await test.context.close();
 }
 {
  const options={failCatalog:true},test=await setup(options);
  await test.page.goto(origin+'/spaces/vehicle?sale=sale');await test.page.locator('#connected-notice.orange').waitFor();
  assert.equal(await test.page.locator('#startup').count(),0);
  assert.equal(await test.page.locator('a[href^="/checkout/"]').count(),0);
  options.failCatalog=false;await test.page.getByRole('button',{name:'Check availability',exact:true}).click();
  await test.page.getByRole('link',{name:'Reserve this spot',exact:true}).waitFor();
  report.push('A chain outage leaves the site usable and a retry recovers verified availability');await test.context.close();
 }
 {
  const workspaceGate=deferred(),test=await setup({signedIn:true,workspaceGate});
  const workspaceRequest=test.page.waitForRequest(r=>new URL(r.url()).pathname==='/api/workspace');
  await test.page.goto(origin);await test.page.locator('#home-title').waitFor();await workspaceRequest;
  await test.page.locator('.mobile-nav-links a[href="/host"]').click();
  assert.match(await test.page.locator('#main').innerText(),/Opening your workspace/);
  assert.doesNotMatch(await test.page.locator('#main').innerText(),/Connect a wallet|No campaigns|No spaces/);
  workspaceGate.resolve();await test.page.getByRole('button',{name:'Try again',exact:true}).waitFor();
  assert.match(await test.page.locator('#main').innerText(),/Your workspace could not load/);
  report.push('Restored accounts wait for their own workspace without flashing signed-out or empty account data');await test.context.close();
 }
 {
  const workspaceGate=deferred(),balanceGate=deferred(),test=await setup({signedIn:true,localWorkspace:true,workspaceGate,balanceGate,viewport:{width:1440,height:1000}});
  await test.page.goto(origin+'/settings/wallets');await test.page.locator('[data-live-action="disconnect"]').waitFor();
  assert.match(await test.page.locator('#main').innerText(),/Available balance: Checking/);
  await test.page.locator('.site-header a[href="/profile"]').click();
  await test.page.locator('#details summary').click();
  await test.page.locator('[name="displayName"]').fill('Keep this unsaved edit');
  workspaceGate.resolve();await test.page.evaluate(()=>window.dispatchEvent(new Event('app:walletproviders')));
  assert.equal(await test.page.locator('[name="displayName"]').inputValue(),'Keep this unsaved edit');
  await test.page.locator('a[href="/profile/balance"]').click();
  assert.match(await test.page.locator('#main').innerText(),/Checking your live campaign status/);
  assert.equal(await test.page.locator('form[data-live-form="withdraw-native"]').count(),0);
  balanceGate.resolve();await test.page.locator('form[data-live-form="withdraw-native"]').waitFor();
  assert.match(await test.page.locator('#main').innerText(),/0\.01 USDC/);
  report.push('Account controls and draft editing work before live checks; delayed balances cannot appear as spendable zero or erase edits');await test.context.close();
 }
 for(const width of [320,390,768,1440]){
  const test=await setup({signedIn:true,localWorkspace:true,viewport:{width,height:1000}});
  await test.page.goto(origin+'/host');await test.page.locator('#first-campaign-title').waitFor();
  assert.equal(await test.page.locator('.sidebar,.workspace-switch,.mobile-workspace-nav').count(),0);
  assert.equal(await test.page.locator('.site-nav a').count(),3);
  assert.match(await test.page.locator('#main').innerText(),/Create your\s*first listing/);
  assert.doesNotMatch(await test.page.locator('#main').innerText(),/Your earnings|Recent bookings|0 USDC|Calendar|Performance/);
  assert.equal(await test.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  if(process.env.ACCOUNT_SCREENSHOT_DIR){await mkdir(process.env.ACCOUNT_SCREENSHOT_DIR,{recursive:true});await test.page.screenshot({path:resolve(process.env.ACCOUNT_SCREENSHOT_DIR,'first-campaign-'+width+'.png'),fullPage:true});}
  await test.page.goto(origin+'/profile');await test.page.locator('#orders').waitFor();
  assert.equal(await test.page.locator('h1').count(),1);
  assert.match(await test.page.locator('#main').innerText(),/Your first booking starts in the marketplace/);
  assert.equal(await test.page.locator('.site-nav a[aria-current=page]').innerText(),'Profile');
  assert.equal(await test.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await test.page.locator('#details summary').click();await test.page.locator('[name=displayName]').fill('New account name');
  if(process.env.ACCOUNT_SCREENSHOT_DIR)await test.page.screenshot({path:resolve(process.env.ACCOUNT_SCREENSHOT_DIR,'profile-'+width+'.png'),fullPage:true});
  await test.page.goto(origin+'/settings/profile');await test.page.locator('#details[open]').waitFor();
  assert.equal(new URL(test.page.url()).pathname,'/profile');assert.equal(new URL(test.page.url()).hash,'#details');
  await test.page.goto(origin+'/buy/money?next=%2Fcheckout%2Fsale');await test.page.locator('form[data-live-form=withdraw-native]').waitFor();
  assert.equal(new URL(test.page.url()).pathname,'/profile/balance');assert.equal(new URL(test.page.url()).search,'?next=%2Fcheckout%2Fsale');
  await test.context.close();
 }
 report.push('First-time dashboard, profile and legacy account links work without sidebars at 320, 390, 768 and 1440 pixels');
 for(const width of [390,1440]){
  const a={...asset,owner:'owner.near',photoUrl:'/images/van-side.webp'},s={...sale,spots:[{id:'side',contractId:'offer',priceCents:'1',takeoverEnabled:true},{id:'rear',contractId:'rear',priceCents:'1',takeoverEnabled:false}],publication:{manifest:{asset:a}}};
  const terms={sale_id:s.id,artwork_due_ns:ns(now+600000),service_end_ns:ns(now+1800000)};
  const snapshots=['offer','rear'].map((accountId,i)=>({accountId,mode:'hub',state:{outcome:'open',seller_id:'owner.near',holder:{account_id:'buyer.near'},cutoff_ns:ns(now-60000),refund_end_ns:ns(now+2400000),next_price:'20000',potential_seller_revenue:'10000',artwork_locked:i===1,nft_minted:true},rights:{active:true,bidding_closed:true,current_owner_id:'owner.near',proposal:i===0?{revision:'1'}:null},campaign:{terms,delivery_proof:null,open_issues:0},credits:{}}));
  const values={...workspace,sales:[s],snapshots,placements:snapshots,saved:[{saleId:s.id,saved:true}],dashboard:{...workspace.dashboard,assets:[a],sales:[s],bookings:[{id:'prior-booking',saleId:s.id,contractId:'offer',owner:'owner.near',accepted:true,amount:'10000',status:'outbid'}]}};
  const test=await setup({signedIn:true,localWorkspace:true,workspace:values,viewport:{width,height:1000}});
  await test.page.goto(origin+'/host');await test.page.locator('.dashboard-attention').first().waitFor();
  assert.equal(await test.page.locator('.dashboard-campaign').count(),1);assert.match(await test.page.locator('#main').innerText(),/Review artwork/);assert.match(await test.page.locator('#main').innerText(),/Add installation evidence/);
  await test.page.locator('#earnings > summary').click();assert.equal(await test.page.locator('h1').count(),1);
  assert.equal(await test.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  if(process.env.ACCOUNT_SCREENSHOT_DIR)await test.page.screenshot({path:resolve(process.env.ACCOUNT_SCREENSHOT_DIR,'owner-active-'+width+'.png'),fullPage:true});
  await test.page.locator((width<800?'.mobile-nav-links':'.site-nav')+' a[href="/profile"]').click();await test.page.locator('#rights').waitFor();
  assert.match(await test.page.locator('#orders').innerText(),/Taken Over/);assert.match(await test.page.locator('#saved').innerText(),/City van/);
  await test.page.locator('#brand > summary').click();assert.equal(await test.page.locator('h1').count(),1);assert.equal(await test.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  if(process.env.ACCOUNT_SCREENSHOT_DIR)await test.page.screenshot({path:resolve(process.env.ACCOUNT_SCREENSHOT_DIR,'profile-active-'+width+'.png'),fullPage:true});
  await test.context.close();
 }
 report.push('Active owner dashboard retains two independent placement actions and earnings, while profile shows bookings, NFTs and saved spaces at phone and desktop widths');

 const noJs=await browser.newContext({javaScriptEnabled:false,viewport:{width:320,height:640}}),fallback=await noJs.newPage();await fallback.goto(origin);
 assert.equal(await fallback.locator('#startup').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(26, 26, 26)');
 assert.match(await fallback.locator('noscript').innerText(),/Enable JavaScript/);
 assert.equal(await fallback.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await noJs.close();report.push('Styled static first paint and JavaScript-disabled guidance fit a 320px screen');
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);console.log(JSON.stringify({checks:report,pageErrors:errors,apiWrites:writes},null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
