import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.mjs';
import { Budget } from '../src/budget.mjs';
import { productionKeeper } from '../src/keeper.mjs';

const OFFER = 'offer-' + 'a'.repeat(32);
function fixture({ path, batchSize = 5, patch = {} } = {}) {
  const store = new Store(path), budget = new Budget(store, { sourceUsdc: '1', baseGas: '1', nearFees: '1', nearAllocation: '1', nearAllocationGross: '1' });
  const config = { production: true, enabled: true, keeperEnabled: true, network: 'mainnet', hub: { accountId: 'market.near', codeHash: 'pinned-hub-code' }, treasury: 'relay.near', ...patch };
  let clock = 1000000, dispatchPhase = 'confirmed', reads = 0, reconciliations = 0, snapshots;
  const calls = [];
  function addOffer(id = OFFER, { status = 'published', mode = 'hub' } = {}) {
    const saleId = 'sale-' + id, owner = 'owner.near', spotId = 'door';
    const terms = { sale_id: saleId, spot_id: spotId, service_end_ns: '150' };
    const spot = { id: spotId, contractId: id, mode, offerId: id, hubId: config.hub.accountId, codeHash: config.hub.codeHash };
    store.insert('sale', saleId, owner, { status, spots: [spot], publication: { manifest: { saleId, sellerId: owner }, terms: [terms] } });
    store.insert('spot-index', id, owner, { saleId, spotId });
    store.insert('deployment', id, owner, { mode, offerId: id, hubId: config.hub.accountId, codeHash: config.hub.codeHash, terms, arbiterId: 'arbiter.near' });
    const snapshot = { qualified: true, mode, accountId: id, offerId: id, receiverId: config.hub.accountId, codeHash: config.hub.codeHash, blockTimestampNs: '300', blockHash:'1'.repeat(32),blockHeight:42, state: { offer_id: id, receiver_id: config.hub.accountId, seller_id: owner, arbiter_id: 'arbiter.near', outcome: 'open', holder: { account_id: 'buyer.near' }, nft_minted: false, artwork_locked: true, cutoff_ns: '100', refund_end_ns: '200' }, campaign: { terms, delivery_proof: { artifact_uri: 'ipfs://proof' }, open_issues: 0 } };
    snapshots ??= new Map(); snapshots.set(id, snapshot); return snapshot;
  }
  const snapshot = addOffer();
  const chain = {
    snapshot: async id => { reads++; return snapshots.get(id); },
    treasurySigner: async () => ({ fixedRelayer: true }),
    call: async call => {
      calls.push(call);
      const plan = { network: config.network, signerId: call.signerId, receiverId: call.receiverId, expectedReceiverCodeHash: call.codeHash, actions: [{ type: 'call', method: call.method, args: call.args, gas: call.gas, deposit: call.deposit }] };
      budget.reserve({ id: call.id, kind: 'near', scope: call.signerId, plan, amounts: {} });
      return store.transition(call.id, ['reserved'], dispatchPhase, { transactionHash: 'original-' + calls.length, result: { final: dispatchPhase === 'confirmed' || dispatchPhase === 'failed' } });
    },
    near: { reconcile: async id => { reconciliations++; return store.operation(id); }, execute: () => assert.fail('keeper must use the qualified chain call') },
  };
  const make = () => productionKeeper({ store, chain, config, now: () => clock, intervalMs: 10000, batchSize });
  const workers = [], keeper = make(); workers.push(keeper);
  return { store, config, snapshot, chain, calls, keeper, addOffer, restart() { keeper.stop(); const next = make(); workers.push(next); return next; }, advance(ms = 10000) { clock += ms; }, dispatch(phase) { dispatchPhase = phase; }, get reads() { return reads; }, get reconciliations() { return reconciliations; }, close() { workers.forEach(w => w.stop()); store.close(); } };
}

