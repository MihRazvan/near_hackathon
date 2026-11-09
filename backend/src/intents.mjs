import { randomBytes } from 'node:crypto';
import { recoverMessageAddress } from 'viem';
import { baseEncode } from 'near-api-js';
import { assert, uint, hashObject, walletId, canonical } from './core.mjs';

export function freshNonce() {
  let bytes;
  do { bytes=randomBytes(32); } while(bytes.subarray(0,4).equals(Buffer.from([86,40,246,198])));
  return bytes.toString('base64');
}

export function intentPlan({signerId,verifier,intents,now=Date.now(),expiresMs=now+120000,nonce=freshNonce(),context={}}) {
  const signer=walletId(signerId);
  const bytes=Buffer.from(nonce,'base64');
  assert(bytes.length===32&&bytes.toString('base64')===nonce&&!bytes.subarray(0,4).equals(Buffer.from([86,40,246,198])),'INVALID_NONCE','Canonical fresh legacy nonce required',400);
  assert(Number.isSafeInteger(expiresMs)&&expiresMs>now&&expiresMs<=now+300000,'INVALID_DEADLINE','Intent must expire within five minutes',400);
  assert(Array.isArray(intents)&&intents.length===1,'INVALID_INTENT','One scoped intent required',400);
  const payload={signer_id:signer,verifying_contract:verifier,deadline:new Date(expiresMs).toISOString(),nonce,intents};
  const message=JSON.stringify(payload);
  const plan={schema:'everywhere-intent/v1',signerId:signer,verifier,createdAt:new Date(now).toISOString(),expiresAt:payload.deadline,
    payload,message,context};
  return {...plan,planId:hashObject(plan)};
}

export function validateIntentPlan(plan,{now=Date.now()}={}) {
  const {planId,...body}=plan??{};
  assert(typeof planId==='string'&&hashObject(body)===planId,'PLAN_CHANGED','Intent differs from its committed plan');
  let messagePayload;try{messagePayload=JSON.parse(plan.message);}catch{}
  assert(messagePayload&&canonical(messagePayload)===canonical(plan.payload)&&plan.signerId===plan.payload.signer_id
    &&plan.verifier===plan.payload.verifying_contract,'PLAN_CHANGED','Intent signer, verifier or serialization changed');
  assert(Date.parse(plan.expiresAt)>now&&plan.expiresAt===plan.payload.deadline,'EXPIRED_INTENT','Intent has expired');
  const created=Date.parse(plan.createdAt);
  assert(created<=now+5000&&Date.parse(plan.expiresAt)-created<=300000,'INVALID_DEADLINE','Intent validity is not bounded');
  return plan;
}

export function purchasePlan({snapshot,buyerId,invoiceId,asset,now=Date.now()}) {
  const buyer=walletId(buyerId),state=snapshot.state,terms=snapshot.campaign?.terms;
  assert(snapshot.qualified===true&&terms&&state&&snapshot.accountId,'UNQUALIFIED_CAMPAIGN','A verified dated campaign is required');
  assert(asset===state.intents_token_id,'ASSET_CHANGED','Purchase asset must match campaign');
  assert(snapshot.observedAt&&now-Date.parse(snapshot.observedAt)<=30000&&Date.parse(snapshot.observedAt)<=now+5000,'STALE_SNAPSHOT','Refresh the campaign before signing');
  assert(state.outcome==='open'&&BigInt(terms.bidding_close_ns)>BigInt(now)*1000000n,'BIDDING_CLOSED','Bidding has closed');
  assert(!state.holder||terms.takeover_enabled,'FIXED_SPOT_BOOKED','This fixed-price spot is already booked');
  assert(state.holder?.account_id!==buyer,'ALREADY_HELD','The selected wallet already holds this placement');
  assert(typeof invoiceId==='string'&&invoiceId.length>0&&Buffer.byteLength(invoiceId)<=64,'INVALID_INVOICE','Invoice id required',400);
  const amount=uint(state.next_price).toString();
  assert(amount!=='0'&&BigInt(amount)%10000n===0n,'INVALID_PRICE','Placement price must be whole cents');
  const message=JSON.stringify({invoice_id:invoiceId,expected_round:state.round,published_terms_sha256:terms.published_terms_sha256});
  const expiresMs=Math.min(now+120000,Number(BigInt(terms.bidding_close_ns)/1000000n)-5000);
  return intentPlan({signerId:buyer,verifier:state.intents_contract_id,now,expiresMs,
    intents:[{intent:'transfer',receiver_id:snapshot.accountId,tokens:{[asset]:amount},msg:message,min_gas:'100000000000000'}],
    context:{kind:'purchase',contractId:snapshot.accountId,codeHash:snapshot.codeHash,invoiceId,expectedRound:state.round,
      amount,publishedTermsHash:terms.published_terms_sha256}});
}

