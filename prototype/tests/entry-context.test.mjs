import test from 'node:test';
import assert from 'node:assert/strict';
import {entryHref,walletPurpose} from '../src/integration/entry-context.mjs';
import {siteHeader} from '../src/shell.mjs';
test('wallet entry retains the exact photo, prompt or selected purchase destination without an extra account gate',()=>{
 for(const path of ['/host/assets/new?mode=photo','/host/assets/new?mode=describe','/checkout/sale?spot=door&campaign=brand']){
  const result=entryHref(path,null);assert.equal(new URL(result,'https://example.test').searchParams.get('next'),path);assert.equal(entryHref(path,{wallet:'owner.near'}),path);
 }
 assert.match(siteHeader(),/\/sign-in\?next=%2Fhost%2Fassets%2Fnew/);
});
test('contextual wallet explanations describe the task without implying sign-in authorizes a payment',()=>{
 const listing=walletPurpose('/host/assets/new?mode=photo'),buying=walletPurpose('/checkout/sale?spot=door');
 assert.match(listing.description,/private vehicle draft/);assert.match(listing.description,/No payment/);assert.match(buying.description,/exact price/);assert.match(buying.description,/does not move money/);
 assert.equal(walletPurpose('https://untrusted.test/<script>').kind,'account');
});
