import{assert,sha256,walletId}from'./core.mjs';

// Revalidate after authentication: a different wallet cannot reuse a private cached photo.
export function serveReferencePhoto({store,wallet,assetId,request,response}){
 const asset=store.get('asset',assetId);assert(asset?.owner===walletId(wallet),'NOT_FOUND','Reference photo not found.',404);
 const view=new URL(request.url??'/', 'http://localhost').searchParams.get('view'),photo=view&&view!=='main'?asset.photoViews?.find(p=>p.id===view):asset;
 const match=photo?.photoDataUrl?.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+=*)$/);assert(match,'NOT_FOUND','Reference photo not found.',404);
 const bytes=Buffer.from(match[2],'base64'),etag='"'+sha256(bytes)+'"';
 response.setHeader('Cache-Control','private, max-age=0, must-revalidate');response.setHeader('ETag',etag);response.setHeader('Vary','Cookie, Authorization');
 if(request.headers['if-none-match']===etag){response.writeHead(304);response.end();return;}
 response.writeHead(200,{'Content-Type':'image/'+match[1],'Content-Length':bytes.length});response.end(request.method==='HEAD'?undefined:bytes);
}
