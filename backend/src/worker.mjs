// Reconciliation only. This worker has no path to prepare, sign, broadcast, retry or finalize a transaction.
export function reconciliationWorker({store,near,source,marketplace,nativeActions,intervalMs=10000}){
 let running=false,stopped=false;
 async function tick(){
  if(running||stopped)return;running=true;let checked=0,unavailable=0;
  try{
   const pending=store.db.prepare("SELECT id,kind FROM operations WHERE phase IN ('signed','broadcast','broadcast-unknown') ORDER BY created_at LIMIT 20").all();
   for(const op of pending){try{if(op.kind==='near')await near.reconcile(op.id);if(op.kind==='base-fund')await source.reconcile(op.id);checked++;}catch{unavailable++;}}
   for(const booking of store.list('booking').filter(b=>['submitted','accepted','outbid'].includes(b.status))){try{await marketplace.syncBooking(booking.id);}catch{unavailable++;}}
   for(const plan of store.list('native-plan').filter(p=>p.transactionHash&&p.status==='submitted')){try{await nativeActions.confirm(plan.owner,plan.id,plan.transactionHash);}catch{unavailable++;}}
   return {checked,unavailable};
  }finally{running=false;}
 }
 const timer=setInterval(()=>void tick(),intervalMs);timer.unref();
 return {tick,stop(){stopped=true;clearInterval(timer);},isRunning:()=>running};
}
