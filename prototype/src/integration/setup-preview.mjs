import {icon} from '../ui.mjs';

const steps=[
 {name:'Photo',title:'Start with what you drive.',description:'Add a photo or describe your vehicle.'},
 {name:'Spots',title:'Make the space yours.',description:'AI suggests the spots. Drag the blue handle to adjust the fit.'},
 {name:'Listing',title:'Your vehicle. Ready to list.',description:'Choose your dates, prices and takeover rules.'}
];
// These two example outlines match this reference photo, not arbitrary uploads.
const cargo='M182 374 Q182 355 202 355 L957 355 Q978 355 978 374 L971 488 Q971 504 952 504 L202 504 Q182 504 182 488 Z';
const cab='M1052 561 L1238 581 L1222 626 L1056 626 Z';
export function setupPreview(){
 return `<figure class="setup-preview" data-setup-preview data-step="1" data-playing="false">
  <div class="setup-photo">
   <img src="/images/setup-van.webp" width="1536" height="1024" alt="Example white van, with its cargo panel and cab door available as separate advertising spots" fetchpriority="high" decoding="async">
   <span class="demo-tag setup-demo">Demo</span>
   <div class="setup-prompt" aria-hidden="true">${icon('camera')}<span>A white van.<br>Cargo panel + cab door.</span></div>
   <svg class="setup-outlines" viewBox="0 0 1536 1024" aria-hidden="true"><g class="setup-cargo" data-setup-cargo><path class="setup-panel" d="${cargo}"/><g class="setup-handles">${[[182,355],[978,355],[182,504],[978,504]].map(([x,y])=>`<rect x="${x-7}" y="${y-7}" width="14" height="14"/>`).join('')}</g></g><path class="setup-panel setup-cab" d="${cab}"/></svg>
   <span class="setup-panel-name" aria-hidden="true">Cargo panel</span>
   <button class="setup-resize" type="button" data-setup-resize aria-label="Resize cargo panel preview. Drag, or use left and right arrow keys."><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 7-5 5 5 5m8-10 5 5-5 5M3 12h18"/></svg></button>
   <div class="setup-listing" aria-hidden="true"><span class="setup-listing-mark">${icon('check')}</span><div><strong>Your van, your ad space.</strong><span>2 spots · Dates & prices next</span></div></div>
  </div>
  <figcaption>
   <div class="setup-step-picker" role="group" aria-label="Preview the listing process">${steps.map((step,i)=>`<button type="button" data-setup-step="${i}" aria-pressed="${i===1}"><span>${i+1}</span>${step.name}</button>`).join('')}</div>
   <div class="setup-caption"><div><h2 data-setup-title>${steps[1].title}</h2><p data-setup-description>${steps[1].description}</p></div><button type="button" class="setup-play" data-preview-play aria-pressed="false">Play preview ${icon('arrow')}</button></div>
   <span class="sr-only" data-setup-status aria-live="polite"></span>
  </figcaption>
 </figure>`;
}

let cleanup,state;
export function mountSetupPreview(){
 cleanup?.();cleanup=undefined;
 const root=document.querySelector('[data-setup-preview]');
 if(!root){state=undefined;return;}
 const controller=new AbortController(),{signal}=controller,preference=matchMedia('(prefers-reduced-motion: reduce)');
 state??={step:preference.matches?1:0,scale:1,playing:!preference.matches&&navigator.connection?.saveData!==true,finished:false};
 const playButton=root.querySelector('[data-preview-play]'),handle=root.querySelector('[data-setup-resize]');
 let timer,visible=false,drag;
 const stopTimer=()=>{clearTimeout(timer);timer=undefined;};
 const paint=()=>{
  root.dataset.step=String(state.step);root.dataset.playing=String(state.playing);
  root.style.setProperty('--cargo-scale',state.scale);
  root.querySelector('[data-setup-cargo]').setAttribute('transform',`translate(182 0) scale(${state.scale} 1) translate(-182 0)`);
  handle.style.left=(182+796*state.scale)/1536*100+'%';handle.disabled=state.step!==1;
  handle.tabIndex=state.step===1?0:-1;
  for(const button of root.querySelectorAll('[data-setup-step]'))button.setAttribute('aria-pressed',String(Number(button.dataset.setupStep)===state.step));
  root.querySelector('[data-setup-title]').textContent=steps[state.step].title;
  root.querySelector('[data-setup-description]').textContent=steps[state.step].description;
  playButton.setAttribute('aria-pressed',String(state.playing));playButton.textContent=state.playing?'Pause':state.finished?'Replay':'Play preview';
 };
 const schedule=()=>{
  stopTimer();if(!state.playing||!visible||document.hidden)return;
  timer=setTimeout(()=>{if(state.step<2)state.step++;if(state.step===2){state.playing=false;state.finished=true;}paint();schedule();},state.step===0?2400:3800);
 };
 const choose=step=>{stopTimer();state.step=step;state.playing=false;state.finished=step===2;paint();root.querySelector('[data-setup-status]').textContent=steps[step].title+' '+steps[step].description;};
 const scale=value=>{state.scale=Math.min(1.02,Math.max(.65,value));paint();};
 for(const button of root.querySelectorAll('[data-setup-step]'))button.addEventListener('click',()=>choose(Number(button.dataset.setupStep)),{signal});
 playButton.addEventListener('click',()=>{state.playing=!state.playing;if(state.playing&&state.step===2){state.step=0;state.finished=false;}paint();schedule();},{signal});
 handle.addEventListener('pointerdown',event=>{if(event.button!==0||state.step!==1)return;event.preventDefault();choose(1);drag={id:event.pointerId,x:event.clientX,scale:state.scale,width:root.querySelector('.setup-photo').getBoundingClientRect().width};handle.setPointerCapture(event.pointerId);root.dataset.dragging='true';},{signal});
 handle.addEventListener('pointermove',event=>{if(drag?.id===event.pointerId)scale(drag.scale+(event.clientX-drag.x)/drag.width*1536/796);},{signal});
 const finish=event=>{if(drag?.id!==event.pointerId)return;drag=undefined;delete root.dataset.dragging;};
 handle.addEventListener('pointerup',finish,{signal});handle.addEventListener('pointercancel',finish,{signal});handle.addEventListener('lostpointercapture',finish,{signal});
 handle.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();choose(1);scale(event.key==='Home'?.65:event.key==='End'?1.02:state.scale+(event.key==='ArrowLeft'?-.035:.035));},{signal});
 preference.addEventListener('change',()=>{if(preference.matches){state.playing=false;paint();stopTimer();}},{signal});
 document.addEventListener('visibilitychange',schedule,{signal});
 const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;schedule();},{threshold:.3});
 paint();observer.observe(root);
 cleanup=()=>{stopTimer();controller.abort();observer.disconnect();};
}
