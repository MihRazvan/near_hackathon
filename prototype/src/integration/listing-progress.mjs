import {esc} from '../ui.mjs';
import {publicationCapacity} from './publication-capacity.mjs';
export function listingProgress(step){
 return `<nav class="listing-progress" aria-label="Listing setup"><ol>${['Add vehicle','Edit spots','Set your offer'].map((name,i)=>`<li ${i+1===step?'aria-current="step"':''} class="${i+1<step?'is-complete':''}"><span>${i+1}</span>${esc(name)}</li>`).join('')}</ol><p data-entry-capacity>Private draft · no payment to create</p></nav>`;
}
export function mountCreationHints(){
 const el=document.querySelector('[data-entry-capacity]');
 if(el)void publicationCapacity().then(value=>{if(el.isConnected&&value.sponsoredSlots===0&&!value.paidAvailable)el.textContent='Publication sponsorship is currently full. You can still create and save a private draft.';}).catch(()=>{});
 const form=document.querySelector('form[data-live-form="quick-offer"]');
 form?.addEventListener('invalid',event=>{const detail=event.target.closest('details');if(detail)detail.open=true;},{capture:true});
}
