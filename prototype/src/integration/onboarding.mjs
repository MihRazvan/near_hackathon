import {live,api,refresh,rawAsset,rerender,setProgress} from './runtime.mjs';
import {navigate,toast} from '../store.mjs';
import {esc,heading,act,form,input,textArea,submit,link,check,hidden,notice} from './ui.mjs';
import {photoData} from './photos.mjs';
import {assetFields} from './asset-fields.mjs';
const histories=new Map(),saves=new Map(),revisions=new Map(),acknowledged=new Map();
const key=(id,kind='draft')=>'everywhere-vehicle-'+kind+':'+live.session?.wallet+':'+id;
function readLocal(id,kind){try{return JSON.parse(localStorage.getItem(key(id,kind)));}catch{return null;}}
function writeLocal(id,value,kind){try{localStorage.setItem(key(id,kind),JSON.stringify(value));}catch{}}
const same=wallet=>{if(live.session?.wallet!==wallet)throw new Error('The connected account changed. Return to this draft with its original wallet.');};
function updateAsset(asset){const d=live.data?.dashboard;if(d){const i=d.assets.findIndex(a=>a.id===asset.id);if(i>=0)d.assets[i]=asset;else d.assets.push(asset);}live.assetEdit=asset;}
export function restoredAsset(a){const cached=readLocal(a.id);return cached?.version===a.version?{...a,...cached.asset}:a;}
export function rememberEditor(form){const a=rawAsset(form.elements.namedItem('id').value),base=live.assetEdit?.id===a.id?live.assetEdit:a;const data=assetFields(new FormData(form),base);revisions.set(a.id,(revisions.get(a.id)??0)+1);writeLocal(a.id,{version:a.version,asset:data});return {...a,...data};}
export function rememberUndo(asset){const history=histories.get(asset.id)??[];history.push(structuredClone(asset));if(history.length>12)history.shift();histories.set(asset.id,history);}
export async function saveEditor(data){
 const id=String(data.get('id')),wallet=live.session.wallet,revision=revisions.get(id)??0,original=rawAsset(id),base=live.assetEdit?.id===id?live.assetEdit:original,payload=assetFields(data,base);
 const task=(saves.get(id)??Promise.resolve()).catch(()=>{}).then(async()=>{
  same(wallet);const version=Math.max(Number(data.get('version')),acknowledged.get(id)??0),asset=await api('assets/'+id,{version,asset:payload},{method:'PATCH'});same(wallet);acknowledged.set(id,asset.version);
  const latest=live.assetEdit,changed=(revisions.get(id)??0)!==revision;updateAsset(asset);
  if(changed&&latest?.id===id){live.assetEdit={...latest,version:asset.version};const cached=readLocal(id);if(cached)writeLocal(id,{...cached,version:asset.version});}
  else try{localStorage.removeItem(key(id));}catch{}
  const f=document.querySelector('form[data-live-form="asset-edit"]');if(f?.elements.namedItem('id').value===id){f.elements.namedItem('version').value=asset.version;if(!changed){f.dataset.dirty='false';f.querySelector('[data-draft-status]')?.replaceChildren(document.createTextNode('Saved to your workspace'));}}
  return asset;
 });saves.set(id,task);return task;
}

export function startVehicleView(){
 const mode=new URLSearchParams(location.search).get('mode')??'photo',ai=live.config.aiAvailable;
 const photo=`<label class="vehicle-photo-input"><span>Add a vehicle photo</span><small>A clear side view works best.</small><input type="file" name="photo" accept="image/png,image/jpeg,image/webp,image/heic,image/heif" aria-label="Choose vehicle photo"></label><input hidden type="file" name="camera" accept="image/*" capture="environment" aria-label="Take a vehicle photo"><div class="actions">${act('vehicle-camera','Take a photo')}${act('start-capture','Use my phone')}</div>`+textArea('prompt','Anything we should know?','','maxlength="2200" placeholder="Only use the doors. Keep the existing logo clear."');
 const description=textArea('prompt','What do you drive?','','required maxlength="2200" placeholder="A white delivery van in Bucharest. Offer the cargo panel and front door separately."')+`<p class="tiny muted">${live.config.aiImageAvailable?'AI will generate a labelled reference and suggest editable panels.':'Start an editable layout from your description. Add a photo whenever you are ready.'}</p>`;
 return `<section class="vehicle-start"><div class="vehicle-start-copy"><h1>your vehicle.<br>its next chapter.</h1><p>Show us your vehicle. Choose the panels you want to offer, set your price, and make room for a brand.</p><p class="tiny muted">Your draft stays private until you publish it.</p></div><div class="vehicle-start-input"><nav class="vehicle-entry-tabs" aria-label="Create a vehicle layout">${link('/host/assets/new?mode=photo','Photo','button '+(mode==='photo'?'primary':''))}${link('/host/assets/new?mode=describe','Describe it','button '+(mode==='describe'?'primary':''))}</nav>${form('vehicle-start',hidden('mode',mode)+(mode==='describe'?description:photo)+submit(ai?'Find my advertising panels':'Create my editable layout')+(ai?act('vehicle-manual-start','Edit panels myself','','button'):''))}${!ai?notice('AI is currently offline.','Your photo and manual editor are available. You can add and adjust panels yourself.'):''}<div class="vehicle-example">No vehicle photo handy? ${act('vehicle-example','Try the example van','','text-link')}<p class="tiny muted">An AI-generated reference. Saved as a private team-test draft.</p></div></div></section>`;
}

