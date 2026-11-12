import { esc, link, icon } from '../ui.mjs';
import { placementNft, placementNftPhase } from './placement-nft.mjs';

const records = new Map(), expanded = new Map();
let evidence, evidenceLoad;
const changed = () => window.dispatchEvent(new Event('app:changed'));
const text = (value, fallback = 'Not recorded') => esc(value ?? fallback);
const time = value => {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(date) + ' UTC' : 'Not recorded';
};
const money = value => {
  if (!/^\d+$/.test(String(value ?? ''))) return 'Unavailable';
  const raw = BigInt(value), fraction = (raw % 1000000n).toString().padStart(6, '0').replace(/0+$/, '').padEnd(2, '0');
  return `${raw / 1000000n}.${fraction} USDC`;
};
const external = (url, title, cls = 'record-link') => {
  try { const parsed = new URL(url); if (parsed.protocol !== 'https:') return esc(title); }
  catch { return esc(title); }
  return `<a class="${cls}" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${title}${icon('arrow')}</a>`;
};
const artifact = (item, label) => {
  if (!item?.uri && !item?.sha256) return `<p class="record-muted">${label} has not been recorded.</p>`;
  const uri = typeof item.uri === 'string' && /^ipfs:\/\/[A-Za-z0-9]+(?:\/[A-Za-z0-9._/-]*)?$/.test(item.uri) ? item.uri.replace('ipfs://', 'https://gateway.pinata.cloud/ipfs/') : null;
  return `<div class="record-artifact"><div><strong>${label}</strong><span>${item.revision ? 'Revision ' + esc(item.revision) : 'Public artifact commitment'}</span></div>${uri ? external(uri, 'Open artifact') : '<span>Gateway link unavailable</span>'}<details><summary>File fingerprint</summary><code>${text(item.sha256)}</code><code>${text(item.uri)}</code></details></div>`;
};

