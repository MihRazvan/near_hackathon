// A targeted response replaces authority for its exact placements, including
// removing a former controller's forms/messages. Other known placements survive.
export function mergeScopedWorkspace(previous,data,catalog){
 const scope=new Set(data.scopedContracts),same=previous?.wallet===data.wallet;
 const merge=(oldRows,newRows,key,contract)=>{
  const rows=[...(oldRows??[]).filter(row=>!scope.has(contract(row))),...(newRows??[])];
  return [...new Map(rows.map(row=>[key(row),row])).values()];
 };
 const allowed=new Set(data.sales.flatMap(s=>s.spots.map(p=>p.contractId)));
 return {...data,chainPending:!same||previous.chainPending!==false,
  snapshots:merge(catalog?.snapshots,data.snapshots,s=>s.accountId,s=>s.accountId).filter(s=>allowed.has(s.accountId)),
  unavailable:merge(catalog?.unavailable,data.unavailable,s=>s.contractId,s=>s.contractId),
  placements:merge(same?previous.placements:[],data.placements,s=>s.accountId,s=>s.accountId),
  issues:merge(same?previous.issues:[],data.issues,s=>s.id,s=>s.contractId),
  placementMessages:merge(same?previous.placementMessages:[],data.placementMessages,s=>s.id,s=>s.contractId)};
}
export function affectedContracts(data,requests,sales){
 const published=new Set((sales??[]).flatMap(s=>s.spots.map(p=>p.contractId))),ids=new Set();
 for(const request of requests){
  const record=[...(data?.intents??[]),...(data?.nativePlans??[]),...(data?.publicationPlans??[])].find(p=>p.id===request.planId);
  for(const id of [record?.context?.contractId,record?.plan?.context?.contractId,record?.plan?.contractId,record?.plan?.offerId,...(data?.dashboard?.bookings??[]).filter(b=>b.planId===request.planId||b.nativePlanId===request.planId).map(b=>b.contractId)])if(published.has(id))ids.add(id);
 }
 return [...ids];
}
