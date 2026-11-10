import { randomUUID } from 'node:crypto';
import { setInterval, clearInterval } from 'node:timers';
import { assert, hashObject, uint, walletId } from './core.mjs';
import { isOfferId } from './hub.mjs';

const TERMINAL = new Set(['confirmed', 'failed', 'superseded']);
const INTERVAL = 30000;
const RETRY_MAX = 15 * 60000;

// This writer is deliberately separate from the read-only reconciliation worker.
// The executor remains responsible for budget reservations, signer serialization,
// durable signed bytes and receipt reconciliation. This worker never rebroadcasts.
export function productionKeeper({ store, chain, config, now = Date.now, intervalMs = INTERVAL, batchSize = 5, leaseMs = 180000, sandboxQualification }) {
  assert(Number.isSafeInteger(intervalMs) && intervalMs >= 10000 && intervalMs <= 3600000, 'INVALID_KEEPER_INTERVAL', 'Keeper interval must be bounded');
  assert(Number.isSafeInteger(batchSize) && batchSize >= 1 && batchSize <= 20, 'INVALID_KEEPER_BATCH', 'Keeper batch must contain one to twenty offers');
  assert(Number.isSafeInteger(leaseMs) && leaseMs >= 60000 && leaseMs <= 3600000, 'INVALID_KEEPER_LEASE', 'Keeper lease must be bounded');
  const requested = config.production === true && config.enabled === true && config.keeperEnabled === true;
  const sandboxTest = config.network === 'sandbox' && typeof sandboxQualification === 'function';
  const enabled = requested && (config.network !== 'sandbox' || sandboxTest);
  if (enabled) {
    assert((config.network === 'mainnet' || sandboxTest) && config.hub?.accountId && config.hub?.codeHash && config.treasury, 'KEEPER_NOT_CONFIGURED', 'Keeper requires a pinned mainnet hub and fixed relayer');
    assert(!walletId(config.hub.accountId).startsWith('0x') && !walletId(config.treasury).startsWith('0x'), 'INVALID_KEEPER_ACCOUNT', 'Keeper and marketplace must use native NEAR accounts');
  }
  const scope = hashObject({ network: config.network ?? '', hub: config.hub?.accountId ?? '', codeHash: config.hub?.codeHash ?? '', signer: config.treasury ?? '' });
  const leaseId = 'hub-keeper-' + scope;
  const instance = randomUUID();
  let running = false, stopped = false, timer, heartbeat;
  const jobId = offer => 'hub-keeper-offer-' + hashObject({ scope, offer });

  function acquire() {
    return store.transaction(() => {
      const previous = store.get('keeper-lease', leaseId);
      if (previous && previous.expiresAt > now() && previous.instance !== instance) return false;
      const data = { instance, expiresAt: now() + leaseMs };
      if (previous) store.update('keeper-lease', leaseId, config.treasury, previous.version, data);
      else store.insert('keeper-lease', leaseId, config.treasury, data);
      return true;
    });
  }
  function renew() {
    return store.transaction(() => {
      const previous = store.get('keeper-lease', leaseId);
      if (!previous || previous.instance !== instance || previous.expiresAt <= now()) return false;
      store.update('keeper-lease', leaseId, config.treasury, previous.version, { instance, expiresAt: now() + leaseMs });
      return true;
    });
  }
  function ownsLease() {
    const lease = store.get('keeper-lease', leaseId);
    return !stopped && lease?.instance === instance && lease.expiresAt > now();
  }
  function release() {
    store.db.prepare('DELETE FROM objects WHERE kind=? AND id=? AND json_extract(data,\'$.instance\')=?').run('keeper-lease', leaseId, instance);
  }
  function saveJob(offer, patch) {
    const id = jobId(offer), previous = store.get('keeper-offer', id), data = { ...(previous ?? {}), ...patch };
    return previous ? store.update('keeper-offer', id, config.treasury, previous.version, data) : store.insert('keeper-offer', id, config.treasury, data);
  }
  function publishedOffer(id) {
    if (!isOfferId(id)) return null;
    const index = store.get('spot-index', id), deployment = store.get('deployment', id), sale = index && store.get('sale', index.saleId);
    const spot = sale?.spots?.find(p => p.id === index.spotId && p.contractId === id);
    if (!sale || sale.status !== 'published' || !spot || !deployment || !sale.publication?.manifest) return null;
    if (sale.owner !== index.owner || sale.owner !== deployment.owner || sale.publication.manifest.sellerId !== sale.owner || sale.publication.manifest.saleId !== sale.id) return null;
    if (spot.mode !== 'hub' || deployment.mode !== 'hub' || spot.offerId !== id || deployment.offerId !== id || spot.hubId !== config.hub.accountId || deployment.hubId !== config.hub.accountId || spot.codeHash !== config.hub.codeHash || deployment.codeHash !== config.hub.codeHash) return null;
    const terms = sale.publication.terms?.find(t => t.spot_id === spot.id);
    if (!terms || terms.sale_id !== sale.id || hashObject(terms) !== hashObject(deployment.terms)) return null;
    return { sale, deployment, spot };
  }
  function qualifies(snapshot, published, id) {
    return snapshot.qualified === true && snapshot.mode === 'hub' && snapshot.accountId === id && snapshot.offerId === id && snapshot.receiverId === config.hub.accountId && snapshot.codeHash === config.hub.codeHash && snapshot.state.offer_id === id && snapshot.state.receiver_id === config.hub.accountId && snapshot.state.seller_id === published.sale.owner && snapshot.state.arbiter_id === published.deployment.arbiterId && hashObject(snapshot.campaign.terms) === hashObject(published.deployment.terms);
  }
  function actionFor(snapshot) {
    const t = uint(snapshot.blockTimestampNs, 'finalized chain timestamp'), state = snapshot.state, campaign = snapshot.campaign;
    if (state.holder && state.outcome !== 'failure' && !state.nft_minted && t >= uint(state.cutoff_ns)) return { action: 'mint', method: 'mint_final_placement', gas: '50000000000000' };
    if (state.outcome === 'open' && state.holder && state.artwork_locked && campaign.delivery_proof && campaign.open_issues === 0 && t >= uint(state.refund_end_ns) && t >= uint(campaign.terms.service_end_ns)) return { action: 'finalize-success', method: 'finalize_success', gas: '60000000000000' };
    // The hub itself returns unused reserve to its immutable original funder or
    // sponsor pool. Never supply a beneficiary or reclaim while money remains.
    if (['success', 'failure'].includes(state.outcome) && state.storage_reclaimed === false && uint(state.total_received) === uint(state.total_withdrawn) && uint(state.total_pending) === 0n) return { action: 'reclaim-storage', method: 'reclaim_storage_reserve', gas: '40000000000000' };
    return null;
  }
  async function processOffer(id) {
    const published = publishedOffer(id);
    if (!published) return 'skipped';
    let job = store.get('keeper-offer', jobId(id));
    if ((job?.nextCheckAt ?? 0) > now()) return 'deferred';
    const original = job?.operationId && store.operation(job.operationId);
    if (original && !TERMINAL.has(original.phase)) {
      // Always reconcile the original, even if a different on-chain stage is now
      // visible. An unknown receipt must never produce a replacement operation.
      assert(original.kind === 'near' && original.plan.signerId === config.treasury && original.plan.receiverId === config.hub.accountId && original.plan.expectedReceiverCodeHash === config.hub.codeHash, 'KEEPER_OPERATION_CHANGED', 'Keeper operation differs from its pinned relayer');
      const operation = await chain.near.reconcile(original.id);
      if (ownsLease()) saveJob(id, { phase: operation.phase, nextCheckAt: now() + intervalMs });
      return 'reconciled';
    }
    const snapshot = await chain.snapshot(id);
    assert(ownsLease(), 'KEEPER_LEASE_LOST', 'Keeper lease expired while reading the offer');
    assert(qualifies(snapshot, published, id), 'KEEPER_SCOPE_CHANGED', 'Keeper can only maintain the published qualified offer');
    // The qualified finalized block, rather than wall time, authorizes each stage.
    const next = actionFor(snapshot);
    if (!next) {
      saveJob(id, { nextCheckAt: now() + intervalMs, failures: 0 });
      return 'waiting';
    }
    const operationId = 'hub-keeper-' + hashObject({ scope, offer: id, action: next.action });
    const prior = store.operation(operationId);
    job = saveJob(id, { offerId: id, action: next.action, operationId, nextCheckAt: now() + intervalMs });
    if (prior) {
      // A finalized failure is retained for deliberate operator recovery. No
      // successor ID, lower-gas replacement, new nonce or automatic resend.
      saveJob(id, { phase: prior.phase, nextCheckAt: now() + (prior.phase === 'failed' ? RETRY_MAX : intervalMs) });
      return TERMINAL.has(prior.phase) ? 'completed' : 'deferred';
    }
    assert(ownsLease(), 'KEEPER_LEASE_LOST', 'Keeper lease expired before dispatch');
    // Do not ask NearExecutor to poll another writer's signer lock twelve times.
    if (store.get('near-lock', config.treasury)) return 'signer-busy';
    const signer = await chain.treasurySigner();
    assert(ownsLease(), 'KEEPER_LEASE_LOST', 'Keeper lease expired before dispatch');
    const operation = await chain.call({ id: operationId, signerId: config.treasury, signer, receiverId: config.hub.accountId, codeHash: config.hub.codeHash, method: next.method, args: { offer_id: id }, gas: next.gas, deposit: '0' });
    if (ownsLease()) saveJob(id, { phase: operation.phase, nextCheckAt: now() + (operation.phase === 'failed' ? RETRY_MAX : intervalMs), failures: 0 });
    store.event('keeper_operation', id, config.treasury, { operationId, action: next.action, phase: operation.phase });
    return 'submitted';
  }
  async function tick() {
    if (!enabled || stopped || running) return;
    running = true;
    let acquired = false;
    const result = { checked: 0, submitted: 0, reconciled: 0, unavailable: 0 };
    try {
      // Constructor-only test injection; the hosted server never supplies this.
      // A label or environment variable cannot activate signing on another chain.
      if (sandboxTest) {
        const endpoint = new URL(chain.reads.rpc.endpoint);
        assert(['http:', 'https:'].includes(endpoint.protocol) && ['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname) && !endpoint.username && !endpoint.password, 'SANDBOX_ONLY', 'Keeper test RPC must be loopback');
        const status = await chain.reads.status(), proof = await sandboxQualification();
        assert(status.chain_id?.startsWith('test-chain-') && (proof?.chainId ?? proof) === status.chain_id, 'SANDBOX_ONLY', 'Keeper requires the actual isolated Sandbox chain proof');
      }
      acquired = acquire();
      if (!acquired) return;
      heartbeat = setInterval(() => { try { renew(); } catch { /* A lost lease disables dispatch. */ } }, Math.floor(leaseMs / 3));
      heartbeat.unref();
      const cursor = store.get('keeper-cursor', leaseId)?.after ?? '';
      let rows = store.db.prepare('SELECT id FROM objects WHERE kind=? AND id>? ORDER BY id LIMIT ?').all('spot-index', cursor, batchSize);
      if (!rows.length && cursor) rows = store.db.prepare('SELECT id FROM objects WHERE kind=? ORDER BY id LIMIT ?').all('spot-index', batchSize);
      for (const { id } of rows) {
        if (!ownsLease()) break;
        try {
          const outcome = await processOffer(id);
          result.checked++;
          if (outcome === 'submitted') result.submitted++;
          if (outcome === 'reconciled') result.reconciled++;
        } catch (error) {
          result.unavailable++;
          const prior = store.get('keeper-offer', jobId(id)), failures = Math.min((prior?.failures ?? 0) + 1, 10);
          if (ownsLease()) saveJob(id, { failures, lastErrorCode: typeof error.code === 'string' ? error.code : 'KEEPER_UNAVAILABLE', nextCheckAt: now() + Math.min(intervalMs * 2 ** failures, RETRY_MAX) });
        }
        if (!ownsLease()) break;
        const previous = store.get('keeper-cursor', leaseId);
        if (previous) store.update('keeper-cursor', leaseId, config.treasury, previous.version, { after: id });
        else store.insert('keeper-cursor', leaseId, config.treasury, { after: id });
      }
      return result;
    } finally {
      if (heartbeat) clearInterval(heartbeat);
      if (acquired) release();
      running = false;
    }
  }
  if (enabled) {
    timer = setInterval(() => { void tick().catch(() => { /* Durable jobs retry with the next bounded tick. */ }); }, intervalMs);
    timer.unref();
  }
  return { tick, stop() { stopped = true; if (timer) clearInterval(timer); }, isRunning: () => running, enabled };
}
