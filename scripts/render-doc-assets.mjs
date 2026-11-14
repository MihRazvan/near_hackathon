#!/usr/bin/env node
// Render repository-native documentation artwork. No API keys, wallets or chain.
import http from 'node:http';
import {crc32} from 'node:zlib';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=resolve(fileURLToPath(new URL('../',import.meta.url))),require=createRequire(new URL('../backend/package.json',import.meta.url));
const {chromium}=require('playwright');
const mime={'.html':'text/html','.css':'text/css','.woff2':'font/woff2','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png'};
const server=http.createServer(async(req,res)=>{try{
 const path=new URL(req.url,'http://localhost').pathname;
 if(req.method!=='GET'||!['/docs/assets/source/','/prototype/public/fonts/','/prototype/public/images/'].some(prefix=>path.startsWith(prefix)))throw Error('Not a documentation asset');
 const file=resolve(root,'.'+path);if(!file.startsWith(root+sep))throw Error('Outside repository');
 res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'});res.end(await readFile(file));
}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
try{
 const page=await browser.newPage({viewport:{width:1600,height:1200},deviceScaleFactor:1});
 await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
 for(const name of (await readdir(resolve(root,'docs/assets/source'))).filter(n=>n.endsWith('.html')).sort()){
  await page.goto(origin+'/docs/assets/source/'+name);await page.evaluate(()=>document.fonts.ready);
  await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0));
  const failures=await page.locator('[data-artboard]').evaluate(el=>[...el.querySelectorAll('h1,h2,h3,p,strong')].filter(n=>{const a=n.getBoundingClientRect(),b=el.getBoundingClientRect();return a.right>b.right+1||a.bottom>b.bottom+1;}).map(n=>n.textContent));
  if(failures.length)throw Error('Artwork overflows: '+name+' '+JSON.stringify(failures));
  const out=resolve(root,'docs/assets',name.replace(/\.html$/,'.png'));
  await page.locator('[data-artboard]').screenshot({path:out,animations:'disabled'});
  const png=await readFile(out),assetOrigin='Origin: repository-native Everywhere documentation artwork rendered from docs/assets/source/'+name+'. Shared styles: docs/assets/source/theme.css. Fonts and illustrative photo credits: prototype/public/ASSETS.md. This graphic is not physical-delivery evidence.';
  const data=Buffer.from('impeccable:prompt\0'+assetOrigin),type=Buffer.from('tEXt'),length=Buffer.alloc(4),checksum=Buffer.alloc(4);length.writeUInt32BE(data.length);checksum.writeUInt32BE(crc32(Buffer.concat([type,data])));
  const firstChunkEnd=8+12+png.readUInt32BE(8);
  await writeFile(out,Buffer.concat([png.subarray(0,firstChunkEnd),length,type,data,checksum,png.subarray(firstChunkEnd)]));
  console.log('Rendered '+name+' → '+out.slice(root.length));
 }
}finally{await browser.close();await new Promise(r=>server.close(r));}
