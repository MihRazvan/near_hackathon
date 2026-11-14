import {esc,icon} from '../ui.mjs';
import {live,rawAsset} from './runtime.mjs';
import {panelMarkup} from './vehicle-editor.mjs';
import {PANEL_LIMIT,newPanel,movePanel,resizePanel,editPanelVertex,shapePanel,panelShape,polygonPath} from './panel-geometry.mjs';
import {assetFields} from './asset-fields.mjs';
import {rememberUndo} from './onboarding.mjs';
import {editorHistoryState,restoreEditorHistory} from './editor-history.mjs';
import {activePhotoView,vehicleViews,viewSpots,viewId,viewPhoto,viewLabel,editorViews} from './vehicle-views.mjs';
import {input,select,hidden} from './ui.mjs';
const tools={add:['plus','Add spot'],draw:['surface','Draw spot'],undo:['undo','Undo'],redo:['redo','Redo'],duplicate:['copy','Duplicate'],delete:['trash','Delete']};
const command=(key,title=tools[key][1])=>`<button type="button" class="button small editor-command" data-editor-command="${key}" title="${title}" aria-label="${title}">${icon(tools[key][0])}<span>${title}</span></button>`;
export function editorToolbar(){return `<div class="spot-toolbar" role="toolbar" aria-label="Spot tools"><div>${command('add')}${command('draw')}</div><div>${command('undo')}${command('redo')}</div><div class="spot-selection-tools">${command('duplicate')}${command('delete')}</div></div>`;}
const rows=(a,selected)=>a.spots.map((p,i)=>`<div class="spot-list-row ${p.id===selected?'is-selected':''}" data-spot-row="${esc(p.id)}"><button type="button" data-editor-select="${esc(p.id)}" aria-pressed="${p.id===selected}"><span class="spot-list-number">${i+1}</span><span data-spot-name="${esc(p.id)}">${esc(p.name)}</span></button><button type="button" class="spot-row-delete" data-editor-delete="${esc(p.id)}" aria-label="Delete ${esc(p.name)}">${icon('trash')}</button></div>`).join('');
function fields(p,selected,asset){return `<fieldset data-spot-fields="${esc(p.id)}" ${p.id===selected?'':'hidden'}>${input('name:'+p.id,'Spot name',p.name,'text','required maxlength="80" autocomplete="off"')}${hidden('price:'+p.id,(Number(p.suggestedPriceCents)/100).toFixed(2))}<label class="field"><span>Shape</span><select data-editor-shape><option value="rectangle" ${panelShape(p)==='rectangle'?'selected':''}>Rectangle</option><option value="angled" ${panelShape(p)==='angled'?'selected':''}>Angled panel</option><option value="oval" ${panelShape(p)==='oval'?'selected':''}>Oval</option><option value="custom" ${panelShape(p)==='custom'?'selected':''} disabled>Custom outline</option></select></label><button type="button" class="button small" data-editor-command="outline" aria-pressed="false">Edit outline</button><p class="tiny muted">Use the handles to resize. Edit outline to fit individual corners.</p><details class="spot-precision"><summary>Position &amp; photo view</summary>${select('view:'+p.id,'Photo view',vehicleViews(asset).map(v=>[v.id,viewLabel(v)]),viewId(p))}<div class="grid two">${['x','y','width','height'].map(k=>input(k+':'+p.id,{x:'Left · %',y:'Top · %',width:'Width · %',height:'Height · %'}[k],(p.box[k]*100).toFixed(6),'number','min="0" max="100" step="0.000001" required')).join('')}</div></details></fieldset>`;}
export function spotInspector(a,selected){return `<div class="spot-inspector-heading"><h2>Spots <span data-spot-count>${a.spots.length}</span></h2><span class="tiny muted">Up to ${PANEL_LIMIT}</span></div><div class="spot-list" data-spot-list>${rows(a,selected)}</div><p class="spot-no-selection" data-no-selection ${selected?'hidden':''}>Click a spot to edit it, or add a new one.</p><div data-spot-properties>${a.spots.map(p=>fields(p,selected,a)).join('')}</div>`;}
let mounted;
export function unmountSpotWorkspace(){mounted?.abort();mounted=null;}
export function mountSpotWorkspace(form){
 unmountSpotWorkspace();const svg=form?.querySelector('[data-photo-editor]');if(!svg)return;
 const abort=new AbortController();mounted=abort;const {signal}=abort;
 const get=()=>live.assetEdit?.id===form.elements.namedItem('id').value?live.assetEdit:rawAsset(form.elements.namedItem('id').value);
 const query=new URLSearchParams(location.search);let selected=query.get('spot'),currentView=activePhotoView(get(),selected,query.get('view')).id;if(!get().spots.some(p=>p.id===selected))selected=viewSpots(get(),currentView)[0]?.p.id??null;
 let mode='select',outline=false,drag=null,suppressClick=false;
 const image=svg.closest('.vehicle-editor-image'),list=form.querySelector('[data-spot-list]'),properties=form.querySelector('[data-spot-properties]');
 const sync=()=>{const a=get();live.assetEdit={...a,...assetFields(new FormData(form),a)};return get();};
 const dimensions=()=>{const r=svg.getBoundingClientRect();return {width:1000,height:r.width?1000*r.height/r.width:667,scale:r.width/1000||1};};
 const point=e=>{const r=svg.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))};};
 const announce=message=>{form.querySelector('[data-editor-announcement]').textContent=message;};
 const store=()=>{form.dispatchEvent(new Event('input',{bubbles:true}));updateTools();};
 function updateTools(){
  const a=get(),history=editorHistoryState(live.session.wallet,a.id),has=a.spots.some(p=>p.id===selected);
  for(const el of form.querySelectorAll('[data-editor-command]')){const key=el.dataset.editorCommand;el.disabled=(['add','draw','duplicate'].includes(key)&&a.spots.length>=PANEL_LIMIT)||(['delete','duplicate','outline'].includes(key)&&!has)||(key==='undo'&&!history.undo)||(key==='redo'&&!history.redo);if(key==='draw')el.setAttribute('aria-pressed',String(mode==='draw'));if(key==='outline'){el.setAttribute('aria-pressed',String(outline));el.textContent=outline?'Done with outline':'Edit outline';}}
  form.querySelector('[data-spot-count]').textContent=a.spots.length;
  const next=form.querySelector('[data-editor-continue]');if(next){next.disabled=!a.spots.length;next.textContent=a.spots.length?next.dataset.label:'Add a spot to continue';}
  const helper=form.querySelector('[data-editor-help]');helper.textContent=mode==='draw'?'Drag on the photo to draw a new spot. Escape cancels.':outline?'Drag a corner to fit the vehicle panel. Escape returns to resizing.':'Drag to move · Handles to resize · Delete to remove';
  image.dataset.editorMode=mode;
 }
 function paint(){const selectedSpot=get().spots.find(p=>p.id===selected);const shape=properties.querySelector('[data-spot-fields]:not([hidden]) [data-editor-shape]');if(shape&&selectedSpot)shape.value=panelShape(selectedSpot);const photo=vehicleViews(get()).find(v=>v.id===currentView)??vehicleViews(get())[0];currentView=photo.id;image.dataset.currentView=currentView;const src=viewPhoto(photo),img=image.querySelector('img');if(img&&src){if(img.getAttribute('src')!==src)img.src=src;img.alt='Your vehicle: '+get().title+' · '+viewLabel(photo);}for(const button of form.querySelectorAll('[data-editor-view]')){const active=button.dataset.editorView===currentView;button.classList.toggle('primary',active);button.setAttribute('aria-pressed',String(active));}const caption=image.closest('figure').querySelector('figcaption');caption.innerHTML=photo.imageProvenance==='ai-generated'?'<span class="demo-tag" title="AI-generated vehicle reference">Demo</span>':'Outlines are editable. Confirm physical measurements before printing.';const d=dimensions();svg.setAttribute('viewBox',`0 0 ${d.width} ${d.height}`);svg.innerHTML=viewSpots(get(),currentView).sort((a,b)=>Number(a.p.id===selected)-Number(b.p.id===selected)).map(({p,i})=>panelMarkup(p,i,selected,{...d,outline})).join('');updateTools();}
 function selectSpot(id,{focus=false}={}){
  selected=get().spots.some(p=>p.id===id)?id:null;if(selected)currentView=viewId(get().spots.find(p=>p.id===selected));outline=false;
  const q=new URLSearchParams(location.search);selected?q.set('spot',selected):q.delete('spot');currentView==='main'?q.delete('view'):q.set('view',currentView);history.replaceState(history.state,'',location.pathname+(q.size?'?'+q:'')+location.hash);
  for(const el of list.querySelectorAll('[data-spot-row]')){const active=el.dataset.spotRow===selected;el.classList.toggle('is-selected',active);el.querySelector('[data-editor-select]').setAttribute('aria-pressed',String(active));}
  for(const el of properties.querySelectorAll('[data-spot-fields]'))el.hidden=el.dataset.spotFields!==selected;
  form.querySelector('[data-no-selection]').hidden=!!selected;paint();
  if(focus)focusCanvas();
 }
 function focusCanvas(){(selected?svg.querySelector(`[data-panel="${CSS.escape(selected)}"]`):svg)?.focus({preventScroll:true});}
 function rebuild({focus=true}={}){
  const a=get();list.innerHTML=rows(a,selected);properties.innerHTML=a.spots.map(p=>fields(p,selected,a)).join('');
  for(const key of ['title','city','description','assetType']){const field=form.elements.namedItem(key);if(field)field.value=a[key]??'';}
  const bar=form.querySelector('[data-photo-views]');if(bar)bar.outerHTML=editorViews(a,currentView);
  selectSpot(selected,{focus});
 }
 function apply(p){const a=get();a.spots=a.spots.map(old=>old.id===p.id?p:old);live.assetEdit=a;for(const k of ['x','y','width','height'])form.elements.namedItem(k+':'+p.id).value=(p.box[k]*100).toFixed(6);paint();}
 function mutate(change,{select,description}={}){const a=sync();rememberUndo(a);const next=structuredClone(a);change(next);live.assetEdit=next;mode='select';if(select!==undefined)selected=select;rebuild();store();if(description)announce(description);}
 function remove(id=selected){if(!id)return;const a=sync(),index=a.spots.findIndex(p=>p.id===id);if(index<0)return;const name=a.spots[index].name;mutate(next=>next.spots.splice(index,1),{select:selected!==id&&a.spots.some(p=>p.id===selected)?selected:a.spots.filter(p=>p.id!==id)[Math.min(index,a.spots.length-2)]?.id??null,description:name+' deleted. Undo restores it.'});}
 function cancelGesture(){if(!drag)return;const before=drag.before;if(drag.kind==='draw')mode='select';if(drag.kind!=='draw')live.assetEdit=before;delete form.dataset.editingGeometry;drag=null;rebuild();if(form.dataset.dirty==='true')store();announce('Change cancelled.');}
 function command(key){
  if(live.busy||form.querySelector('fieldset.vehicle-edit-fields:disabled'))return;
  if(['delete','duplicate','outline'].includes(key)&&!selected)return;
  if(key==='delete')return remove();
  if(key==='add'||key==='duplicate'){if(get().spots.length>=PANEL_LIMIT){announce('This vehicle already has eight spots.');return;}const a=sync(),spot={...newPanel(a.spots,key==='duplicate'?{copy:a.spots.find(p=>p.id===selected)}:{}),photoViewId:currentView,side:vehicleViews(a).find(v=>v.id===currentView).side};return mutate(next=>next.spots.push(spot),{select:spot.id,description:spot.name+' added. Drag it into place.'});}
  if(key==='draw'){mode=mode==='draw'?'select':'draw';outline=false;paint();focusCanvas();return;}
  if(key==='outline'){outline=!outline;mode='select';paint();focusCanvas();return;}
  if(key==='undo'||key==='redo'){const current=sync(),next=restoreEditorHistory(live.session.wallet,current,key);if(!next)return;live.assetEdit=next;if(!next.spots.some(p=>p.id===selected))selected=next.spots[0]?.id??null;mode='select';rebuild();store();announce(key==='undo'?'Change undone.':'Change redone.');}
 }
 form.addEventListener('click',e=>{
  const control=e.target.closest('[data-editor-command],[data-editor-select],[data-editor-delete],[data-editor-photo],[data-editor-view]');if(!control)return;e.preventDefault();
  if(control.disabled)return;
  if(control.hasAttribute('data-editor-view')){if(drag||live.busy)return;sync();currentView=control.dataset.editorView;selectSpot(viewSpots(get(),currentView)[0]?.p.id??null);announce(viewLabel(vehicleViews(get()).find(v=>v.id===currentView))+' photo selected.');return;}
  if(control.hasAttribute('data-editor-photo')){form.elements.namedItem('replacementPhoto').click();return;}
  if(control.hasAttribute('data-editor-select')){sync();selectSpot(control.dataset.editorSelect,{focus:true});}
  else if(control.hasAttribute('data-editor-delete'))remove(control.dataset.editorDelete);
  else command(control.dataset.editorCommand);
 },{signal});
 form.addEventListener('change',e=>{if(e.target.name?.startsWith('view:')){const id=e.target.name.slice(5),view=e.target.value;currentView=view;sync();selectSpot(id);store();return;}if(!e.target.matches('[data-editor-shape]')||!selected)return;const shape=e.target.value;mutate(a=>{a.spots=a.spots.map(p=>p.id===selected?shapePanel(p,shape):p);},{select:selected,description:'Spot shape updated.'});},{signal});
 form.addEventListener('input',e=>{
  if(e.target===form)return;const name=e.target.name??'';
  if(name.startsWith('name:')){const id=name.slice(5),label=list.querySelector(`[data-spot-name="${CSS.escape(id)}"]`);if(label)label.textContent=e.target.value;}
  if(/^(name|view|x|y|width|height):/.test(name)){try{sync();paint();}catch{}}
 },{signal});
 form.addEventListener('invalid',e=>{const field=e.target.closest('[data-spot-fields]');if(field){selectSpot(field.dataset.spotFields);e.target.focus();}else{const details=e.target.closest('details');if(details)details.open=true;}},{signal,capture:true});
 svg.addEventListener('pointerdown',e=>{
  if(e.button!==0||e.isPrimary===false||drag||live.busy)return;
  const group=e.target.closest('[data-panel]');if(!group&&mode!=='draw'){selectSpot(null);svg.focus({preventScroll:true});return;}
  const before=structuredClone(sync()),start=point(e);
  if(mode==='draw'){if(before.spots.length>=PANEL_LIMIT)return;drag={kind:'draw',before,start,origin:{x:e.clientX,y:e.clientY},pointerId:e.pointerId,moved:false};}
  else{const id=group.dataset.panel;if(id!==selected)selectSpot(id);focusCanvas();const spot=get().spots.find(p=>p.id===id);drag={kind:'edit',before,spot:structuredClone(spot),id,start,origin:{x:e.clientX,y:e.clientY},pointerId:e.pointerId,handle:e.target.closest('[data-handle]')?.dataset.handle,vertex:outline?e.target.closest('[data-vertex]')?.dataset.vertex:undefined,moved:false};}
  e.preventDefault();form.dataset.editingGeometry='true';svg.setPointerCapture(e.pointerId);
 },{signal});
 svg.addEventListener('pointermove',e=>{
  if(!drag||e.pointerId!==drag.pointerId)return;const p=point(e),dx=p.x-drag.start.x,dy=p.y-drag.start.y;
  if(!drag.moved&&Math.hypot(e.clientX-drag.origin.x,e.clientY-drag.origin.y)<3)return;drag.moved=true;
  if(drag.kind==='draw'){
   const box={x:Math.min(p.x,drag.start.x),y:Math.min(p.y,drag.start.y),width:Math.abs(dx),height:Math.abs(dy)};drag.box=box;paint();const d=dimensions();svg.insertAdjacentHTML('beforeend',`<path class="spot-draw-preview" d="${polygonPath({box},d.width,d.height)}" vector-effect="non-scaling-stroke"/>`);return;
  }
  apply(drag.vertex!==undefined?editPanelVertex(drag.spot,Number(drag.vertex),[p.x,p.y]):drag.handle?resizePanel(drag.spot,drag.handle,dx,dy):movePanel(drag.spot,dx,dy));
 },{signal});
 const finish=e=>{
  if(!drag||e.pointerId!==drag.pointerId)return;const gesture=drag;drag=null;delete form.dataset.editingGeometry;
  if(gesture.kind==='draw'){
   mode='select';const b=gesture.box;
   if(b&&b.width>=.025&&b.height>=.025){const spot={...newPanel(get().spots,{box:b}),photoViewId:currentView,side:vehicleViews(get()).find(v=>v.id===currentView).side};rememberUndo(gesture.before);get().spots.push(spot);selected=spot.id;rebuild();store();announce(spot.name+' drawn.');}else{paint();announce('Drag a larger area to draw a spot.');}
  }else if(gesture.moved){rememberUndo(gesture.before);store();focusCanvas();}else if(form.dataset.dirty==='true')store();
  suppressClick=true;setTimeout(()=>suppressClick=false,0);
 };
 svg.addEventListener('pointerup',finish,{signal});svg.addEventListener('pointercancel',cancelGesture,{signal});svg.addEventListener('lostpointercapture',()=>{if(drag)cancelGesture();},{signal});
 svg.addEventListener('dblclick',e=>{const g=e.target.closest('[data-panel]');if(!g)return;selectSpot(g.dataset.panel);const field=form.elements.namedItem('name:'+selected);field?.focus();field?.select();},{signal});
 svg.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();if(!suppressClick&&!drag){const group=e.target.closest('[data-panel]');if(group&&group.dataset.panel!==selected)selectSpot(group.dataset.panel,{focus:true});}},{signal});
 document.addEventListener('keydown',e=>{
  if(!form.isConnected||!form.contains(document.activeElement)&&!drag)return;
  if(e.target.closest('input,textarea,select,[contenteditable="true"]')||document.querySelector('dialog[open]')||live.busy)return;
  if(e.key==='Escape'){e.preventDefault();if(drag)cancelGesture();else if(mode==='draw'||outline){mode='select';outline=false;paint();focusCanvas();}else selectSpot(null);return;}
  const focused=e.target.closest('[data-panel]');
  if((e.key==='Enter'||e.key===' ')&&focused){e.preventDefault();selectSpot(focused.dataset.panel,{focus:true});return;}
  if(focused&&focused.dataset.panel!==selected)selectSpot(focused.dataset.panel,{focus:true});
  const mod=e.metaKey||e.ctrlKey,key=e.key.toLowerCase();
  if(drag){if(mod&&key==='z'){e.preventDefault();cancelGesture();}return;}
  if(mod&&key==='z'){e.preventDefault();command(e.shiftKey?'redo':'undo');return;}
  if(mod&&key==='y'){e.preventDefault();command('redo');return;}
  if(mod&&key==='d'){e.preventDefault();command('duplicate');return;}
  if((e.key==='Delete'||e.key==='Backspace')&&selected){e.preventDefault();if(!e.repeat)remove();return;}
  const delta={ArrowLeft:[-.002,0],ArrowRight:[.002,0],ArrowUp:[0,-.002],ArrowDown:[0,.002]}[e.key];
  if(!delta||!selected||mod)return;e.preventDefault();const a=sync(),spot=a.spots.find(p=>p.id===selected);if(!spot)return;if(!e.repeat)rememberUndo(a);apply(movePanel(spot,...delta,{resize:e.shiftKey}));store();focusCanvas();
 },{signal});
 const observer=new ResizeObserver(()=>{if(!drag)paint();});observer.observe(svg);signal.addEventListener('abort',()=>observer.disconnect(),{once:true});
 image.querySelector('img')?.addEventListener('load',()=>{if(!drag)paint();},{signal});
 selectSpot(selected);updateTools();
}