test('keeper defaults disabled and requires a pinned mainnet fixed relayer when explicitly enabled', async () => {
  const f = fixture({ patch: { keeperEnabled: undefined } });
  try { assert.equal(f.keeper.enabled, false); assert.equal(await f.keeper.tick(), undefined); assert.equal(f.reads, 0); assert.equal(f.calls.length, 0); }
  finally { f.close(); }
  const store = new Store();
  try { assert.throws(() => productionKeeper({ store, chain: {}, config: { production: true, enabled: true, keeperEnabled: true, network: 'testnet' } }), /pinned mainnet/); }
  finally { store.close(); }
});

test('keeper batches share one finalized block, renew slow reads and never reuse a block across ticks', async () => {
  const f = fixture(), seen = []; let blocks = 0;
  f.snapshot.state.nft_minted = true; f.snapshot.state.artwork_locked = false;
  const second = f.addOffer('offer-' + 'b'.repeat(32)); second.state.nft_minted = true; second.state.artwork_locked = false;
  const original = f.chain.snapshot;
  f.chain.reads = { block: async options => { assert.equal(options.priority, 'background'); return { header: { hash: String(++blocks) } }; } };
  let slow = false;
  f.chain.snapshot = async (id, wallets, options) => {
    assert.equal(options.priority, 'background'); assert.deepEqual(wallets, []); seen.push(options.block.header.hash);
    if (slow) f.advance(21000);
    return original(id, wallets, options);
  };
  try {
    await f.keeper.tick(); assert.equal(blocks, 1); assert.deepEqual(seen, ['1', '1']); assert.equal(f.calls.length, 0);
    f.advance(); await f.keeper.tick(); assert.equal(blocks, 2); assert.deepEqual(seen.slice(2), ['2', '2']);
    f.advance(); slow = true; await f.keeper.tick(); assert.equal(blocks, 4); assert.deepEqual(seen.slice(4), ['3', '4']); assert.equal(f.calls.length, 0);
  } finally { f.close(); }
});

test('mint uses the original bounded zero-deposit call and a qualified finalized chain clock', async () => {
  const f = fixture();
  try {
    f.snapshot.blockTimestampNs = '99'; await f.keeper.tick(); assert.equal(f.calls.length, 0);
    f.advance(); f.snapshot.blockTimestampNs = '100'; await f.keeper.tick();
    assert.equal(f.calls.length, 1); const call = f.calls[0];
    assert.equal(call.method, 'mint_final_placement'); assert.equal(call.signerId, 'relay.near'); assert.equal(call.receiverId, 'market.near'); assert.equal(call.deposit, '0'); assert.equal(call.gas, '50000000000000'); assert.deepEqual(call.args, { offer_id: OFFER });
    f.advance(); await f.keeper.tick(); assert.equal(f.calls.length, 1, 'stale state cannot send a second mint');
  } finally { f.close(); }
});

test('automatic success requires ended service and review, locked artwork, proof and zero issues', async () => {
  const f = fixture(); f.snapshot.state.nft_minted = true;
  try {
    f.snapshot.blockTimestampNs = '199'; await f.keeper.tick(); assert.equal(f.calls.length, 0);
    f.advance(); f.snapshot.blockTimestampNs = '200'; f.snapshot.campaign.open_issues = 1; await f.keeper.tick(); assert.equal(f.calls.length, 0);
    f.advance(); f.snapshot.campaign.open_issues = 0; f.snapshot.state.artwork_locked = false; await f.keeper.tick(); assert.equal(f.calls.length, 0);
    f.advance(); f.snapshot.state.artwork_locked = true; const proof = f.snapshot.campaign.delivery_proof; f.snapshot.campaign.delivery_proof = null; await f.keeper.tick(); assert.equal(f.calls.length, 0);
    f.advance(); f.snapshot.campaign.delivery_proof = proof; await f.keeper.tick(); assert.equal(f.calls.length, 1); assert.equal(f.calls[0].method, 'finalize_success');
    assert.equal(f.calls.some(c => c.method === 'finalize_failure' || c.method === 'record_issue_decision' || c.method === 'release_credit'), false);
  } finally { f.close(); }
});

