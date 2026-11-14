import {assert,sha256} from './core.mjs';
export const PHOTO_SIDES=['left','right','front','rear','top'];
export function assetPhotos(input,{prior={},media}={}){
 const primary=input.primaryPhotoSide??prior.primaryPhotoSide;
 if(primary!==undefined)assert(PHOTO_SIDES.includes(primary),'INVALID_PHOTO_VIEW','Choose a valid vehicle side',400);
 const data={...(primary?{primaryPhotoSide:primary}:{})};
 if(input.photoViews!==undefined){
  assert(Array.isArray(input.photoViews)&&input.photoViews.length<=4,'INVALID_PHOTO_VIEW','Add at most one photo per vehicle side',400);
  const seen=new Set([primary??input.spots?.[0]?.side??'left']);
  data.photoViews=input.photoViews.map(view=>{
   assert(PHOTO_SIDES.includes(view.id)&&view.side===view.id&&!seen.has(view.id),'INVALID_PHOTO_VIEW','Each photo must show a different vehicle side',400);seen.add(view.id);
   const old=prior.photoViews?.find(p=>p.id===view.id)??{},source={...old,...view},photo={id:view.id,side:view.id,...media(source)};
   assert(photo.photoDataUrl||photo.coverUri,'INVALID_PHOTO_VIEW','Add a photo for this view before saving spots',400);
   const provenance=view.imageProvenance??old.imageProvenance??'owner-photo';assert(['owner-photo','ai-generated'].includes(provenance),'INVALID_PROVENANCE','Choose a valid image type',400);photo.imageProvenance=provenance;
   return photo;
  });
 }
 const views=data.photoViews??prior.photoViews??[];
 for(const spot of input.spots??[]){if(spot.photoViewId){assert(spot.photoViewId==='main'||views.some(v=>v.id===spot.photoViewId),'INVALID_PHOTO_VIEW','Each spot must belong to an existing photo view',400);}}
 return data;
}
export const photoDataValues=asset=>[asset.photoDataUrl,...(asset.photoViews??[]).map(v=>v.photoDataUrl)];
// Keep routine editor saves small; photo bytes use authenticated conditional GETs.
export function privateAssetMetadata({photoDataUrl,photoViews,...asset}){
 const url=(bytes,view)=>'/api/assets/'+encodeURIComponent(asset.id)+'/photo?image='+sha256(bytes)+(view?'&view='+encodeURIComponent(view):'');
 return {...asset,...(photoDataUrl?{photoUrl:url(photoDataUrl)}:{}),...(photoViews?{photoViews:photoViews.map(({photoDataUrl,...view})=>({...view,...(photoDataUrl?{photoUrl:url(photoDataUrl,view.id)}:{})}))}:{})};
}
export function publicPhotoViews(asset){
 if(!asset.photoViews?.length)return {};
 assert((!asset.photoDataUrl||asset.coverUri)&&asset.photoViews.every(v=>v.coverUri&&v.coverSha256),'PHOTO_NOT_PUBLIC','Publish the vehicle view photos before publishing this listing',400);
 return {primaryPhotoSide:asset.primaryPhotoSide??asset.spots[0]?.side??'left',photoViews:asset.photoViews.map(({id,side,coverUri,coverSha256,imageProvenance})=>({id,side,coverUri,coverSha256,imageProvenance}))};
}
