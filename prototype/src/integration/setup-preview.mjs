const chapters=[
 ['Scan it. Or describe it.','AI turns your vehicle into a starting layout.'],
 ['Your spots. Your terms.','Adjust the panels, price and campaign dates.'],
 ['Reserve. Or take over.','Bookings can change hands before printing.'],
 ['Own the creative right.','Booking closes. The final advertiser receives the placement NFT.']
];
const cargo='M182 374 Q182 355 202 355 L957 355 Q978 355 978 374 L971 488 Q971 504 952 504 L202 504 Q182 504 182 488 Z';
const cab='M1052 561 L1238 581 L1222 626 L1056 626 Z';
const pause='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>';
const play='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7Z"/></svg>';
export function setupPreview(){
 return `<figure class="setup-preview story-preview" data-setup-preview data-scene="3" data-takeover="true" data-complete="true"><div class="setup-photo">
  <img src="/images/setup-van.webp" width="1536" height="1024" alt="Example van illustrating vehicle setup, advertising reservations, takeovers and the final placement NFT" fetchpriority="high" decoding="async">
  <img class="story-ad story-coffee" src="/images/story-coffee.webp" width="1536" height="1024" alt="" aria-hidden="true" decoding="async">
  <img class="story-ad story-everywhere" src="/images/story-everywhere.webp" width="1536" height="1024" alt="" aria-hidden="true" decoding="async">
  <span class="demo-tag setup-demo">Illustration</span><button type="button" class="story-motion" data-story-motion aria-label="Pause illustration" hidden>${pause}</button>
  <div class="story-scan" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
  <svg class="story-panels" viewBox="0 0 1536 1024" aria-hidden="true"><g data-story-cargo><path pathLength="1" d="${cargo}"/><g class="story-handles"><rect x="175" y="348" width="14" height="14"/><rect x="971" y="348" width="14" height="14"/><rect x="175" y="497" width="14" height="14"/><rect x="971" y="497" width="14" height="14"/></g></g><path pathLength="1" d="${cab}"/></svg>
  <div class="story-booking" aria-hidden="true"><span class="story-reserved">Daybreak reserves this spot.</span><span class="story-taken">Everywhere takes over.</span></div>
  <div class="story-refund" aria-hidden="true">Refund rights stay with the original buyer.</div>
  <div class="story-nft" aria-hidden="true"><span>NEAR</span><strong>Placement NFT</strong><p>Final advertiser.<br>Creative control.</p><small>Artwork rights, held in your wallet.</small></div>
 </div><figcaption><span class="sr-only">Illustration: scan or describe a vehicle, edit advertising spots, reserve or take over a booking, then receive the final placement NFT after booking closes. No real transaction is performed.</span><div class="story-captions" aria-hidden="true">${chapters.map(([title,description],i)=>`<div data-story-caption="${i}"><strong>${title}</strong><p>${description}</p></div>`).join('')}</div><div class="story-progress" aria-hidden="true">${chapters.map((_,i)=>`<span data-story-part="${i}"></span>`).join('')}</div></figcaption></figure>`;
}

let cleanup,state;
const total=13500,chapterAt=t=>t<2400?0:t<5400?1:t<10000?2:3;
export function mountSetupPreview(){
 cleanup?.();cleanup=undefined;
 const root=document.querySelector('[data-setup-preview]');if(!root){state=undefined;return;}
 state??={elapsed:0,paused:false,complete:false};
 const preference=matchMedia('(prefers-reduced-motion: reduce)'),controller=new AbortController(),{signal}=controller,button=root.querySelector('[data-story-motion]');
 let frame,last,visible=false;
 const paint=()=>{
  const t=state.elapsed,scene=chapterAt(t);root.dataset.scene=String(scene);root.dataset.takeover=String(t>=7600);root.dataset.complete=String(state.complete);root.dataset.storyTime=String(Math.round(t));
  const fade=start=>{const x=Math.min(1,Math.max(0,(t-start)/650));return x*x*(3-2*x);};
  root.style.setProperty('--coffee-opacity',fade(5400));root.style.setProperty('--takeover-opacity',fade(7600));root.style.setProperty('--nft-progress',fade(10000));
  root.style.setProperty('--story-trace',Math.min(1,Math.max(0,(t-2400)/850)));
  root.querySelector('[data-story-cargo]').setAttribute('transform',`translate(182 0) scale(${.82+.18*Math.min(1,Math.max(0,(t-3350)/900))} 1) translate(-182 0)`);
  for(const segment of root.querySelectorAll('[data-story-part]'))segment.dataset.active=String(Number(segment.dataset.storyPart)===scene);
  button.hidden=state.complete;if(button.dataset.paused!==String(state.paused)){button.dataset.paused=String(state.paused);button.setAttribute('aria-label',state.paused?'Resume illustration':'Pause illustration');button.innerHTML=state.paused?play:pause;}
 };
 const stop=()=>{cancelAnimationFrame(frame);frame=undefined;last=undefined;};
 const finish=()=>{stop();state.elapsed=total;state.complete=true;paint();};
 const tick=now=>{if(signal.aborted)return;if(last!==undefined)state.elapsed=Math.min(total,state.elapsed+Math.min(100,now-last));last=now;if(state.elapsed>=total){finish();return;}paint();frame=requestAnimationFrame(tick);};
 const update=()=>{stop();if(!state.complete&&!state.paused&&visible&&!document.hidden&&[...root.querySelectorAll('img')].every(i=>i.complete&&i.naturalWidth>0))frame=requestAnimationFrame(tick);};
 if(preference.matches||navigator.connection?.saveData){finish();controller.abort();return;}
 paint();
 button.addEventListener('click',()=>{state.paused=!state.paused;paint();update();},{signal});
 for(const image of root.querySelectorAll('img'))image.addEventListener('load',update,{signal});
 document.addEventListener('visibilitychange',update,{signal});
 preference.addEventListener('change',()=>{if(preference.matches)finish();},{signal});
 const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;update();},{threshold:.25});observer.observe(root);
 cleanup=()=>{stop();controller.abort();observer.disconnect();};
}