test('restart retains the original operation and unknown receipt never dispatches a new action', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'near-keeper-')), f = fixture({ path: join(folder, 'state.sqlite') });
  try {
    f.dispatch('broadcast-unknown'); await f.keeper.tick(); const original = f.calls[0].id;
    f.snapshot.state.nft_minted = true; const next = f.restart(); f.advance();
    assert.deepEqual(await next.tick(), { checked: 1, submitted: 0, reconciled: 1, unavailable: 0 });
    assert.equal(f.calls.length, 1); assert.equal(f.reconciliations, 1); assert.equal(f.store.operation(original).transaction_hash, 'original-1');
    f.advance(); await next.tick(); assert.equal(f.calls.length, 1); assert.equal(f.store.operation(original).phase, 'broadcast-unknown');
    f.store.transition(original, ['broadcast-unknown'], 'confirmed'); f.advance(); await next.tick();
    assert.equal(f.calls.length, 2); assert.equal(f.calls[1].method, 'finalize_success'); assert.notEqual(f.calls[1].id, original);
  } finally { f.close(); rmSync(folder, { recursive: true, force: true }); }
});

test('a finalized failed action is retained without automatic retry IDs or a busy loop', async () => {
  const f = fixture();
  try {
    f.dispatch('failed'); await f.keeper.tick(); assert.equal(f.calls.length, 1); const firstReads = f.reads;
    f.advance(); await f.keeper.tick(); assert.equal(f.reads, firstReads);
    f.advance(16 * 60000); await f.keeper.tick(); assert.equal(f.calls.length, 1); assert.equal(f.reads, firstReads + 1);
    assert.equal(f.store.list('keeper-offer')[0].phase, 'failed');
  } finally { f.close(); }
});

test('leases serialize worker instances and overlapping ticks, retaining a slow original operation', async () => {
  const f = fixture(); const other = productionKeeper({ store: f.store, chain: f.chain, config: f.config, now: () => 1000000, intervalMs: 10000 });
  let release; const gate = new Promise(resolve => { release = resolve; }), original = f.chain.snapshot;
  f.chain.snapshot = async id => { await gate; return original(id); };
  try {
    const first = f.keeper.tick(); assert.equal(f.keeper.isRunning(), true); assert.equal(await f.keeper.tick(), undefined); assert.equal(await other.tick(), undefined); assert.equal(f.calls.length, 0);
    release(); await first; assert.equal(f.calls.length, 1); assert.equal(f.keeper.isRunning(), false); assert.equal(f.store.list('keeper-lease').length, 0);
  } finally { release(); other.stop(); f.close(); }
});

test('unpublished, legacy, wrong-pin and missing original listing bindings never enter the signing path', async () => {
  for (const change of [
    f => { const r = f.store.list('sale')[0]; f.store.update('sale', r.id, r.owner, r.version, { ...r, status: 'draft' }); },
    f => { const r = f.store.get('deployment', OFFER); f.store.update('deployment', r.id, r.owner, r.version, { ...r, mode: 'legacy' }); },
    f => { f.snapshot.codeHash = 'another-code'; },
    f => { const r = f.store.get('spot-index', OFFER); f.store.update('spot-index', r.id, r.owner, r.version, { ...r, saleId: 'not-published' }); },
  ]) {
    const f = fixture();
    try { change(f); await f.keeper.tick(); assert.equal(f.calls.length, 0); } finally { f.close(); }
  }
});

