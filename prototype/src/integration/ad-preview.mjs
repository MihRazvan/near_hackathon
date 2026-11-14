import {esc,icon} from '../ui.mjs';
import {live,sale,snapshot} from './runtime.mjs';
import {mediaUrl,committedMedia,artworkImage} from './artwork-media.mjs';
import {listingAsset} from './reference-images.mjs';
import {listingPlacements} from './listing-groups.mjs';
import {placementPhoto} from './placement-photo.mjs';
import {previewContext,readPreview,savePreview,resetPreview} from './ad-preview-store.mjs';

const images=()=> (live.data?.media??[]).filter(m=>m.owner===live.session?.wallet&&m.public===true&&m.status==='verified'&&['image/png','image/jpeg'].includes(m.mime)&&mediaUrl(m.uri));
export function previewControls(){
 const media=images();return `<div class="ad-preview-toolbar"><span data-ad-preview-label hidden>Your preview</span><details data-ad-preview-picker><summary>${icon('camera')}<span>Preview your ad</span></summary><div class="ad-preview-picker">${media.length?`<label class="field"><span>Saved brand image</span><select data-ad-preview-media><option value="">Choose an image</option>${media.map(m=>`<option value="${esc(m.id)}">Image · ${esc(m.sha256?.slice(0,8)??m.id.slice(0,8))}</option>`).join('')}</select></label>`:''}<label class="button small ad-preview-upload">${icon('upload')} Choose an image<input data-ad-preview-file type="file" accept="image/png,image/jpeg"></label><p class="tiny muted">Private preview. Nothing is published.</p></div></details><button type="button" class="ad-preview-reset" data-ad-preview-reset hidden>Reset</button><span class="tiny" role="status" data-ad-preview-status></span></div>`;
}
export function reservationPhoto(offer,spot,{editable=true,allowGuest=false}={}){
 if(!offer||!spot)return '';
 const entries=listingPlacements(offer,live.catalog?.sales??[offer]),entry=entries.find(e=>e.sale.id===offer.id&&e.spot.id===spot.id);if(!entry)return '';
 const artwork=new Map(entries.map(e=>[e.key,artworkImage(snapshot(e.spot.contractId))]).filter(([,url])=>url));
 const current=snapshot(spot.contractId),submitted=committedMedia(current?.rights?.proposal,[current?.artifacts?.artwork]);
 if(submitted&&['image/png','image/jpeg'].includes(submitted.mime)&&current?.state.outcome!=='failure')artwork.set(entry.key,mediaUrl(submitted.uri));
 const canPreview=editable&&!current?.state.artwork_locked;
 return placementPhoto(listingAsset(offer),entries,entry.key,e=>'/spaces/'+encodeURIComponent(e.sale.assetId)+'?sale='+encodeURIComponent(e.sale.id)+'&spot='+encodeURIComponent(e.spot.id),{
  artwork,preview:canPreview?{saleId:offer.id,spotId:spot.id,allowGuest,mode:'reservation',controls:previewControls()}:null,
  caption:submitted&&!current?.state.artwork_locked?'Submitted artwork preview · awaiting owner approval.':undefined
 });
}
let release=()=>{};
export function mountAdPreview(){
 release();const figure=document.querySelector('[data-ad-preview]');if(!figure)return;
 const offer=sale(figure.dataset.sale),spot=offer?.spots.find(s=>s.id===figure.dataset.spot),wallet=live.session?.wallet??null,context=previewContext(offer,spot,wallet);if(!context)return;
 const abort=new AbortController(),{signal}=abort;let objectUrl,version=0,current,hydrating=false;
 const form=document.querySelector('form[data-live-form="artwork"]'),select=figure.querySelector('[data-ad-preview-media]'),file=figure.querySelector('[data-ad-preview-file]'),reset=figure.querySelector('[data-ad-preview-reset]'),label=figure.querySelector('[data-ad-preview-label]'),status=figure.querySelector('[data-ad-preview-status]'),layer=figure.querySelector('[data-private-ad-layer]'),image=layer?.querySelector('image'),caption=figure.querySelector('figcaption'),defaultCaption=caption?.textContent;
 const alive=()=>!signal.aborted&&figure.isConnected&&(live.session?.wallet??null)===wallet;
 function show(draft){
  if(!alive())return;if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=null;}
  const saved=draft?.kind==='media'?images().find(m=>m.id===draft.mediaId&&m.sha256===draft.sha256):null;
  const src=draft?.kind==='file'?(objectUrl=URL.createObjectURL(draft.blob)):saved?mediaUrl(saved.uri):null;current=src?draft:null;
  if(image){if(src)image.setAttribute('href',src);else image.removeAttribute('href');}
  if(layer)layer.style.display=src?'':'none';
  figure.querySelectorAll('[data-approved-artwork]').forEach(el=>{el.style.display=src&&el.dataset.approvedArtwork===figure.dataset.selectedKey?'none':'';});
  if(label)label.hidden=!src;if(reset)reset.hidden=!src;
  const button=figure.querySelector('[data-ad-preview-picker] summary span');if(button)button.textContent=src?'Change image':'Preview your ad';
  if(caption)caption.textContent=src?(draft.persisted?'Private draft · saved in this browser.':'Private preview · kept in this tab.'):defaultCaption;
  figure.classList.toggle('has-private-ad',!!src);
 }
 function hydrate(draft,{force=false}={}){
  if(!form||!draft||form.dataset.dirty==='true')return;
  const selected=form.elements.namedItem('mediaId'),upload=form.elements.namedItem('file');
  if(!force&&(selected?.value||upload?.files?.length))return;
  hydrating=true;
  try{
   if(draft.kind==='media'&&images().some(m=>m.id===draft.mediaId)&&selected){selected.value=draft.mediaId;selected.dispatchEvent(new Event('change',{bubbles:true}));}
   if(draft.kind==='file'&&upload){const transfer=new DataTransfer();transfer.items.add(new File([draft.blob],draft.name??'artwork.jpg',{type:draft.mime}));upload.files=transfer.files;upload.dispatchEvent(new Event('change',{bubbles:true}));}
  }finally{hydrating=false;}
 }
 async function use(draft,{hydrateForm=true}={}){
  const ticket=++version;status.textContent='';const stored=await savePreview(context,draft);if(ticket!==version||!alive())return;
  show(stored);const picker=figure.querySelector('[data-ad-preview-picker]');if(picker?.open){picker.open=false;picker.querySelector('summary').focus({preventScroll:true});}if(hydrateForm)hydrate(stored,{force:true});
 }
 async function localFile(chosen,{hydrateForm=true}={}){
  if(!chosen?.size)return;const ticket=++version,max=live.config?.mediaMaxBytes??1000000;
  if(!['image/png','image/jpeg'].includes(chosen.type)||chosen.size>max)throw Error(`Choose a PNG or JPEG up to ${max/1000000} MB.`);
  const bytes=await chosen.arrayBuffer(),head=new Uint8Array(bytes);
  if(chosen.type==='image/png'?head[0]!==137||head[1]!==80||head[2]!==78||head[3]!==71:head[0]!==255||head[1]!==216)throw Error('This file is not a valid PNG or JPEG image.');
  const decoded=await createImageBitmap(chosen);decoded.close();
  const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  if(ticket!==version||!alive())return;
  await use({kind:'file',blob:chosen,mime:chosen.type,name:chosen.name,sha256},{hydrateForm});
 }
 const handle=fn=>async()=>{try{await fn();}catch(error){if(alive())status.textContent=error.message;}};
 file?.addEventListener('change',handle(()=>localFile(file.files[0])),{signal});
 select?.addEventListener('change',handle(async()=>{const m=images().find(m=>m.id===select.value);if(m)await use({kind:'media',mediaId:m.id,mime:m.mime,sha256:m.sha256});}),{signal});
 image?.addEventListener('error',()=>{if(alive())status.textContent='This image could not load. Choose it again or try a local file.';},{signal});
 const picker=figure.querySelector('[data-ad-preview-picker]'),canvas=figure.querySelector('.placement-photo-canvas');
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&picker?.open){picker.open=false;picker.querySelector('summary').focus({preventScroll:true});}},{signal});
 document.addEventListener('pointerdown',e=>{if(picker?.open&&!picker.contains(e.target))picker.open=false;},{signal});
 canvas?.addEventListener('dragover',e=>{if(e.dataTransfer?.types.includes('Files')){e.preventDefault();canvas.classList.add('is-ad-drop');}},{signal});
 canvas?.addEventListener('dragleave',e=>{if(!canvas.contains(e.relatedTarget))canvas.classList.remove('is-ad-drop');},{signal});
 canvas?.addEventListener('drop',e=>{if(e.dataTransfer?.files.length){e.preventDefault();e.stopPropagation();canvas.classList.remove('is-ad-drop');void handle(()=>localFile(e.dataTransfer.files[0]))();}},{signal});
 reset?.addEventListener('click',handle(async()=>{version++;await resetPreview(context);if(figure.dataset.allowGuest==='true')await resetPreview(previewContext(offer,spot,null));if(file)file.value='';if(select)select.value='';show(null);if(form){const selected=form.elements.namedItem('mediaId'),upload=form.elements.namedItem('file');if(selected)selected.value='';if(upload){upload.value='';upload.dispatchEvent(new Event('change',{bubbles:true}));}}}),{signal});
 form?.addEventListener('change',handle(async()=>{
  if(hydrating)return;
  const selected=form.elements.namedItem('mediaId'),upload=form.elements.namedItem('file');
  if(upload?.files?.length)await localFile(upload.files[0],{hydrateForm:false});
  else if(selected?.value){const m=images().find(m=>m.id===selected.value);if(m)await use({kind:'media',mediaId:m.id,mime:m.mime,sha256:m.sha256},{hydrateForm:false});}
 }),{signal});
 // A guest's choice may be seen at checkout; the explicit reserve action binds
 // it to the paying wallet. Wallet-owned drafts never fall through to another.
 void (async()=>{
  try{
   let draft=await readPreview(context);if(!draft&&figure.dataset.allowGuest==='true'&&wallet)draft=await readPreview(previewContext(offer,spot,null));
   if(!alive()||version)return;
   const fromLink=new URLSearchParams(location.search).get('artwork'),selected=form?.elements.namedItem('mediaId'),m=images().find(m=>m.id===(fromLink??selected?.value));
   if(m)draft={kind:'media',mediaId:m.id,mime:m.mime,sha256:m.sha256};
   const proposal=snapshot(spot.contractId)?.rights?.proposal,alreadySubmitted=figure.dataset.previewMode!=='listing'&&draft?.sha256&&btoa(String.fromCharCode(...draft.sha256.match(/../g).map(b=>parseInt(b,16))))===proposal?.artifact_sha256;
   if(alreadySubmitted){show(null);return;}
   if(m)await use(draft);else{show(draft);hydrate(draft);}
  }catch(error){if(alive())status.textContent='Your saved preview could not load. Choose the image again.';}
  finally{if(alive())figure.dataset.previewReady='true';}
 })();
 release=()=>{abort.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);};
}
