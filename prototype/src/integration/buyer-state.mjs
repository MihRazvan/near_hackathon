// Shared display decisions use the same finalized snapshots as checkout.
export const micro = value => {try{return BigInt(value??0);}catch{return 0n;}};
export const millis = value => {try{return Number(BigInt(value)/1000000n);}catch{return null;}};
export function listingAvailability(spot,snapshot,now=Date.now()){
 if(!snapshot?.state)return {kind:'checking',available:false,price:null};
 const state=snapshot.state,cutoff=millis(state.cutoff_ns),price=micro(state.next_price);
 if(state.outcome==='failure')return {kind:'cancelled',available:false,price:null};
 if(state.outcome!=='open')return {kind:'completed',available:false,price:null};
 if(cutoff===null)return {kind:'checking',available:false,price:null};
 if(cutoff<=now)return {kind:'closed',available:false,price:null};
 if(state.holder&&!spot.takeoverEnabled)return {kind:'booked',available:false,price:null};
 if(price<=0n)return {kind:'checking',available:false,price:null};
 return {kind:state.holder?'takeover':'available',available:true,price:price.toString(),cutoff};
}
export function bookingStatus(booking,snapshot){
 if(!booking.accepted)return booking.status;
 if(snapshot?.state.outcome==='failure')return 'cancelled';
 if(snapshot?.state.holder?.account_id&&snapshot.state.holder.account_id!==booking.owner)return 'outbid';
 if(snapshot?.state.outcome==='success')return 'completed';
 return 'accepted';
}
export function latestWalletRequest(requests,planIds){
 const ids=new Set(planIds.filter(Boolean));
 return [...(requests??[])].filter(r=>ids.has(r.planId)).sort((a,b)=>(Date.parse(a.createdAt)||0)-(Date.parse(b.createdAt)||0)).at(-1);
}
export function paymentState(booking,request,expiresAt,now=Date.now()){
 if(booking.accepted)return 'confirmed';
 if(['failed','rejected','cancelled-before-send','expired'].includes(booking.status))return 'retry';
 if(request&&!['failed','rejected'].includes(request.status))return 'pending';
 if(booking.status!=='prepared')return 'pending';
 if(expiresAt&&Date.parse(expiresAt)<=now)return 'expired';
 return 'ready';
}
export function creditSnapshots(snapshots,wallet){
 return (snapshots??[]).filter(s=>micro(s.credits?.[wallet]?.available)>0n||micro(s.credits?.[wallet]?.conditional_bonus)>0n);
}
export function placementProgress(snapshot,wallet,now=Date.now(),{automaticReceipt=false}={}){
 const {state,rights,campaign}=snapshot,current=state.holder?.account_id===wallet,controller=(rights.artwork_controller_id??rights.current_owner_id)===wallet,nominee=state.nominated_recipient===wallet;
 if(state.outcome==='failure')return {key:'cancelled',title:'This campaign was cancelled.',text:'Any refundable payment is available to the wallet that paid for it.'};
 if(!current&&!controller&&!nominee)return {key:'outbid',title:'Another advertiser took over this spot.',text:'Your original payment and any earned takeover reward stay with your wallet.'};
 if(state.outcome==='success')return {key:'completed',title:'Your campaign is complete.',text:'The owner has completed delivery and the campaign has settled.'};
 if(!rights.bidding_closed)return {key:'reserved',title:'Your spot is booked.',text:'You can prepare your creative now. Final artwork control is assigned when booking closes.'};
 if(!state.nft_minted){
  if(automaticReceipt&&current){
   const due=millis(campaign.terms?.artwork_due_ns);
   return due!==null&&now>=due?{key:'artwork-closed',title:'The artwork deadline has passed.',text:'Contact the owner about this campaign. New artwork can no longer be submitted.'}:{key:'artwork',title:'Send your artwork.',text:'Your final placement receipt is handled automatically. Upload your design or enter the ad copy for the owner to review.'};
  }
  if(nominee&&!state.nomination_accepted)return {key:'accept',title:'Accept your placement.',text:'Confirm this account will manage the artwork for this campaign.'};
  if((current&&!wallet.startsWith('0x'))||(nominee&&state.nomination_accepted))return {key:'mint',title:'Activate your placement.',text:'Create the final placement record so you can send your artwork.'};
  if(current&&!state.nominated_recipient)return {key:'nominate',title:'Choose where to manage your artwork.',text:'Connect a NEAR account you control to receive the final placement right.'};
  return {key:'await-controller',title:'Waiting for placement activation.',text:'The account you nominated needs to accept and activate the placement.'};
 }
 if(!state.artwork_locked){
  if(!rights.active)return {key:'artwork-closed',title:'The artwork deadline has passed.',text:'Contact the owner about this campaign. New artwork can no longer be submitted.'};
  if(rights.proposal)return {key:'artwork-review',title:'Your artwork is with the owner.',text:'The owner will review this revision before printing. You can send an update while submissions are open.'};
  return {key:controller?'artwork':'await-artwork',title:controller?'Send your artwork.':'Waiting for artwork.',text:controller?'Upload your design or enter the ad copy for the owner to review.':'The account controlling the placement can now send the artwork.'};
 }
 if(!campaign.delivery_proof)return {key:'installation',title:'Your artwork is approved.',text:'The owner is arranging printing and installation. Delivery evidence will appear here.'};
 const start=millis(campaign.terms?.service_start_ns),end=millis(campaign.terms?.service_end_ns),review=millis(state.refund_end_ns);
 if(start!==null&&now<start)return {key:'scheduled',title:'Your installation has been submitted.',text:'Your campaign is scheduled to begin at the agreed start time.'};
 if(end!==null&&now<end)return {key:'running',title:'Your campaign is in its scheduled service period.',text:'Installation evidence is available below. Contact the owner if anything needs attention.'};
 if(review!==null&&now<review)return {key:'review',title:'Your campaign is in its review window.',text:'Review the installation evidence and report any issue before the review deadline.'};
 return {key:'settlement',title:'The campaign is ready for final review.',text:'The campaign reviewer will resolve any remaining issues and confirm the outcome.'};
}