test('bounded round-robin scanning visits later offers and skips a busy signer without polling it', async () => {
  const f = fixture({ batchSize: 1 });
  try {
    f.addOffer('offer-' + 'b'.repeat(32)); f.addOffer('offer-' + 'c'.repeat(32));
    for (let i = 0; i < 3; i++) { const result = await f.keeper.tick(); assert.equal(result.checked, 1); f.advance(); }
    assert.equal(f.calls.length, 3); assert.equal(new Set(f.calls.map(c => c.args.offer_id)).size, 3);
    f.snapshot.state.nft_minted = true; f.store.insert('near-lock', 'relay.near', 'relay.near', { operationId: 'another-original-request' });
    await f.keeper.tick(); assert.equal(f.calls.length, 3); assert.equal(f.reconciliations, 0);
  } finally { f.close(); }
});

test('RPC and budget failures back off durably without creating replacement operations', async () => {
  const f = fixture(); let attempted = 0;
  f.chain.call = async () => { attempted++; throw Object.assign(new Error('limit'), { code: 'BUDGET_EXCEEDED' }); };
  try {
    await f.keeper.tick(); const job = f.store.list('keeper-offer')[0]; assert.equal(job.lastErrorCode, 'BUDGET_EXCEEDED'); assert.equal(attempted, 1);
    f.advance(); await f.keeper.tick(); assert.equal(attempted, 1);
    f.advance(); await f.keeper.tick(); assert.equal(attempted, 2); assert.equal(f.store.list('keeper-offer')[0].operationId, job.operationId);
    f.advance(20000); await f.keeper.tick(); assert.equal(attempted, 2, 'second error doubles the durable cooldown');
    f.keeper.stop(); f.advance(60000); assert.equal(await f.keeper.tick(), undefined);
  } finally { f.close(); }
});

test('an expired or stopped reader cannot overwrite the new lease holder or dispatch after awaiting RPC', async () => {
  const f = fixture(); let release, firstRead = true;
  const gate = new Promise(resolve => { release = resolve; }), original = f.chain.snapshot;
  f.chain.snapshot = async id => { if (firstRead) { firstRead = false; await gate; } return original(id); };
  const other = productionKeeper({ store: f.store, chain: f.chain, config: f.config, now: () => 1180001, intervalMs: 10000 });
  try {
    const stale = f.keeper.tick(); f.advance(180001);
    await other.tick(); assert.equal(f.calls.length, 1);
    const originalJob = f.store.list('keeper-offer')[0];
    release(); await stale; assert.equal(f.calls.length, 1); assert.equal(f.store.list('keeper-offer')[0].version, originalJob.version);
  } finally { release(); other.stop(); f.close(); }
});

test('Sandbox keeper requires an explicit constructor proof and actual loopback test-chain status', async () => {
  const f = fixture({ patch: { network: 'sandbox' } });
  let statusReads = 0;
  f.chain.reads = { rpc: { endpoint: 'http://127.0.0.1:12345' }, status: async () => { statusReads++; return { chain_id: 'test-chain-isolated' }; } };
  const qualified = productionKeeper({ store: f.store, chain: f.chain, config: f.config, now: () => 1000000, sandboxQualification: async () => ({ chainId: 'test-chain-isolated' }) });
  try {
    assert.equal(f.keeper.enabled, false); await f.keeper.tick(); assert.equal(statusReads, 0);
    await qualified.tick(); assert.equal(statusReads, 1); assert.equal(f.calls.length, 1);
    f.chain.reads.rpc.endpoint = 'https://rpc.mainnet.near.org'; await assert.rejects(qualified.tick(), { code: 'SANDBOX_ONLY' }); assert.equal(f.calls.length, 1);
    f.chain.reads.rpc.endpoint = 'http://127.0.0.1:12345'; f.chain.reads.status = async () => ({ chain_id: 'mainnet' }); await assert.rejects(qualified.tick(), { code: 'SANDBOX_ONLY' });
  } finally { qualified.stop(); f.close(); }
});

function closedOffer(f, { outcome = 'success', sponsored = true, funder = 'cold-admin.near' } = {}) {
  Object.assign(f.snapshot.state, { outcome, nft_minted: true, total_received: '30000', total_withdrawn: '30000', total_pending: '0', storage_reclaimed: false, sponsored, storage_funder: funder });
}

