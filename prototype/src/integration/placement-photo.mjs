import {esc} from '../ui.mjs';
import {referenceImage} from './reference-images.mjs';
// These contours belong only to the exact, verified reference photograph.
const expectedBoxes={
 '3216864334b53f02a221dd64afbe8e5edf8a2509b3bb84325abbce4569a29b4c':{'spot-1':[.49,.35,.29,.21]},
 '5ef44a386faecdaa96181084e4882e31a18da27de73cd42cfd11e9dbcefa0929':{'spot-1':[.49,.44,.17,.2],'spot-2':[.25,.49,.19,.17]},
 'f62b7dc4411ce3e1b385bff1dea0dbd339a33e77da727c171591be8b83457cd5':{'spot-1':[.44,.52,.18,.14],'spot-2':[.11,.35,.2,.12]},
 '02b14b8517f46590e761d63301e5362e37021cb488be5d03408a6f4b4f452df8':{'spot-1':[.16,.29,.45,.22],'spot-2':[.685,.55,.12,.06]}
};
const profiles={
 '3216864334b53f02a221dd64afbe8e5edf8a2509b3bb84325abbce4569a29b4c':{'spot-1':{path:'M734 437 L1229 437 L1172 603 Q1170 611 1154 612 L774 615 Q762 615 760 602 Z',pin:[985,524]}},
 '5ef44a386faecdaa96181084e4882e31a18da27de73cd42cfd11e9dbcefa0929':{
  'spot-1':{path:'M715 515 L1042 526 Q1055 600 1026 678 L725 672 Z',pin:[875,599]},
  'spot-2':{path:'M369 500 L666 513 L671 675 L482 662 Q430 585 369 500 Z',pin:[550,590]}},
 'f62b7dc4411ce3e1b385bff1dea0dbd339a33e77da727c171591be8b83457cd5':{
  'spot-1':{path:'M735 542 L1027 574 L978 752 L654 752 L682 699 L677 606 Z',pin:[852,653]},
  'spot-2':{path:'M172 356 L255 377 L359 427 L468 459 L432 476 L294 433 L161 388 Z',pin:[310,417]}},
 '02b14b8517f46590e761d63301e5362e37021cb488be5d03408a6f4b4f452df8':{
  'spot-1':{path:'M182 374 Q182 355 202 355 L957 355 Q978 355 978 374 L971 488 Q971 504 952 504 L202 504 Q182 504 182 488 Z',pin:[576,429]},
  'spot-2':{path:'M1052 561 L1238 581 L1222 626 L1056 626 Z',pin:[1140,594]}}
};
function contour(asset,entry){
 const expected=expectedBoxes[asset.coverSha256]?.[entry.spot.id],box=entry.geometry?.box,unchanged=box&&expected&&['x','y','width','height'].every((k,i)=>Math.abs(box[k]-expected[i])<.000001);
 const known=asset.imageProvenance==='ai-generated'&&unchanged&&profiles[asset.coverSha256]?.[entry.spot.id];if(known)return known;
 const b=entry.geometry?.box??{x:.4,y:.4,width:.2,height:.15},x=b.x*1536,y=b.y*1024,w=b.width*1536,h=b.height*1024;
 return {path:`M${x} ${y}h${w}v${h}h${-w}Z`,pin:[x+w/2,y+h/2]};
}
export function placementPhoto(asset,entries,selected,href){
 const image=referenceImage(asset);if(!image)return '';
 return `<figure class="placement-photo"><div class="placement-photo-canvas"><img class="uploaded-scene" src="${esc(image)}" alt="${asset.imageProvenance==='ai-generated'?'AI-generated reference:':'Owner photograph:'} ${esc(asset.title)}" width="1536" height="1024" fetchpriority="high"><svg viewBox="0 0 1536 1024" preserveAspectRatio="none" class="placement-contours" aria-hidden="true">${entries.map(entry=>`<path class="placement-contour ${entry.key===selected?'is-selected':''}" d="${contour(asset,entry).path}"></path>`).join('')}</svg>${entries.map((entry,i)=>{const p=contour(asset,entry).pin;return `<a data-placement-select class="placement-pin ${entry.key===selected?'is-selected':''}" style="left:${p[0]/1536*100}%;top:${p[1]/1024*100}%" href="${esc(href(entry))}" aria-label="Select ${esc(entry.geometry?.name??entry.spot.id)}" ${entry.key===selected?'aria-current="true"':''}><span>${i+1}</span></a>`;}).join('')}</div><figcaption><span>${asset.imageProvenance==='ai-generated'?'AI-generated vehicle reference':'Owner reference photo'}</span><span>Select a placement · outlines are approximate</span></figcaption></figure>`;
}