export function nominationPlan({snapshot,buyerId,recipientId,now=Date.now()}) {
  const payer=walletId(buyerId),recipient=walletId(recipientId);
  assert(!recipient.startsWith('0x'),'NATIVE_RECIPIENT_REQUIRED','Choose a native NEAR account for the placement NFT',400);
  assert(snapshot.state.holder?.account_id===payer,'FINAL_HOLDER_REQUIRED','Only the final payer can nominate a recipient',403);
  assert(BigInt(snapshot.state.cutoff_ns)<=BigInt(now)*1000000n&&snapshot.state.outcome!=='failure'&&!snapshot.state.nft_minted,'NOMINATION_CLOSED','Final recipient nomination is unavailable');
  return intentPlan({signerId:payer,verifier:snapshot.state.intents_contract_id,now,
    intents:[{intent:'auth_call',contract_id:snapshot.accountId,msg:JSON.stringify({action:'nominate_nft_recipient',recipient_id:recipient}),min_gas:'100000000000000'}],
    context:{kind:'nominate',contractId:snapshot.accountId,recipientId:recipient,codeHash:snapshot.codeHash}});
}

export function withdrawalPlan({signerId,verifier,token,recipientId,amount,now=Date.now()}) {
  const recipient=walletId(recipientId);assert(!recipient.startsWith('0x'),'NATIVE_RECIPIENT_REQUIRED','Native USDC receiver must be a NEAR account',400);
  assert(uint(amount)>0n,'ZERO_WITHDRAWAL','Withdrawal must be positive',400);
  return intentPlan({signerId,verifier,now,intents:[{intent:'ft_withdraw',token,receiver_id:recipient,amount,min_gas:'50000000000000'}],
    context:{kind:'withdraw',token,recipientId:recipient,amount}});
}

export async function signedErc191(plan,signature,{now=Date.now()}={}) {
  validateIntentPlan(plan,{now});
  assert(/^0x[0-9a-f]{40}$/.test(plan.signerId),'EVM_SIGNER_REQUIRED','EVM Intents signer required');
  assert(typeof signature==='string'&&/^0x[0-9a-f]{130}$/i.test(signature),'INVALID_SIGNATURE','65-byte wallet signature required',400);
  const bytes=Buffer.from(signature.slice(2),'hex');let recovery=bytes[64];if(recovery===27||recovery===28)recovery-=27;
  assert(recovery===0||recovery===1,'INVALID_SIGNATURE','Invalid signature recovery byte',400);
  const r=BigInt('0x'+bytes.subarray(0,32).toString('hex')),s=BigInt('0x'+bytes.subarray(32,64).toString('hex'));
  const order=0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
  assert(r>0n&&r<order&&s>0n&&s<=order/2n,'INVALID_SIGNATURE','Canonical secp256k1 signature required',400);
  bytes[64]=recovery;
  const ethereum='0x'+bytes.subarray(0,64).toString('hex')+(recovery+27).toString(16);
  let recovered;try{recovered=await recoverMessageAddress({message:plan.message,signature:ethereum});}catch{}
  assert(recovered?.toLowerCase()===plan.signerId,'WRONG_SIGNER','Intent was not signed by its payer',401);
  return {standard:'erc191',payload:plan.message,signature:'secp256k1:'+baseEncode(bytes)};
}
