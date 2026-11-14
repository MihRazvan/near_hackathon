// Built frontend + isolated public API fixtures. No wallets, RPCs or writes.
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../backend/package.json',import.meta.url));
const {chromium}=require('playwright');
const root=resolve('prototype/dist'),now=Date.now(),ns=ms=>String(BigInt(ms)*1000000n);
const asset={id:'motion-van',title:'Delivery van',assetType:'van',city:'Dublin',imageProvenance:'ai-generated',coverUri:'ipfs://bafkreicu5gcmou2gebb4qkwx3u76nr3rmyfxf5w6gzm7yivcn5s5trdhui',coverSha256:'02b14b8517f46590e761d63301e5362e37021cb488be5d03408a6f4b4f452df8',spots:[{id:'side',name:'Cargo panel',box:{x:.16,y:.29,width:.45,height:.22}},{id:'cab',name:'Cab door',box:{x:.685,y:.55,width:.12,height:.06}}]};
const sale={id:'motion-sale',assetId:asset.id,owner:'owner.near',status:'published',title:'Van campaign',rules:'Keep lights clear',publication:{manifest:{asset}},schedule:Object.fromEntries(['biddingClose','artworkDue','installationDue','serviceStart','serviceEnd','reviewEnd'].map((k,i)=>[k,new Date(now+(i+1)*86400000).toISOString()])),spots:asset.spots.map(s=>({id:s.id,contractId:'motion-'+s.id,takeoverEnabled:true}))};
const catalog={sales:[sale],owners:[],time:new Date().toISOString(),snapshots:asset.spots.map(s=>({accountId:'motion-'+s.id,qualified:true,state:{outcome:'open',next_price:'1000000',holder:null,cutoff_ns:ns(now+86400000)},rights:{bidding_closed:false},campaign:{terms:{sale_id:sale.id,spot_id:s.id}}}))};
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.jpg':'image/jpeg','.woff2':'font/woff2'},writes=[],errors=[];
const server=http.createServer(async(req,res)=>{try{
 const path=new URL(req.url,'http://localhost').pathname;
 if(req.method!=='GET'){writes.push(path);res.writeHead(405);res.end();return;}
 if(path.startsWith('/api/')){
  const data={'/api/config':{production:true,network:'sandbox',wallets:[],developmentWallets:[]},'/api/catalog':catalog,'/api/browse':catalog.sales};
  res.writeHead(path==='/api/auth/session'?401:200,{'Content-Type':'application/json'});res.end(JSON.stringify(data[path]??{error:{message:'Signed out'}}));return;
 }
 if(path==='/wallets.js'){res.setHeader('Content-Type','text/javascript');res.end('export class ExternalWallets{list(){return []}}');return;}
 const file=extname(path)?resolve(root,'.'+path):resolve(root,'index.html');assert.ok(file.startsWith(root+'/'));res.setHeader('Content-Type',mime[extname(file)]??'application/octet-stream');res.end(await readFile(file));
}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'}),checks=[];
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
 const go=async path=>{await page.goto(origin+path);await page.locator('#main h1').waitFor();await page.evaluate(()=>document.fonts.ready);};
 await go('/explore');await page.locator('.market-card-link').click();await page.locator('.placement-photo-canvas').waitFor();
 await page.waitForFunction(()=>!document.querySelector('[style*="view-transition-name"]'));
 assert.equal(new URL(page.url()).pathname,'/spaces/motion-van');checks.push('Shared-image navigation reaches the real listing and removes temporary transition names');
 const selected=await page.locator('.placement-choice[aria-current]').getAttribute('href'),choice=page.locator('.placement-choice').last();
 await choice.hover();assert.equal(await page.locator('.is-previewed').count(),3);assert.equal(await page.locator('.placement-choice[aria-current]').getAttribute('href'),selected);
 await choice.focus();await page.mouse.move(0,0);assert.equal(await page.locator('.is-previewed').count(),3);await choice.blur();assert.equal(await page.locator('.is-previewed').count(),0);
 await page.evaluate(()=>window.dispatchEvent(new Event('app:changed')));await page.locator('.placement-pin').last().hover();assert.equal(await page.locator('.is-previewed').count(),3);await page.mouse.move(0,0);
 await page.locator('.placement-pin').last().click();assert.equal(new URL(page.url()).searchParams.get('spot'),'cab');assert.match(await page.locator('.placement-choice[aria-current]').innerText(),/Cab door/);
 checks.push('Pointer and keyboard previews connect pin, contour and booking option; selection and remount remain correct');
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 checks.push('Placement layout fits phone, tablet and desktop widths');
 await page.emulateMedia({reducedMotion:'reduce'});await go('/explore');await page.locator('.market-card-link').hover();assert.equal(await page.locator('.market-card-photo img').evaluate(e=>getComputedStyle(e).transform),'none');await page.locator('.market-card-link').click();await page.locator('.placement-photo-canvas').waitFor();assert.equal(await page.locator('[style*="view-transition-name"]').count(),0);
 checks.push('Reduced-motion navigation is immediate and image zoom is disabled');
 await page.emulateMedia({reducedMotion:'no-preference'});await go('/explore');await page.evaluate(()=>document.startViewTransition=undefined);await page.locator('.market-card-link').click();await page.locator('.placement-photo-canvas').waitFor();assert.equal(new URL(page.url()).pathname,'/spaces/motion-van');checks.push('Browsers without View Transitions retain ordinary navigation');
 await go('/');await page.waitForTimeout(800);await page.evaluate(()=>window.dispatchEvent(new Event('app:changed')));assert.equal(await page.locator('.hero-copy').evaluate(e=>e.getAnimations().length),0);checks.push('Background updates never replay the hero entrance');
 await page.setViewportSize({width:390,height:900});
 const ownerPhoto=await page.locator('.owner-photo').boundingBox(),ownerCopy=await page.locator('.owner-copy').boundingBox();
 assert.ok(ownerPhoto.y+ownerPhoto.height<=ownerCopy.y+1,'Owner photo caption must not cover the heading on phones');checks.push('Owner image and caption stay above the heading on phones');
 await context.close();assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);console.log(JSON.stringify({checks,pageErrors:errors,apiWrites:writes},null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
