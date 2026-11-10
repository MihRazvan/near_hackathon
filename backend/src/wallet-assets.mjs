import {readFile} from 'node:fs/promises';
import {ROOT} from './config.mjs';
import {join} from 'node:path';

// The wallet adapter is a public application asset, independent of the development console.
export async function serveWalletAssets(request,response,url){
 if(url.pathname!=='/wallets.js'||!['GET','HEAD'].includes(request.method))return false;
 let bytes;try{bytes=await readFile(join(ROOT,'backend/lab/dist/wallets.js'));}catch(error){if(error.code!=='ENOENT')throw error;return false;}
 response.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'public, max-age=300'});
 response.end(request.method==='HEAD'?undefined:bytes);return true;
}
