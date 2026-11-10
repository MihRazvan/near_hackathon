import test from 'node:test';
import assert from 'node:assert/strict';
import { walletCsp } from '../src/wallet-csp.mjs';
const directives=nonce=>new Map(walletCsp(nonce).split(';').map(s=>s.trim().split(/\s+/)).filter(s=>s[0]).map(([name,...sources])=>[name,sources]));
test('Meteor bridge and its iframe resources are allowed without opening arbitrary WebSocket hosts',()=>{
 const policy=directives('testnonce');
 assert.ok(policy.get('connect-src').includes('wss://mc.meteorwallet.app'));
 assert.equal(policy.get('connect-src').includes('wss:'),false);
 assert.ok(policy.get('font-src').includes('data:'));
 assert.ok(policy.get('style-src').includes('https://rsms.me'));
 assert.ok(policy.get('style-src').includes('https://fonts.cdnfonts.com'));
 assert.ok(policy.get('img-src').includes('https://meteorwallet.app'));
});
test('wallet compatibility retains nonce-based scripts and page embedding restrictions',()=>{
 const policy=directives('freshNonce123');
 assert.deepEqual(policy.get('script-src'),["'self'","'nonce-freshNonce123'"]);
 for(const name of ['object-src','frame-ancestors'])assert.deepEqual(policy.get(name),["'none'"]);
 assert.deepEqual(policy.get('base-uri'),["'none'"]);
});
