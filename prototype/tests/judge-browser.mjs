// Full built UI with isolated read-only API fixtures. Real wallet/chain coverage
// lives in backend/bin/product-sandbox.mjs; this suite covers presentation only.
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../backend/package.json',import.meta.url)),{chromium}=require('playwright');
const root=resolve('prototype/dist'),out=resolve('.local/judge-ui');await mkdir(out,{recursive:true});
const saleId='e22dd301-786f-476c-af74-0df7cd2e6168',wallet='0x'+'11'.repeat(20),other='0x'+'22'.repeat(20);
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.woff2':'font/woff2'};
let signedIn=false,currentWallet=wallet,evidenceFailure=false;
const manifest=JSON.parse(await readFile('deployments/qualification.json','utf8'));
const ns=ms=>String(BigInt(ms)*1000000n),testNow=Date.now();
const nftSnapshot={accountId:'nft-ui-offer',mode:'hub',qualified:true,state:{outcome:'open',nft_minted:true,artwork_locked:false,cutoff_ns:ns(testNow-60000),holder:{account_id:other}},rights:{bidding_closed:true,active:true,locked:false,current_owner_id:wallet,original_payer_id:other,token_id:'nft-ui-offer',revision:'1'},campaign:{terms:{sale_id:'nft-ui-sale',spot_id:'side',artwork_due_ns:ns(testNow+3600000)},open_issues:0},credits:{}};
const nftSale={id:'nft-ui-sale',title:'Creative studio placement · interface fixture',assetId:'nft-ui-asset',owner:'owner.near',publication:{manifest:{asset:{title:'City van',spots:[{id:'side',name:'Side panel'}]}}},schedule:{}};

