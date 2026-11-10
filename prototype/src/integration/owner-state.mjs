// Owner-facing states use the campaign's confirmed facts and its published dates.
const ns=(value,fallback=0n)=>value===undefined||value===null?fallback:BigInt(value);
const money=value=>BigInt(value??'0');
export function defaultOwnerSchedule(now){
 const day=86400000,offsets={biddingClose:day,artworkDue:2*day,installationDue:3*day,serviceStart:3*day,serviceEnd:10*day,reviewEnd:11*day};
 return Object.fromEntries(Object.entries(offsets).map(([key,offset])=>[key,new Date(now+offset).toISOString()]));
}
export function ownerCampaignStage(snapshot,now){
 if(!snapshot)return {key:'syncing',title:'Updating campaign',description:'Your latest campaign status is being confirmed.',action:'refresh'};
 const {state:s,rights:r,campaign:c}=snapshot,t=BigInt(Math.trunc(now))*1000000n,terms=c.terms??{};
 if(s.outcome==='success')return {key:'complete',title:'Campaign complete',description:'The campaign has settled successfully. Available earnings are ready to claim.',action:'earnings'};
 if(s.outcome==='failure')return {key:'cancelled',title:'Campaign cancelled',description:'Available refunds belong to the original advertisers. This campaign is closed.',action:'earnings'};
 if(t<ns(s.cutoff_ns))return {key:'booking',title:s.holder?'Advertiser booked':'Open for bookings',description:s.holder?'Bookings remain open until the published deadline. Review the final advertiser’s artwork after bookings close.':'Your listing is available to advertisers. Share it to find your next campaign.',action:'listing'};
 if(!s.holder)return {key:'unbooked',title:'Booking closed',description:'This period closed without an advertiser. Create another sale to offer a new campaign period.',action:'new-sale'};
 if(!s.artwork_locked){
  if(t>=ns(terms.artwork_due_ns,r.rights_end_ns?ns(r.rights_end_ns):ns(s.refund_end_ns)))return {key:'artwork-overdue',title:'Artwork deadline passed',description:'Artwork is still awaiting approval. Request a review to resolve the campaign before any printing.',action:'support'};
  if(r.proposal)return {key:'review-artwork',title:'Artwork ready to review',description:'Review the advertiser’s latest artwork and approve the exact version before printing.',action:'fulfillment'};
  return {key:'awaiting-artwork',title:'Waiting for advertiser artwork',description:'The advertiser can now prepare their artwork. You’ll review it here before production.',action:'message'};
 }
 if(!c.delivery_proof){
  if(t>ns(terms.service_end_ns,s.refund_end_ns?ns(s.refund_end_ns):0n))return {key:'proof-overdue',title:'Installation evidence missing',description:'The campaign period has ended without installation evidence. Request a review to resolve it.',action:'support'};
  return {key:'installation',title:'Ready for installation',description:'Print the approved artwork, arrange installation, and add clear evidence when it is in place.',action:'fulfillment'};
 }
 if(Number(c.open_issues??0)>0)return {key:'issue',title:'Campaign under review',description:'An open issue is holding settlement. Keep evidence and updates in your campaign conversation.',action:'support'};
 if(t<ns(terms.service_start_ns))return {key:'scheduled',title:'Ready to go live',description:'Installation evidence is recorded. The campaign starts on its published date.',action:'fulfillment'};
 if(t<ns(terms.service_end_ns))return {key:'running',title:'Campaign in progress',description:'Installation evidence is recorded and the campaign period is underway.',action:'fulfillment'};
 if(t<ns(s.refund_end_ns))return {key:'review',title:'Final review in progress',description:'The campaign period has ended. Earnings become available after the issue-review window and settlement.',action:'fulfillment'};
 return {key:'settling',title:'Ready for settlement',description:'The service and review periods are complete. Earnings become available when settlement is confirmed.',action:'earnings'};
}
export function ownerTotals(snapshots,wallet){
 const result={booked:0,completed:0,available:0n,held:0n,earned:0n};
 for(const item of snapshots){if(item.state.seller_id!==wallet)continue;
  if(item.state.holder&&item.state.outcome==='open')result.booked++;
  result.available+=money(item.credits?.[wallet]?.available);
  if(item.state.outcome==='open')result.held+=money(item.state.potential_seller_revenue);
  if(item.state.outcome==='success'){result.completed++;result.earned+=money(item.state.potential_seller_revenue);}
 }
 return {...result,available:result.available.toString(),held:result.held.toString(),earned:result.earned.toString()};
}
export function ownerCanUploadProof(snapshot,now){
 return snapshot?.state.outcome==='open'&&snapshot.state.artwork_locked&&!snapshot.campaign.delivery_proof&&BigInt(Math.trunc(now))*1000000n<=ns(snapshot.campaign.terms?.service_end_ns,snapshot.state.refund_end_ns?ns(snapshot.state.refund_end_ns):0n);
}
