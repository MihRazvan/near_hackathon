import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {originalRetryAvailable,verifyOriginalIntent} from '../src/integration/recovery-state.mjs';
const request={kind:'intent',status:'failed',errorCode:'RPC_UNAVAILABLE',canRetryOriginal:true,planId:'original-plan'};
test('retry UI requires explicit backend prebroadcast eligibility and excludes unknown or submitted transfers',()=>{
 assert.equal(originalRetryAvailable(request),true);
 for(const changed of [{canRetryOriginal:false},{canRetryOriginal:undefined},{errorCode:'PRICE_CHANGED'},{status:'submitted'},{status:'authorizing'},{status:'confirmed'},{transactionHash:'original-hash'},{kind:'native'}])assert.equal(originalRetryAvailable({...request,...changed}),false);
});
test('recovery verifies the exact original plan, nonce and signed message before requesting another signature',async()=>{
 const plan={planId:'original-plan',payload:{nonce:'unchanged-original-nonce'},message:'the exact original signing message'},recovery={...request,originalNonce:plan.payload.nonce,originalMessageHash:createHash('sha256').update(plan.message).digest('hex')};
 assert.equal(await verifyOriginalIntent(plan,recovery,{cryptoImpl:webcrypto}),plan);
 for(const changed of [{planId:'replacement-plan'},{payload:{nonce:'new-nonce'}},{message:plan.message+' '}])await assert.rejects(verifyOriginalIntent({...plan,...changed},recovery,{cryptoImpl:webcrypto}));
});
