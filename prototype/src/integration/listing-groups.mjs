// Presentation groups keep every placement's original sale and contract binding.
const assetFor=s=>s.publication?.manifest?.asset;
const windowFields=['artworkDue','installationDue','serviceStart','serviceEnd','reviewEnd'];
const windowValue=value=>Number.isFinite(Date.parse(value))?new Date(value).toISOString():value??'';
export function listingGroupKey(s){
 const a=assetFor(s);return JSON.stringify([s.assetId,s.owner,s.campaignType??s.publication?.manifest?.campaignType??'physical',a?.coverSha256??a?.coverUri??s.presentation?.coverSha256??'',...windowFields.map(k=>windowValue(s.schedule?.[k])),...(a?.photoViews?.length?[a.primaryPhotoSide??'',a.photoViews.map(v=>[v.id,v.coverSha256??v.coverUri])]:[])]);
}
export function listingPlacements(offer,sales){
 const key=listingGroupKey(offer),seen=new Set();
 return sales.filter(s=>s.status==='published'&&listingGroupKey(s)===key).flatMap(s=>s.spots.map(spot=>({key:s.id+':'+spot.id,sale:s,spot,geometry:assetFor(s)?.spots?.find(p=>p.id===spot.id)}))).filter(item=>{const id=item.spot.contractId??item.key;if(seen.has(id))return false;seen.add(id);return true;});
}
export function groupedListings(sales,available=()=>false){
 const groups=new Map();
 for(const s of sales){if(s.status!=='published')continue;const key=listingGroupKey(s),prior=groups.get(key);if(!prior||!available(prior)&&available(s))groups.set(key,s);}
 return [...groups.values()];
}