test('closed zero-liability offers reclaim storage with an exact zero-deposit call for sponsor and native funders', async () => {
  for (const [sponsored, funder] of [[true, 'cold-admin.near'], [false, 'original-funder.near']]) {
    const f=fixture();
    try {
      closedOffer(f,{sponsored,funder});await f.keeper.tick();assert.equal(f.calls.length,1);
      const call=f.calls[0];assert.equal(call.method,'reclaim_storage_reserve');assert.equal(call.gas,'40000000000000');assert.equal(call.deposit,'0');assert.equal(call.signerId,'relay.near');assert.equal(call.receiverId,'market.near');assert.equal(call.codeHash,'pinned-hub-code');assert.deepEqual(call.args,{offer_id:OFFER});
      assert.equal(f.store.list('keeper-offer')[0].action,'reclaim-storage');
      f.advance();f.snapshot.state.storage_reclaimed=true;await f.keeper.tick();assert.equal(f.calls.length,1);
    } finally { f.close(); }
  }
});

test('pending withdrawals, remaining credits, open campaigns and already-reclaimed reserves cannot trigger storage recovery', async () => {
  for (const patch of [{total_pending:'1'}, {total_withdrawn:'29999'}, {outcome:'open'}, {storage_reclaimed:true}]) {
    const f=fixture();
    try {
      closedOffer(f);Object.assign(f.snapshot.state,patch);
      // An open campaign still has its normal future service/review gate.
      if(patch.outcome==='open')f.snapshot.blockTimestampNs='199';
      await f.keeper.tick();assert.equal(f.calls.length,0);
    } finally { f.close(); }
  }
});

test('an unbooked finalized failure can return its reserve without minting or deciding an outcome', async () => {
  const f=fixture();
  try {
    closedOffer(f,{outcome:'failure'});Object.assign(f.snapshot.state,{holder:null,nft_minted:false,total_received:'0',total_withdrawn:'0'});
    await f.keeper.tick();assert.deepEqual(f.calls.map(c=>c.method),['reclaim_storage_reserve']);
  } finally { f.close(); }
});

test('storage recovery follows a fresh finalized settlement and full payout rather than a submitted success operation', async () => {
  const f=fixture();
  try {
    Object.assign(f.snapshot.state,{nft_minted:true,total_received:'30000',total_withdrawn:'0',total_pending:'0',storage_reclaimed:false});
    await f.keeper.tick();assert.equal(f.calls[0].method,'finalize_success');
    f.advance();f.snapshot.state.outcome='success';await f.keeper.tick();assert.equal(f.calls.length,1,'unclaimed credits must remain untouched');
    f.advance();f.snapshot.state.total_withdrawn='30000';await f.keeper.tick();assert.deepEqual(f.calls.map(c=>c.method),['finalize_success','reclaim_storage_reserve']);assert.notEqual(f.calls[0].id,f.calls[1].id);
  } finally { f.close(); }
});

test('a storage-recovery timeout retains its original operation across restart even if its on-chain flag is already set', async () => {
  const f=fixture();
  try {
    closedOffer(f);f.dispatch('broadcast-unknown');await f.keeper.tick();const id=f.calls[0].id;
    f.snapshot.state.storage_reclaimed=true;const next=f.restart();f.advance();await next.tick();assert.equal(f.reconciliations,1);assert.equal(f.calls.length,1);assert.equal(f.store.operation(id).phase,'broadcast-unknown');
    f.store.transition(id,['broadcast-unknown'],'confirmed');f.advance();await next.tick();assert.equal(f.calls.length,1);assert.equal(f.store.operation(id).transaction_hash,'original-1');
  } finally { f.close(); }
});


