import {assert,hashObject,sha256 as hashBytes} from './core.mjs';
import {imageInput} from './asset-ai.mjs';
const geometry=asset=>asset.spots.map(({id,box,polygon,photoViewId})=>({id,box,...(polygon?{polygon}:{}),...(photoViewId?{photoViewId}:{})}));
export function listingPhotoSource(store,wallet,saleId,{publishedTermsHash,publicContentAcknowledged}){
 const sale=store.get('sale',saleId);assert(sale?.owner===wallet&&sale.status==='published','NOT_FOUND','Published listing not found for this wallet',404);
 assert(publicContentAcknowledged===true,'PUBLIC_CONTENT_REQUIRED','Agree to publish this listing photo on public IPFS',400);
 assert(publishedTermsHash===sale.publication.publishedTermsHash,'PUBLICATION_CHANGED','Reopen the original listing before adding its photo');
 const original=sale.publication.manifest.asset,asset=store.get('asset',sale.assetId);
 assert(!original.coverUri&&!original.photoViews?.length,'PHOTO_ALREADY_PUBLISHED','This listing already has published photo references');
 assert(asset?.owner===wallet&&asset.photoDataUrl&&!asset.photoViews?.length,'PHOTO_REQUIRED','Open the vehicle draft and add its original photo first');
 const ids=new Set(sale.spots.map(p=>p.id)),current={spots:asset.spots.filter(p=>ids.has(p.id))},frozen={spots:original.spots.filter(p=>ids.has(p.id))};
 assert(hashObject(geometry(current))===hashObject(geometry(frozen)),'PHOTO_LAYOUT_CHANGED','The vehicle layout changed after publication. Use the original photo and spot layout.');
 return {sale,asset,image:imageInput(asset.photoDataUrl)};
}
export function attachListingPhoto(store,wallet,saleId,input,{authorization='owner-session'}={}){
 const {sale,asset,image}=listingPhotoSource(store,wallet,saleId,input),media=store.get('media',input.mediaId);
 assert(media?.owner===wallet&&media.status==='verified'&&media.public===true&&media.sha256===hashBytes(image.bytes),'PHOTO_MISMATCH','The verified public photo must match this vehicle photo');
 return store.transaction(()=>{
  const prior=store.get('listing-photo',saleId);if(prior){assert(prior.mediaId===media.id&&prior.publishedTermsHash===input.publishedTermsHash,'PHOTO_ALREADY_PUBLISHED','This listing already has an additional photo');return prior;}
  return store.insert('listing-photo',saleId,wallet,{saleId,assetId:asset.id,publishedTermsHash:input.publishedTermsHash,coverUri:media.uri,coverSha256:media.sha256,mediaId:media.id,imageProvenance:asset.imageProvenance??sale.publication.manifest.asset.imageProvenance??'owner-photo',provenance:'photo-added-after-publication',authorization});
 });
}
export function withListingPhoto(store,sale){
 const photo=store.get('listing-photo',sale.id);if(!photo||photo.owner!==sale.owner||photo.publishedTermsHash!==sale.publication?.publishedTermsHash)return sale;
 const {coverUri,coverSha256,imageProvenance,provenance,publishedTermsHash}=photo;
 return {...sale,presentation:{coverUri,coverSha256,imageProvenance,provenance,publishedTermsHash}};
}
