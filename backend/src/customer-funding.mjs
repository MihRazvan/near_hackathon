import {assert,uint} from './core.mjs';

// External customers spend their own wallet balance. Their reviewed funding requests
// retain exact accounting without consuming the operator's development-money budget.
export function reserveCustomerFunding({store,budget,config,id,scope,plan,amounts}){
 assert(uint(amounts.sourceUsdc)>0n&&uint(amounts.sourceUsdc)<=uint(config.customerRouteMax??'1000000000'),'INPUT_CAP','Funding exceeds the customer route limit');
 assert(uint(amounts.baseGas)>0n&&uint(amounts.baseGas)<=uint(config.customerGasMax??'5000000000000000'),'GAS_CAP','Wallet gas reserve exceeds the customer route limit');
 const result=budget.reserve({id,kind:'base-fund',scope,plan,amounts:{},transactionOpen:true});
 if(result.dispatchAllowed)store.insert('customer-funding-budget',id,scope,{status:'reserved',reserved:amounts});
 return result;
}
export function releaseCustomerFunding(store,op){
 const record=store.get('customer-funding-budget',op.id);if(!record)return;
 assert(record.owner===op.scope&&record.status==='reserved','BUDGET_CHANGED','Customer funding reservation differs');
 store.update('customer-funding-budget',op.id,op.scope,record.version,{...record,status:'released'});
}
export function settleCustomerFunding(store,op,actual,evidence){
 assert(evidence?.final===true&&evidence.transactionHash===op.transaction_hash,'FINAL_EVIDENCE_REQUIRED','Final original transaction evidence is required');
 return store.transaction(()=>{
  const record=store.get('customer-funding-budget',op.id);
  assert(record?.owner===op.scope&&['reserved','settled'].includes(record.status),'INVALID_BUDGET','Customer funding reservation not found');
  for(const key of ['sourceUsdc','baseGas']){
   assert(uint(actual[key])<=uint(record.reserved[key]),'RESERVATION_EXCEEDED','Actual wallet spend exceeds its original reviewed reservation');
   if(record.status==='settled')assert(record.actual[key]===actual[key],'BUDGET_CHANGED','Final customer accounting cannot change');
  }
  if(record.status==='settled')return record;
  return store.update('customer-funding-budget',op.id,op.scope,record.version,{...record,status:'settled',actual,evidence});
 });
}
