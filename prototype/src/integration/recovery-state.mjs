export const originalRetryAvailable=request=>request?.canRetryOriginal===true&&request.kind==='intent'&&request.status==='failed'&&request.errorCode==='RPC_UNAVAILABLE'&&!request.transactionHash;
export async function verifyOriginalIntent(plan,recovery,{cryptoImpl=globalThis.crypto}={}){
 if(plan?.planId!==recovery?.planId)throw new Error('The original payment plan changed. Recover its original request before continuing.');
 if(recovery.originalNonce&&plan.payload?.nonce!==recovery.originalNonce)throw new Error('The original payment nonce changed. No signature was requested.');
 if(recovery.originalMessageHash){
  const digest=await cryptoImpl.subtle.digest('SHA-256',new TextEncoder().encode(plan.message));
  const hash=[...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');
  if(hash!==recovery.originalMessageHash)throw new Error('The original signed payment message changed. No signature was requested.');
 }
 return plan;
}
