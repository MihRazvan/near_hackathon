import {referenceImage} from './reference-images.mjs';
export const VEHICLE_SIDES=[['left','Left'],['right','Right'],['front','Front'],['rear','Rear'],['top','Top']];
export const viewId=spot=>spot?.photoViewId??'main';
export function vehicleViews(asset){return [{id:'main',side:asset.primaryPhotoSide??asset.spots?.[0]?.side??'left',photoDataUrl:asset.photoDataUrl,photoUrl:asset.photoUrl,coverUri:asset.coverUri,coverSha256:asset.coverSha256,imageProvenance:asset.imageProvenance},...(asset.photoViews??[])];}
export const viewPhoto=view=>view?.photoDataUrl??view?.photoUrl??referenceImage(view);
export const viewLabel=view=>VEHICLE_SIDES.find(([id])=>id===view?.side)?.[1]??'Original';
export const viewSpots=(asset,id)=>asset.spots.map((p,i)=>({p,i})).filter(({p})=>viewId(p)===id);
export function activePhotoView(asset,selected,requested){const spot=asset.spots.find(p=>p.id===selected),id=spot?viewId(spot):requested;return vehicleViews(asset).find(v=>v.id===id)??vehicleViews(asset)[0];}
export function editorViews(asset,current){
 const views=vehicleViews(asset),remaining=VEHICLE_SIDES.filter(([side])=>!views.some(v=>v.side===side));
 return `<div class="vehicle-photo-views" data-photo-views><nav aria-label="Vehicle photo views">${views.map(v=>`<button type="button" class="button small ${v.id===current?'primary':''}" data-editor-view="${v.id}" aria-pressed="${v.id===current}">${viewLabel(v)}</button>`).join('')}</nav>${remaining.length?`<details class="vehicle-add-view"><summary>Add a view</summary><label class="field"><span>Vehicle side</span><select name="newPhotoSide">${remaining.map(([id,label])=>`<option value="${id}">${label}</option>`).join('')}</select></label><label class="field"><span>Add a photo of this side</span><input type="file" name="viewPhoto" accept="image/png,image/jpeg,image/webp,image/heic,image/heif"></label><p class="tiny muted">Use a separate photo for each side. Your draft stays private.</p></details>`:''}</div>`;
}