async function read(path) {
  const response = await fetch('/api/' + path, { credentials: 'same-origin' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? 'The record could not be loaded.');
  return data;
}

export function mountCampaignRecord(id, { force = false } = {}) {
  for (const detail of document.querySelectorAll?.('[data-record-disclosure]') ?? []) {
    const key = id + ':' + detail.dataset.recordDisclosure;
    detail.open = expanded.get(key) ?? false;
    detail.addEventListener('toggle', () => { if(detail.isConnected) expanded.set(key, detail.open); });
  }
  const prior = records.get(id);
  if (prior?.loading || (!force && prior)) return;
  records.set(id, { loading: true, data: prior?.data });
  void read('campaign-records/' + encodeURIComponent(id)).then(data => {
    if (data.schema !== 'everywhere-campaign-record/v1' || !data.campaign?.asset || !Array.isArray(data.snapshots)) throw new Error('The campaign record returned an incomplete response.');
    records.set(id, { data, loading: false }); changed();
    if (data.qualification?.matched) void loadEvidence({ force });
  }).catch(error => { records.set(id, { loading: false, error: error.message }); changed(); });
}

export async function loadEvidence({ force = false } = {}) {
  if (evidenceLoad) return evidenceLoad;
  if (evidence && !force) return evidence;
  evidenceLoad = read('evidence/qualification').then(data => { if(data.schema !== 'everywhere-qualification/v1' || data.network !== 'mainnet') throw new Error('Invalid evidence response'); evidence = data; changed(); return data; })
    .catch(() => { evidence = { unavailable: true }; changed(); return evidence; }).finally(() => { evidenceLoad = null; });
  return evidenceLoad;
}

function recordedReceipts() {
  if (!evidence) return '<p class="record-muted">Loading the recorded receipts…</p>';
  const verification = evidence.verification ?? {}, steps = evidence.record?.steps ?? [];
  const status = verification.status === 'verified' ? 'Current state matches the historical qualification.' : verification.status === 'mismatch' ? 'Current state does not match the recorded qualification. Do not treat this record as currently verified.' : 'Current qualification is unavailable. The historical receipts below have not been reverified by this page.';
  return `<div class="${verification.status === 'verified' ? 'record-muted' : 'notice orange'}" role="status">${status}</div><dl class="record-facts"><div><dt>Current check</dt><dd>${text(time(verification.checkedAt))}</dd></div><div><dt>Historical receipt verification</dt><dd>${text(time(verification.receiptsVerifiedAt))}</dd></div></dl>${steps.length ? `<ol class="record-receipts">${steps.map(step => `<li><div><strong>${text(step.label)}</strong><span>NEAR mainnet · recorded transaction</span></div>${external(step.explorerUrl, 'View receipt')}<code>${text(step.transactionHash)}</code></li>`).join('')}</ol>` : '<p class="record-muted">Historical receipts are temporarily unavailable. Refresh verification to retry.</p>'}<ul class="record-coverage">${(evidence.record?.coverage ?? []).map(item => `<li><strong>${text(item.feature)} · ${text(item.status)}</strong><p>${text(item.note)}</p></li>`).join('')}</ul>`;
}

function placement(snapshot, campaign, network) {
  const state = snapshot.state ?? {}, rights = snapshot.rights ?? {}, accounting = snapshot.accounting ?? {}, complete = snapshot.qualified && state.outcome === 'success';
  const currentOwner = rights.currentOwnerId ?? state.holder?.account_id, minted = state.nft_minted === true || rights.minted === true;
  const phase = placementNftPhase({minted, active:rights.active, locked:rights.locked, outcome:state.outcome});
  const surface = campaign.spots?.find(p=>p.contractId===snapshot.contractId)?.name ?? campaign.asset.name;
  return `<section class="record-placement"><div class="record-section-title"><h2>${esc(campaign.spots?.find(p => p.contractId === snapshot.contractId)?.name ?? 'Campaign placement')}</h2><span class="record-state ${complete ? 'settled' : ''}">${text(state.outcome ?? 'Checking state')}</span></div>
    <div class="record-money"><div><span>Received by the campaign</span><strong>${money(accounting.received)}</strong></div><div><span>Paid to original creditors</span><strong>${money(accounting.withdrawn)}</strong></div><div><span>Withdrawals pending</span><strong>${money(accounting.pending)}</strong></div></div>
    <div class="record-columns"><section class="record-nft"><h3>The placement NFT</h3>${placementNft({surface,controller:minted?currentOwner:undefined,originalPayer:rights.originalPayerId,tokenId:minted?rights.tokenId:undefined,revision:snapshot.artwork?.revision,network,phase})}${!minted?'<p class="record-muted">The final placement NFT has not been issued.</p>':''}${external(minted ? snapshot.links?.nft ?? snapshot.links?.contract : snapshot.links?.contract, minted ? 'Inspect the NFT' : 'Inspect the contract')}</section>
    <section><h3>Artwork & delivery</h3>${artifact(snapshot.artwork, 'Artwork')}${artifact(snapshot.delivery, 'Owner-submitted delivery evidence')}<p class="record-muted">${snapshot.delivery?.provenance === 'synthetic-qualification' ? 'This run used synthetic evidence. No physical advertisement was installed.' : 'Delivery evidence is supplied by the space owner. A blockchain commitment does not independently verify physical installation.'}</p></section></div>
    <details class="record-verification" data-record-disclosure="${esc(snapshot.contractId)}"><summary>${icon('shield')} Verify on NEAR ${icon('chevron')}</summary><div class="record-verification-body"><p>${snapshot.qualified ? 'This state was read from a finalized block and checked against the configured contract, assets and published campaign terms.' : 'This record could not be fully qualified. Treat its state as unverified until a fresh check succeeds.'}</p><dl class="record-facts"><div><dt>Observed</dt><dd>${text(time(snapshot.observedAt))}</dd></div><div><dt>Finalized block</dt><dd>${text(snapshot.blockHeight)}</dd></div><div><dt>Offer</dt><dd><code>${text(snapshot.offerId ?? snapshot.contractId)}</code></dd></div><div><dt>Contract</dt><dd><code>${text(snapshot.receiverId)}</code></dd></div></dl>${external(snapshot.links?.contract, 'Open the contract')}</div></details>
  </section>`;
}

function recordCover(asset, synthetic) {
  if (synthetic) return '<div class="record-photo"><img src="/images/van-dublin-ad.webp" width="1600" height="900" alt="Illustrative van advertisement; not a photograph of the recorded installation"><span>Illustrative vehicle · recorded test evidence below</span></div>';
  if (/^ipfs:\/\/baf[a-z2-7]+$/.test(asset.coverUri ?? '')) return `<div class="record-photo"><img src="${esc(asset.coverUri.replace('ipfs://', 'https://gateway.pinata.cloud/ipfs/'))}" width="1600" height="900" alt="Owner-published cover for ${esc(asset.name)}"><span>Owner-published reference photo · not installation evidence</span></div>`;
  return `<div class="record-asset-summary">${icon('car')}<h2>${esc(asset.name)}</h2><p>${esc(asset.type)} · ${esc(asset.city)}</p><span>No public reference photo supplied.</span></div>`;
}

export function campaignRecordView(id) {
  const entry = records.get(id);
  if (!entry || (entry.loading && !entry.data)) return `<section class="record-loading"><span class="record-loader" aria-hidden="true"></span><h1 tabindex="-1">Opening the campaign record.</h1><p role="status">Reading the published campaign and its NEAR state…</p></section>`;
  if (entry.error) return `<section class="record-empty"><h1 tabindex="-1">This record isn’t available.</h1><p>${esc(entry.error)}</p><button class="button primary" data-record-action="refresh" data-record-id="${esc(id)}">Try again</button>${link('/explore', 'Explore spaces', 'button')}</section>`;
  const data = entry.data, campaign = data.campaign, qualification = data.qualification, synthetic = qualification?.synthetic;
  return `<article class="campaign-record"><div class="record-topline"><a href="/explore">${icon('arrow')} Marketplace</a><span>${text(data.network)} · public campaign record</span></div><header class="record-heading"><div><h1 tabindex="-1">${synthetic ? 'A REAL-WORLD RIGHT.<br>RECORDED AS AN NFT.' : esc(campaign.title)}</h1><p>${synthetic ? 'A placement NFT, committed artwork and a complete USDC money trail on NEAR mainnet. This qualification used synthetic artwork and delivery evidence.' : `${esc(campaign.asset.name)} in ${esc(campaign.asset.city)}. A read-only record of the published campaign and its settlement.`}</p></div><div class="record-heading-actions"><button class="button" data-record-action="copy" data-record-id="${esc(id)}">${icon('copy')} Copy record link</button><button class="button quiet" ${entry.loading ? 'disabled' : ''} data-record-action="refresh" data-record-id="${esc(id)}">${entry.loading ? 'Refreshing…' : 'Refresh verification'}</button></div></header>
    ${data.status !== 'available' ? `<div class="notice orange" role="status">Some chain state is temporarily unavailable. Missing state is not confirmation of a payment or campaign outcome.</div>` : ''}
    ${synthetic ? `<div class="record-provenance">${icon('shield')} <span>Recorded mainnet qualification · this is a historical test, not your campaign or NFT.</span>${link('/experience', 'Try the interactive example', 'record-link')}</div>` : ''}
    <div class="record-overview">${recordCover(campaign.asset, synthetic)}<section class="record-schedule"><h2>Campaign dates</h2><dl class="record-facts">${[['Booking deadline', 'biddingClose'], ['Artwork deadline', 'artworkDue'], ['Installation deadline', 'installationDue'], ['Service start', 'serviceStart'], ['Service end', 'serviceEnd'], ['Review deadline', 'reviewEnd']].map(([label, key]) => `<div><dt>${label}</dt><dd>${text(time(campaign.schedule?.[key]))}</dd></div>`).join('')}</dl><p class="record-muted">${synthetic ? 'Dates are those of the completed qualification run. The interactive example compresses its timeline.' : 'Dates and rules were published by the space owner.'}</p></section></div>
    ${data.snapshots.map(snapshot => placement(snapshot, campaign, data.network)).join('') || '<section class="record-empty"><h2>Waiting for a qualified chain read.</h2><p>No state is presented as verified until its source can be checked.</p></section>'}
    ${synthetic ? `<details class="record-verification" data-record-disclosure="receipts"><summary>${icon('receipt')} Recorded mainnet receipts ${icon('chevron')}</summary><div class="record-verification-body">${recordedReceipts()}<a class="record-link" href="/api/evidence/qualification" target="_blank" rel="noopener noreferrer">Machine-readable evidence ${icon('arrow')}</a><p class="record-muted">Reproduce historical receipt verification from the repository: <code>node backend/bin/verify-evidence.mjs</code></p></div></details>` : ''}
    <footer class="record-close"><div><h2>YOUR NEXT CAMPAIGN<br>STARTS WITH A SPACE.</h2><p>Explore available surfaces or try a takeover in the interactive example.</p></div><div class="actions">${link('/experience', 'Try a takeover', 'button primary')}${link('/explore', 'Find a space', 'button')}</div></footer><p class="record-share-status" role="status" aria-live="polite"></p></article>`;
}

export async function handleRecordAction(target) {
  const id = target.dataset.recordId;
  if (target.dataset.recordAction === 'refresh') { mountCampaignRecord(id, { force: true }); changed(); return; }
  if (target.dataset.recordAction === 'copy') {
    const status = document.querySelector('.record-share-status');
    try { await navigator.clipboard.writeText(location.origin + '/records/' + encodeURIComponent(id)); if (status) status.textContent = 'Campaign record link copied.'; }
    catch { if (status) status.textContent = 'Copy this page’s address to share the public record.'; }
  }
}

export const recordFormatting = { money, time };
