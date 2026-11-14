import {vehicleViews} from './vehicle-views.mjs';
import {photoData} from './photos.mjs';
import {api,live,noteWorkspaceMutation,setProgress} from './runtime.mjs';
export const privateListingPhotos=asset=>vehicleViews(asset).filter(v=>(v.photoDataUrl||v.photoUrl)&&!v.coverUri);
export async function publishVehiclePhotos(initial,{acknowledged,wallet=live.session?.wallet,request=api,loadPhoto=async view=>{
 const url=new URL(view.photoUrl,location.origin);if(url.origin!==location.origin)throw new Error('Reopen your vehicle photo before publishing.');
 const response=await fetch(url,{credentials:'include'});if(!response.ok)throw new Error('Your private vehicle photo could not be loaded. Reopen the draft before publishing.');
 const blob=await response.blob();return photoData(new File([blob],'vehicle.jpg',{type:blob.type}));
}}={}){
 const guard=()=>{if(live.session?.wallet!==wallet)throw new Error('The connected wallet changed. Reopen this draft with its owner wallet.');};
 const photos=privateListingPhotos(initial);if(photos.length&&!acknowledged)throw new Error('Agree to publish the vehicle photos on public IPFS, or keep this listing as a private draft.');
 let asset=initial;
 for(const view of photos){
  guard();setProgress('Publishing your '+(view.side??'vehicle')+' photo…');const bytes=view.photoDataUrl??await loadPhoto(view);guard();
  const media=await request('media',{base64:bytes.split(',')[1],mime:bytes.slice(5,bytes.indexOf(';')),publicContentAcknowledged:true});guard();
  const payload=view.id==='main'?{...asset,coverMediaId:media.id}:{...asset,photoViews:asset.photoViews.map(v=>v.id===view.id?{...v,coverMediaId:media.id}:v)};
  asset=await request('assets/'+asset.id,{version:asset.version,asset:payload},{method:'PATCH'});guard();
  noteWorkspaceMutation();const i=live.data?.dashboard?.assets?.findIndex(a=>a.id===asset.id);if(i>=0)live.data.dashboard.assets[i]=asset;live.assetEdit=asset;
 }
 return asset;
}