async function createVehicle({imageDataUrl,prompt,example=false,generateReference=false,useAI=true}){
 const wallet=live.session.wallet;
 const seed={title:example?'Example van':prompt.slice(0,80)||'My vehicle',description:prompt.slice(0,1000)||'Vehicle advertising surfaces. Confirm the visible panels and physical measurements.',assetType:'van',city:'Location to confirm',source:'manual',campaignType:example?'team-test':'physical',imageProvenance:example?'ai-generated':'owner-photo',assumptions:['Review panels and confirm physical measurements before printing.'],spots:[{id:'spot-1',name:'Advertising panel',side:'left',box:{x:.3,y:.4,width:.3,height:.2},suggestedPriceCents:'100',confidence:'low'}],...(imageDataUrl?{photoDataUrl:imageDataUrl}:{})};
 const asset=await api('assets',seed);same(wallet);updateAsset(asset);navigate('/host/assets/'+asset.id+'/review');
 if(live.config.aiAvailable&&useAI)await suggest(asset,{prompt:prompt||'Identify visible exterior body panels for advertising.',imageDataUrl,generateReference});
 else toast('Your layout is saved. Add and adjust your panels.');
 return asset;
}
async function suggest(asset,{prompt,imageDataUrl,generateReference=false,existing}={}){
 const wallet=live.session.wallet;
 const payload={prompt,...(imageDataUrl?{imageDataUrl}:{}),...(generateReference?{generateReference:true}:{}),...(existing?{existing:Object.fromEntries(['title','description','assetType','spots','assumptions'].map(k=>[k,existing[k]]))}:{}),requestId:crypto.randomUUID()};
 // A retained job is reconciled by ID; it is never automatically started again.
 writeLocal(asset.id,{id:payload.requestId,baseVersion:asset.version},'job');
 live.aiPending=asset.id;rerender();setProgress(generateReference?'Creating your vehicle reference and finding panels...':'Finding advertising panels in your photo...');
 try{const job=await api('ai/jobs',payload);return await recoverJob(asset,job,wallet);}catch(e){writeLocal(asset.id,{id:payload.requestId,baseVersion:asset.version,error:e.message},'job');throw e;}finally{live.aiPending=null;rerender();}
}
async function recoverJob(asset,job,wallet=live.session.wallet){
 for(let i=0;job.status==='processing'&&i<100;i++){await new Promise(r=>setTimeout(r,1000));same(wallet);job=await api('ai/jobs/'+job.id);}
 same(wallet);if(job.status!=='completed')throw new Error(job.error??'Your AI request is still processing. Reopen this draft to check its original result.');
 const current=rawAsset(asset.id);const result=job.result;
 // Do not replace a draft that was edited while inference was running.
 const marker=readLocal(asset.id,'job');if(marker?.applied)return current;
 if(current.version!==(marker?.baseVersion??asset.version))throw new Error('Your draft changed while AI was working. Keep your edits, or start another instruction from the current layout.');
 rememberUndo(current);const saved=await api('assets/'+asset.id,{version:current.version,asset:{...current,...result.draft,spots:result.draft.spots.map(p=>({...p,suggestedPriceCents:current.spots.find(old=>old.id===p.id)?.suggestedPriceCents??'100'})),source:'ai',...(result.imageDataUrl?{photoDataUrl:result.imageDataUrl,imageProvenance:'ai-generated'}:{})}},{method:'PATCH'});
 same(wallet);updateAsset(saved);writeLocal(asset.id,{id:job.id,applied:true},'job');rerender();toast('Your panels are ready. Adjust the outlines and set your offer.');return saved;
}
export async function useCapturedPhoto(id){const wallet=live.session.wallet,asset=await api('captures/'+id+'/use',{});same(wallet);updateAsset(asset);navigate('/host/assets/'+asset.id+'/review');if(live.config.aiAvailable&&asset.source!=='ai')return suggest(asset,{prompt:'Suggest visible solid body advertising panels.',imageDataUrl:asset.photoDataUrl});}
export const onboardingActions={
 'replace-vehicle-photo':async()=>{const form=document.querySelector('form[data-live-form="asset-edit"]'),imageDataUrl=await photoData(form.elements.namedItem('replacementPhoto').files[0]);if(!imageDataUrl)return;const a=await saveEditor(new FormData(form));rememberUndo(a);const saved=await api('assets/'+a.id,{version:a.version,asset:{...a,photoDataUrl:imageDataUrl,coverMediaId:'',imageProvenance:'owner-photo'}},{method:'PATCH'});updateAsset(saved);rerender();if(live.config.aiAvailable)return suggest(saved,{prompt:'Find usable advertising panels on this new photo.',imageDataUrl});},
 'vehicle-manual-start':async el=>{const f=el.closest('form'),data=new FormData(f),imageDataUrl=await photoData(data.get('camera'))??await photoData(data.get('photo'));return createVehicle({imageDataUrl,prompt:String(data.get('prompt')??'').trim()||'My vehicle advertising layout',useAI:false});},
 'vehicle-camera':()=>document.querySelector('[name="camera"]').click(),
 'vehicle-example':async()=>{const response=await fetch('/images/team-tests/van.jpg');if(!response.ok)throw new Error('The example image could not be loaded. Upload your own photo.');const blob=await response.blob();const imageDataUrl=await photoData(new File([blob],'example-van.jpg',{type:'image/jpeg'}));return createVehicle({imageDataUrl,prompt:'A white delivery van. Suggest separate visible cargo and cab-door advertising panels.',example:true});},
 'undo-panels':async()=>{const f=document.querySelector('form[data-live-form="asset-edit"]'),id=f.elements.namedItem('id').value,previous=histories.get(id)?.pop();if(!previous){toast('No earlier change in this editing session.');return;}live.assetEdit={...previous,version:rawAsset(id).version};writeLocal(id,{version:rawAsset(id).version,asset:live.assetEdit});rerender();queueMicrotask(()=>document.querySelector('form[data-live-form="asset-edit"]')?.dispatchEvent(new Event('input',{bubbles:true})));},
 'refine-panels':async()=>{const form=document.querySelector('form[data-live-form="asset-edit"]'),prompt=form.elements.namedItem('instruction').value.trim();if(!prompt)throw new Error('Describe the change you want to make.');const a=await saveEditor(new FormData(form));return suggest(a,{prompt,existing:a,imageDataUrl:a.photoDataUrl});},
 'resume-ai':async el=>{const a=rawAsset(el.dataset.id),marker=readLocal(a.id,'job');if(!marker?.id)throw new Error('There is no earlier AI request for this draft.');return recoverJob(a,await api('ai/jobs/'+marker.id));},
};
export const onboardingForms={
 'vehicle-start':async data=>{const imageDataUrl=await photoData(data.get('camera'))??await photoData(data.get('photo'))??live.capturePhoto,prompt=String(data.get('prompt')??'').trim(),describe=data.get('mode')==='describe';
  if(!describe&&!imageDataUrl)throw new Error('Choose or take a vehicle photo first.');
  return createVehicle({imageDataUrl,prompt,generateReference:describe&&live.config.aiImageAvailable&&!imageDataUrl});
 },
};
export function editorTools(asset){const marker=readLocal(asset.id,'job');return `<div class="vehicle-editor-tools"><label class="button small">Change photo<input hidden name="replacementPhoto" type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif"></label><span data-draft-status role="status">Saved to your workspace</span>${act('undo-panels','Undo','','button small')}${marker&&!marker.applied?act('resume-ai','Check AI result',`data-id="${asset.id}"`,'button small'):''}</div>${live.config.aiAvailable?`<div class="vehicle-instruction">${input('instruction','Tell AI what to change','','text','maxlength="2000" placeholder="Split the doors into two placements"')}${act('refine-panels','Apply change','','button')}</div>`:''}`;}
export function mountOnboarding(r){
 if(r.id==='O03'){
  const form=document.querySelector('form[data-live-form="vehicle-start"]');for(const name of ['photo','camera'])form?.elements.namedItem(name)?.addEventListener('change',()=>{if(form.elements.namedItem(name).files.length)form.requestSubmit();});
 }
 const form=document.querySelector('form[data-live-form="asset-edit"]');if(!form)return;form.elements.namedItem('replacementPhoto')?.addEventListener('change',()=>{if(form.elements.namedItem('replacementPhoto').files.length)void import('./runtime.mjs').then(({run})=>run(()=>onboardingActions['replace-vehicle-photo']()));});let timer;
 form.addEventListener('input',event=>{if(event.target?.name==='instruction')return;clearTimeout(timer);try{const a=rememberEditor(form);live.assetEdit=a;form.querySelector('[data-draft-status]').textContent='Saving...';timer=setTimeout(()=>{if(!form.isConnected||!form.checkValidity())return;void saveEditor(new FormData(form)).catch(e=>{const status=form.querySelector('[data-draft-status]');if(status)status.textContent='Edits are saved on this device. '+e.message;});},900);}catch{const status=form.querySelector('[data-draft-status]');if(status)status.textContent='Finish this field to save.';}});
}