test('qualified fully paid reclaimed offers stop chain reads across keeper and database restarts',async()=>{
 const folder=mkdtempSync(join(tmpdir(),'keeper-complete-')),path=join(folder,'state.sqlite'),f=fixture({path});let reopened,worker;
 try{closedOffer(f);f.snapshot.state.storage_reclaimed=true;await f.keeper.tick();assert.equal(f.reads,1);assert.equal(f.calls.length,0);const job=f.store.list('keeper-offer')[0];assert.equal(job.phase,'complete');assert.equal(job.completion.blockHash,f.snapshot.blockHash);assert.equal(job.completion.total_received,'30000');
  f.advance();await f.keeper.tick();assert.equal(f.reads,1);const next=f.restart();f.advance(60000);await next.tick();assert.equal(f.reads,1);assert.equal(f.calls.length,0);next.stop();
  reopened=new Store(path);worker=productionKeeper({store:reopened,chain:f.chain,config:f.config,now:()=>2000000,intervalMs:10000});await worker.tick();assert.equal(f.reads,1);assert.equal(reopened.list('keeper-offer')[0].phase,'complete');
 }finally{worker?.stop();reopened?.close();f.close();rmSync(folder,{recursive:true,force:true});}
});

test('pending funds, partial payment, missing reclamation and nonterminal outcomes never become complete',async()=>{
 for(const patch of [{total_pending:'1'},{total_withdrawn:'29999'},{storage_reclaimed:false},{outcome:'open'}]){const f=fixture();
  try{closedOffer(f);Object.assign(f.snapshot.state,{storage_reclaimed:true},patch);if(patch.outcome==='open')f.snapshot.blockTimestampNs='199';await f.keeper.tick();assert.notEqual(f.store.list('keeper-offer')[0]?.phase,'complete');f.advance();await f.keeper.tick();assert.equal(f.reads,2);
  }finally{f.close();}
 }
});

test('a naked complete flag or altered published source cannot suppress finalized qualification',async()=>{
 const f=fixture();
 try{closedOffer(f);f.snapshot.state.storage_reclaimed=true;await f.keeper.tick();let job=f.store.list('keeper-offer')[0];f.store.update('keeper-offer',job.id,job.owner,job.version,{...job,completion:null});f.advance();await f.keeper.tick();assert.equal(f.reads,2);assert.equal(f.store.list('keeper-offer')[0].phase,'complete');
  job=f.store.list('keeper-offer')[0];f.store.update('keeper-offer',job.id,job.owner,job.version,{...job,completion:{...job.completion,scope:'another-signer-scope'}});f.advance();await f.keeper.tick();assert.equal(f.reads,3);
  const deployment=f.store.get('deployment',OFFER),sale=f.store.list('sale')[0],terms={...deployment.terms,service_end_ns:'151'};f.store.update('deployment',deployment.id,deployment.owner,deployment.version,{...deployment,terms});f.store.update('sale',sale.id,sale.owner,sale.version,{...sale,publication:{...sale.publication,terms:[terms]}});f.snapshot.campaign.terms=terms;f.advance();await f.keeper.tick();assert.equal(f.reads,4);assert.equal(f.store.list('keeper-offer')[0].phase,'complete');
 }finally{f.close();}
});

test('original unknown operations reconcile before even valid completion evidence can skip reads',async()=>{
 const f=fixture();
 try{f.dispatch('broadcast-unknown');await f.keeper.tick();const original=f.calls[0].id;f.store.transition(original,['broadcast-unknown'],'confirmed');closedOffer(f);f.snapshot.state.storage_reclaimed=true;f.advance();await f.keeper.tick();assert.equal(f.store.list('keeper-offer')[0].phase,'complete');
  // Recreate the durable unresolved original state to exercise recovery ordering.
  f.store.db.prepare("UPDATE operations SET phase='broadcast-unknown' WHERE id=?").run(original);const reads=f.reads;const next=f.restart();f.advance();await next.tick();assert.equal(f.reconciliations,1);assert.equal(f.reads,reads);assert.equal(f.calls.length,1);assert.equal(f.store.list('keeper-offer')[0].phase,'broadcast-unknown');
 }finally{f.close();}
});
