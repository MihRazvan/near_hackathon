// Illustrative contours tied to this reference photograph. Actual uploads are
// analysed and edited in owner setup; the hero makes no AI or wallet requests.
const panels=[
 'M182 374 Q182 355 202 355 L957 355 Q978 355 978 374 L971 488 Q971 504 952 504 L202 504 Q182 504 182 488 Z',
 'M1052 561 L1238 581 L1222 626 L1056 626 Z'
];
export function setupPreview(){
 return `<figure class="setup-preview" data-setup-preview data-reveal="done"><div class="setup-photo"><img src="/images/setup-van.webp" width="1536" height="1024" alt="Example white van showing two advertising spots on its cargo panel and cab door" fetchpriority="high" decoding="async"><span class="demo-tag setup-demo">Demo</span><svg class="setup-outlines" viewBox="0 0 1536 1024" aria-hidden="true">${panels.map(path=>`<path data-setup-outline pathLength="1" d="${path}"/>`).join('')}</svg></div><figcaption>AI maps your ad spots. You choose the terms.</figcaption></figure>`;
}

let cleanup,state;
export function mountSetupPreview(){
 cleanup?.();cleanup=undefined;
 const root=document.querySelector('[data-setup-preview]');
 if(!root){state=undefined;return;}
 state??={elapsed:0,complete:false};
 const preference=matchMedia('(prefers-reduced-motion: reduce)');
 if(preference.matches||navigator.connection?.saveData||!root.animate){state.complete=true;return;}
 if(state.complete)return;
 const controller=new AbortController(),{signal}=controller,image=root.querySelector('img');
 let animations=[],visible=false;
 root.dataset.reveal='pending';
 const finish=()=>{state.complete=true;root.dataset.reveal='done';animations.forEach(a=>a.cancel());animations=[];};
 const update=()=>{
  if(state.complete)return;
  if(!visible||document.hidden||!image.complete||!image.naturalWidth){animations.forEach(a=>a.pause());return;}
  if(!animations.length){
   root.dataset.reveal='running';
   animations=[...root.querySelectorAll('[data-setup-outline]')].map((path,i)=>{
    const animation=path.animate([{offset:0,strokeDashoffset:1,fillOpacity:0},{offset:.75,strokeDashoffset:0,fillOpacity:0},{offset:1,strokeDashoffset:0,fillOpacity:1}],{duration:1800,delay:i*200,fill:'both',easing:'cubic-bezier(.16,1,.3,1)'});
    animation.currentTime=state.elapsed;return animation;
   });
   void Promise.all(animations.map(a=>a.finished)).then(()=>{if(!signal.aborted)finish();}).catch(()=>{});
  }
  animations.forEach(a=>a.play());
 };
 const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;update();},{threshold:.3});
 observer.observe(root);
 image.addEventListener('load',update,{signal});
 document.addEventListener('visibilitychange',update,{signal});
 preference.addEventListener('change',()=>{if(preference.matches)finish();},{signal});
 cleanup=()=>{if(!state.complete)state.elapsed=Math.max(state.elapsed,...animations.map(a=>Number(a.currentTime)||0));controller.abort();observer.disconnect();animations.forEach(a=>a.cancel());};
}
