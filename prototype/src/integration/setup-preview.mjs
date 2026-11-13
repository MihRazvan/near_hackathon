import {icon} from '../ui.mjs';
const webm=new URL('../assets/listing-setup.webm',import.meta.url).href;
const mp4=new URL('../assets/listing-setup.mp4',import.meta.url).href;

export function setupPreview(){
 return `<figure class="setup-preview"><div class="setup-preview-frame"><video data-setup-preview muted loop playsinline preload="none" poster="/images/listing-preview.webp" width="1000" height="742" aria-label="Recorded vehicle editor: select, move, resize and duplicate an advertising spot, then set dates and prices"><source src="${webm}" type="video/webm"><source src="${mp4}" type="video/mp4"></video></div><figcaption><span>Photo → editable spots → your listing</span><button type="button" data-preview-play aria-pressed="false">Play preview ${icon('arrow')}</button></figcaption><p>A recording of the working editor. Try it with your own vehicle.</p></figure>`;
}

let cleanup,choice,resumeAt=0;
export function mountSetupPreview(){
 cleanup?.();cleanup=undefined;
 const video=document.querySelector('[data-setup-preview]'),button=document.querySelector('[data-preview-play]');
 if(!video||!button){choice=undefined;resumeAt=0;return;}
 const controller=new AbortController(),signal=controller.signal,preference=matchMedia('(prefers-reduced-motion: reduce)');
 let paused=choice??(preference.matches||navigator.connection?.saveData===true),visible=false;
 const startAt=resumeAt;
 const label=()=>{button.setAttribute('aria-pressed',String(!video.paused));button.textContent=video.paused?'Play preview':'Pause preview';};
 const play=()=>video.play().catch(()=>{if(signal.aborted)return;paused=true;choice=true;label();});
 const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible&&!paused&&!document.hidden)void play();else video.pause();},{threshold:.2});
 observer.observe(video);
 button.addEventListener('click',()=>{paused=!video.paused;choice=paused;if(paused)video.pause();else void play();},{signal});
 video.addEventListener('loadedmetadata',()=>{if(startAt>0&&Number.isFinite(video.duration))video.currentTime=Math.min(startAt,Math.max(0,video.duration-.1));},{signal});
 video.addEventListener('play',label,{signal});video.addEventListener('pause',label,{signal});
 preference.addEventListener('change',()=>{if(preference.matches){paused=true;choice=true;video.pause();}},{signal});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)video.pause();else if(visible&&!paused)void play();},{signal});
 cleanup=()=>{resumeAt=video.currentTime;controller.abort();observer.disconnect();video.pause();};
}