const api=path=>{
 if(path==='/api/config')return {production:true,network:'sandbox',wallets:[],developmentWallets:[],publicationMode:'hub',aiAvailable:false};
 if(path==='/api/auth/session')return signedIn?{wallet:currentWallet}:{error:{message:'Signed out'}};
 if(path==='/api/browse')return [];
 if(path==='/api/catalog')return {sales:[],snapshots:[],owners:[],time:new Date().toISOString()};
 if(path==='/api/workspace')return {dashboard:{assets:[],sales:[],campaigns:[],bookings:[],incomingBookings:[]},wallet:currentWallet,chainPending:false,profile:{displayName:'UI qualification wallet'},placements:[nftSnapshot],sales:[nftSale],snapshots:[nftSnapshot],owners:[],requests:[],media:[],issues:[],support:[],placementMessages:[],messages:[],time:new Date().toISOString()};
 if(path==='/api/wallet/balances')return {intentsUsdc:'0',baseUsdc:'0',nativeNearUsdc:'0'};
 if(path==='/api/evidence/qualification')return evidenceFailure?{schema:manifest.schema,network:'mainnet',record:null,verification:{status:'unavailable'}}:{...manifest,verification:{...manifest.verification,receiptsVerifiedAt:manifest.verification.checkedAt}};
 if(path==='/api/campaign-records/'+saleId)return {schema:'everywhere-campaign-record/v1',network:'mainnet',status:evidenceFailure?'unavailable':'available',campaign:{id:saleId,title:'UI synthetic record fixture',asset:{name:'Synthetic van',city:'Bucharest',type:'van'},schedule:manifest.record.schedule,spots:[]},qualification:{matched:true,synthetic:true},snapshots:evidenceFailure?[]:[{qualified:true,observedAt:new Date().toISOString(),blockHeight:224079988,state:{outcome:'success',nft_minted:true},rights:{minted:true,tokenId:manifest.record.offerId,currentOwnerId:manifest.record.actors.buyerB,originalPayerId:manifest.record.actors.buyerB,locked:true},accounting:{received:'30000',withdrawn:'30000',pending:'0'},artwork:manifest.record.artifacts.artwork,delivery:{...manifest.record.artifacts.delivery,provenance:'synthetic-qualification'},links:{contract:'https://nearblocks.io/address/'+manifest.record.hubId,nft:'https://nearblocks.io/nft-token/'+manifest.record.hubId+'/'+manifest.record.offerId}}]};
 return {error:{message:'Unknown isolated API fixture'}};
};
const writes=[],errors=[];
const server=http.createServer(async(req,res)=>{try{
 const path=new URL(req.url,'http://localhost').pathname;
 if(req.method!=='GET'){writes.push(path);res.writeHead(405);res.end();return;}
 if(path.startsWith('/api/')){res.writeHead(path==='/api/auth/session'&&!signedIn?401:200,{'Content-Type':'application/json'});res.end(JSON.stringify(api(path)));return;}
 if(path==='/wallets.js'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end('export class ExternalWallets {list(){return []}}');return;}
 const file=!extname(path)?resolve(root,'index.html'):resolve(root,'.'+path);assert.ok(file.startsWith(root+'/'));res.writeHead(200,{'Content-Type':types[extname(file)]??'application/octet-stream'});res.end(await readFile(file));
 }catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const accessibility=[];
const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'}),checks=[];
try{
 const context=await browser.newContext({reducedMotion:'reduce'}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 const audit=async label=>{if(!process.env.AXE_SOURCE_PATH)return;await page.addScriptTag({content:await readFile(process.env.AXE_SOURCE_PATH,'utf8')});const result=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));accessibility.push({label,violations:result.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))});};
 const screenshot=async options=>{await page.evaluate(()=>window.scrollTo({top:0,left:0,behavior:'instant'}));await page.screenshot(options);};
 const go=async path=>{await page.goto(origin+path);await page.locator('#main').waitFor();await page.evaluate(()=>document.fonts.ready);};
 await go('/');await page.locator('.nft-feature .placement-nft').waitFor();await audit('Homepage NFT feature');for(const width of [1440,390,320]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);if(width!==320){await page.locator('.nft-feature').screenshot({path:resolve(out,`nft-home-${width}.png`)});await screenshot({path:resolve(out,`home-${width}.png`),fullPage:true});}}assert.equal(await page.locator('a[href="/experience"]').count(),0);await go('/experience');assert.match(await page.locator('h1').innerText(),/could not be found/);checks.push('The removed demo has no entry points and its old route cannot run simulated actions');
 signedIn=true;
 await go('/records/'+saleId);await page.locator('.record-placement').waitFor();await page.getByText('Recorded mainnet receipts',{exact:false}).click();await page.locator('.record-receipts li').first().waitFor();assert.equal(await page.locator('.record-receipts li').count(),11);
 for(const width of [1440,390,320]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);if(width!==320)await screenshot({path:resolve(out,`record-${width}.png`),fullPage:true});}
 await audit('Public campaign record at320px');
 evidenceFailure=true;await page.getByRole('button',{name:'Refresh verification'}).click();await page.getByText('Current qualification is unavailable.',{exact:false}).waitFor();assert.equal(await page.locator('.record-placement').count(),0);assert.match(await page.locator('body').innerText(),/temporarily unavailable/);evidenceFailure=false;await page.getByRole('button',{name:'Refresh verification'}).click();await page.locator('.record-placement').waitFor();checks.push('Public record:11 scoped receipts,320px layout,RPC outage and evidence retry');
 await go('/buy/placements/nft-ui-offer');await page.locator('.placement-nft[data-nft-phase=editable]').waitFor();assert.equal(await page.locator('[data-nft-controller]').innerText(),wallet);await page.getByText('Transfer creative control',{exact:true}).first().click();assert.notEqual(await page.locator('[name=transferAcknowledged]').getAttribute('required'),null);await audit('Actual placement NFT and transfer form');for(const width of [1440,390,320]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);if(width!==320)await page.locator('.placement-nft').screenshot({path:resolve(out,`nft-workspace-${width}.png`)});}checks.push('Actual placement NFT precedes artwork; real transfer form retains consent and current authority');
 await go('/host/assets/new?pilot=motorcycle');assert.match(await page.locator('textarea[name=prompt]').inputValue(),/Honda CBR600F2/);assert.equal(await page.locator('a[download]').count(),1);await screenshot({path:resolve(out,'pilot-390.png'),fullPage:true});checks.push('Motorcycle pilot capture and downloadable vector remain available without automatic publication');
 await audit('Motorcycle pilot owner draft');
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);assert.deepEqual(accessibility.flatMap(a=>a.violations),[],JSON.stringify(accessibility));await writeFile(resolve(out,'result.json'),JSON.stringify({scope:'isolated API fixtures; no actual signatures or chain writes',checks,errors,writes,accessibility},null,2));console.log(JSON.stringify({checks,errors,writes,accessibility},null,2));await context.close();
}finally{await browser.close();await new Promise(r=>server.close(r));}
