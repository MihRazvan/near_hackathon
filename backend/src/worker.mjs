import { randomUUID } from 'node:crypto';
// Reconciliation only. This worker has no path to prepare, sign, broadcast, retry or finalize a transaction.
export function reconciliationWorker({store,near,source,marketplace,nativeActions,walletRequests,intentOutcomes,intervalMs=10000,now=Date.now,bookingIntervalMs=60000,bookingBatchSize=5}){
 let running=false,stopped=false;const spacing=Math.max(60000,bookingIntervalMs),batchSize=Math.max(1,Math.min(5,bookingBatchSize));
 const owner='reconciliation-worker';
 function claim(contractId,urgent,bookingIds){
  return store.transaction(()=>{
   const previous=store.get('booking-reconciliation',contractId),time=now();
   if(urgent)urgent=bookingIds.some(id=>{const b=store.get('booking',id);return b?.contractId===contractId&&b.status==='submitted'&&b.operationId&&['confirmed','failed'].includes(store.operation(b.operationId)?.phase);});
   if(previous?.leaseUntil>time||previous?.nextAt>time&&(!urgent||previous.failures>0))return null;
   const lease=randomUUID(),value={nextAt:time+spacing,leaseUntil:time+120000,lease,failures:previous?.failures??0};
   if(previous)store.update('booking-reconciliation',contractId,owner,previous.version,value);else store.insert('booking-reconciliation',contractId,owner,value);
   const cursor=store.get('booking-reconciliation-cursor','status');if(cursor)store.update('booking-reconciliation-cursor','status',owner,cursor.version,{contractId});else store.insert('booking-reconciliation-cursor','status',owner,{contractId});
   return lease;
  });
 }
 function finish(contractId,lease,failed){
  store.transaction(()=>{
   const row=store.get('booking-reconciliation',contractId);if(row?.lease!==lease)return;
   const failures=failed?Math.min((row.failures??0)+1,4):0;
   store.update('booking-reconciliation',contractId,owner,row.version,{nextAt:now()+Math.min(900000,spacing*2**failures),leaseUntil:0,lease:null,failures,lastCheckedAt:now()});
  });
 }
 function rotate(groups){
  const cursor=store.get('booking-reconciliation-cursor','status')?.contractId,keys=[...groups.keys()].sort();
  if(!cursor)return keys;const next=keys.findIndex(key=>key>cursor);return next<0?keys:[...keys.slice(next),...keys.slice(0,next)];
 }
 async function reconcileBookings(){
  const rows=store.list('booking').filter(b=>['submitted','accepted','outbid'].includes(b.status)&&!['success','failure'].includes(b.statusOutcome));
  // Compatibility for isolated worker tests and integrations without grouping.
  if(!marketplace.syncBookingGroup){let failures=0;for(const b of rows.filter(b=>b.status==='submitted').slice(0,20)){try{await marketplace.syncBooking(b.id);}catch{failures++;}}return failures;}
  const groups=new Map();for(const row of rows){if(!row.contractId)continue;if(!groups.has(row.contractId))groups.set(row.contractId,[]);groups.get(row.contractId).push(row);}
  const urgent=new Set(rows.filter(b=>b.status==='submitted'&&b.operationId&&['confirmed','failed'].includes(store.operation(b.operationId)?.phase)).map(b=>b.contractId));
  const order=rotate(groups),ordered=[...order.filter(id=>urgent.has(id)),...order.filter(id=>!urgent.has(id))];let count=0,failures=0;
  for(const contractId of ordered){
   if(stopped||count>=batchSize)break;const lease=claim(contractId,urgent.has(contractId),groups.get(contractId).map(b=>b.id));if(!lease)continue;count++;
   let failed=false;try{await marketplace.syncBookingGroup(contractId,groups.get(contractId).map(b=>b.id));}catch{failed=true;failures++;}finally{finish(contractId,lease,failed);}
  }
  return failures;
 }
 async function tick(){
  if(running||stopped)return;running=true;let checked=0,unavailable=0;
  try{
   const pending=store.db.prepare("SELECT id,kind FROM operations WHERE phase IN ('signed','broadcast','broadcast-unknown') ORDER BY created_at LIMIT 20").all();
   for(const op of pending){try{if(op.kind==='near')await near.reconcile(op.id);if(op.kind==='base-fund')await source.reconcile(op.id);checked++;}catch{unavailable++;}}
   if(intentOutcomes)for(const record of store.list('intent')){const op=store.operation(record.operationId??'relay-'+record.plan.planId);if(op&&['confirmed','failed'].includes(op.phase)){try{intentOutcomes(record.id,op);}catch{unavailable++;}}}
   // Original transaction and wallet recovery takes precedence over historical
   // placement status. None of these reads can dispatch another payment.
   for(const plan of store.list('native-plan').filter(p=>p.transactionHash&&p.status==='submitted').slice(0,20)){try{await nativeActions.confirm(plan.owner,plan.id,plan.transactionHash);}catch{unavailable++;}}
   if(walletRequests)for(const request of store.list('wallet-request').filter(r=>r.status==='submitted').slice(0,20)){
    try{await walletRequests.reconcile(request.owner,request.id);}catch{unavailable++;}
   }
   unavailable+=await reconcileBookings();return {checked,unavailable};
  }finally{running=false;}
 }
 const timer=setInterval(()=>void tick(),intervalMs);timer.unref();
 return {tick,stop(){stopped=true;clearInterval(timer);},isRunning:()=>running};
}
