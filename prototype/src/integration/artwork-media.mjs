import {esc} from '../ui.mjs';
import {millis,bookingStatus} from './buyer-state.mjs';

export const mediaUrl=uri=>/^ipfs:\/\/baf[a-z2-7]{30,120}$/.test(uri??'')?uri.replace('ipfs://','https://gateway.pinata.cloud/ipfs/'):null;
const image=m=>['image/png','image/jpeg'].includes(m?.mime);
const hash64=hex=>/^[0-9a-f]{64}$/.test(hex??'')?btoa(String.fromCharCode(...hex.match(/../g).map(n=>parseInt(n,16)))):null;
export function committedMedia(record,media=[]){
 if(!record?.artifact_uri||!record.artifact_sha256)return null;
 return media.find(m=>m?.uri===record.artifact_uri&&hash64(m.sha256)===record.artifact_sha256)??null;
}
export function artworkImage(snapshot){
 if(!snapshot?.state?.artwork_locked||snapshot.state.outcome==='failure')return null;
 const m=committedMedia(snapshot.rights?.proposal,[snapshot.artifacts?.artwork]);
 return image(m)?mediaUrl(m.uri):null;
}
export function mediaPreview(m,{label='Selected artwork'}={}){
 const url=mediaUrl(m?.uri);if(!url)return '';
 return `<figure class="artwork-preview">${image(m)?`<img src="${esc(url)}" alt="${esc(label)}" loading="lazy" decoding="async">`:''}<figcaption>${esc(label)}${!image(m)?' · '+esc(m.mime==='application/pdf'?'PDF document':'Text or document'):''}</figcaption><a href="${esc(url)}" class="text-link" target="_blank" rel="noopener noreferrer">Open file ↗</a></figure>`;
}
export function submittedArtwork(snapshot,media=[]){
 const proposal=snapshot?.rights?.proposal;if(!proposal)return '';
 const own=media.filter(m=>m.status==='verified'&&m.public===true),m=committedMedia(proposal,[snapshot.artifacts?.artwork,...own]);
 return m?mediaPreview(m,{label:snapshot.state.artwork_locked?'Approved artwork':'Submitted artwork · awaiting approval'}):'';
}
export function artworkReservations(state){
 const wallet=state.session?.wallet;if(!wallet)return [];
 const sales=[...(state.catalog?.sales??[]),...(state.data?.dashboard?.sales??[])],snapshots=new Map((state.catalog?.snapshots??[]).map(s=>[s.accountId,s]));
 for(const s of state.data?.placements??[])if(!snapshots.has(s.accountId))snapshots.set(s.accountId,s);
 const now=Date.parse(state.catalog?.time)||Date.now(),bookings=state.data?.dashboard?.bookings??[];
 return [...snapshots.values()].filter(s=>{
  const controller=s.rights?.artwork_controller_id??s.rights?.current_owner_id,due=millis(s.campaign?.terms?.artwork_due_ns);
  return s.state?.outcome==='open'&&!s.state.artwork_locked&&!s.rights?.locked&&(due===null||due>now)&&
   (s.state.nft_minted?controller===wallet:s.state.holder?.account_id===wallet);
 }).map(s=>{
  const offer=sales.find(o=>o.id===s.campaign?.terms?.sale_id),b=bookings.find(b=>b.contractId===s.accountId&&b.owner===wallet&&bookingStatus(b,s)==='accepted'),spot=offer?.publication?.manifest?.asset?.spots?.find(p=>p.id===s.campaign?.terms?.spot_id);
  return {id:b?.id??s.accountId,title:(offer?.publication?.manifest?.asset?.title??offer?.title??'Your reservation')+(spot?' · '+spot.name:''),snapshot:s};
 });
}

let release=()=>{};
export function mountArtworkSelection(media=[]){
 release();const form=document.querySelector('form[data-live-form="artwork"]');if(!form)return;
 const select=form.elements.namedItem('mediaId'),file=form.elements.namedItem('file'),notes=form.elements.namedItem('notes'),preview=form.querySelector('[data-artwork-selection]');
 const controller=new AbortController();let objectUrl;
 const paint=()=>{
  if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=null;}
  const saved=media.find(m=>m.id===select?.value),local=file?.files?.[0];
  if(saved)preview.innerHTML=mediaPreview(saved,{label:'Selected file · not submitted yet'});
  else if(local&&image({mime:local.type})){objectUrl=URL.createObjectURL(local);preview.innerHTML=`<figure class="artwork-preview"><img src="${esc(objectUrl)}" alt="Selected artwork file"><figcaption>Selected file · not submitted yet</figcaption></figure>`;}
  else preview.innerHTML='';
  if(notes)notes.disabled=!!saved||!!local;
 };
 select?.addEventListener('change',()=>{if(select.value&&file)file.value='';paint();},{signal:controller.signal});
 file?.addEventListener('change',()=>{if(file.files.length&&select)select.value='';paint();},{signal:controller.signal});
 release=()=>{controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);};paint();
}
