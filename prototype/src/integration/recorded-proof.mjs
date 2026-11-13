import qualification from '../../../deployments/qualification.json' with {type:'json'};
import team from '../../../deployments/team-campaigns.json' with {type:'json'};
import {esc,link,icon,short} from '../ui.mjs';
import {placementNft} from './placement-nft.mjs';

// Public, committed historical receipts. This is never presented as a fresh
// ownership check or an action performed by the visitor.
export function recordedProof(){
 const record=qualification.record,steps=[['purchase','Reserved','Advertiser A reserved the spot.'],['takeover','Taken over','Advertiser B paid the next price.'],['mint','NFT issued','The final advertiser received creative control.'],['buyer-refund-reward','Refund & reward paid','The original advertiser claimed their credit.']];
 const van=team.campaigns.find(c=>c.vehicle==='van');
 return `<section class="nft-feature recorded-proof" aria-labelledby="proof-title"><div class="proof-intro"><h2 id="proof-title">a spot.<br>a takeover.<br>a right you own.</h2><p>Reservations, takeovers and creative rights are recorded on NEAR. Follow a completed mainnet test, from the first reservation to the final payout.</p><p class="proof-provenance">Real USDC transactions. Synthetic artwork and delivery.</p>${link('/records/'+record.saleId,'Inspect the completed campaign '+icon('arrow'),'editorial-link')}</div><div class="proof-history"><ol>${steps.map(([id,title,description])=>{const step=record.steps.find(s=>s.id===id);return `<li><div><strong>${title}</strong><p>${description}</p></div><a href="${esc(step.explorerUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Inspect the recorded ${esc(title.toLowerCase())} transaction">${icon('arrow')}</a></li>`;}).join('')}</ol><p class="proof-handoff">Creative control can move to a studio. ${link('/records/'+van.saleId,'See the recorded NFT handoff','text-link')}.</p></div><div class="proof-pass">${placementNft({surface:'Final advertising placement',owner:short(record.actors.buyerB),originalPayer:short(record.actors.buyerB),tokenId:record.offerId,phase:'archived',recorded:true})}<p>Recorded campaign right. Open the campaign for a fresh ownership check.</p></div></section>`;
}
