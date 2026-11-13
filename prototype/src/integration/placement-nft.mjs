import { esc } from '../ui.mjs';

// A receipt can outlive its artwork authority. Never infer an open editing
// window from token ownership alone, or a minted token from a reserved ID.
export function placementNftPhase({ minted, active, locked, outcome } = {}) {
  if (minted !== true) return 'pending';
  if (outcome && outcome !== 'open') return 'archived';
  if (locked === true) return 'locked';
  if (active === true) return 'editable';
  return active === false ? 'archived' : 'unknown';
}

const phases = {
  pending: ['Not issued yet', 'The final advertiser receives the NFT after booking closes.'],
  editable: ['Artwork control open', 'The NFT owner can submit or replace artwork during this window.'],
  locked: ['Artwork approved & locked', 'The approved design is fixed for production. NFT transfers cannot reopen editing.'],
  archived: ['Artwork window closed', 'The NFT remains a campaign record. Transferring it cannot reopen artwork editing.'],
  unknown: ['Checking artwork rights', 'Ownership alone does not confirm that artwork editing is available.'],
};

export function placementNft({ surface = 'Campaign placement', controller, owner = controller, originalPayer, tokenId, revision, network = 'mainnet', phase = 'unknown', example = false, recorded = false } = {}) {
  const [status, authority] = phases[phase] ?? phases.unknown;
  const minted = phase !== 'pending', label = example ? 'Example placement NFT' : recorded ? 'Recorded placement NFT' : 'Placement NFT';
  return `<section class="placement-nft" data-nft-phase="${esc(phase)}" aria-label="${label}">
    <div class="nft-pass-top"><span>${label}</span><span>${example ? 'Illustration' : recorded ? 'NEAR mainnet test' : network === 'mainnet' ? 'NEAR mainnet' : network === 'sandbox' ? 'NEAR Sandbox' : esc(network)}</span></div>
    <h3>Right to<br>this spot.</h3><p class="nft-pass-surface">${esc(surface)}</p>
    <dl class="nft-pass-facts"><div><dt>${recorded?'Recorded owner':minted ? 'NFT owner' : 'Final recipient'}</dt><dd data-nft-controller>${esc(owner ?? (minted ? 'Unavailable' : 'Decided at booking close'))}</dd></div>${minted && controller && controller !== owner ? `<div><dt>Creative controller</dt><dd>${esc(controller)}</dd></div>` : ''}<div><dt>Artwork authority</dt><dd>${esc(status)}</dd></div>${minted && revision !== undefined && revision !== null ? `<div><dt>Artwork revision</dt><dd>${esc(revision)}</dd></div>` : ''}${originalPayer ? `<div><dt>Original advertiser</dt><dd>${esc(originalPayer)}</dd></div>` : ''}</dl>
    <p class="nft-pass-authority">${esc(controller && controller !== owner ? authority.replace('NFT owner', 'creative controller') : authority)}</p><p class="nft-pass-money">Refunds, rewards and earnings stay with their original wallets.</p>
    ${minted && tokenId ? `<details class="nft-pass-id"><summary>NFT identifier</summary><code>${esc(tokenId)}</code></details>` : ''}
  </section>`;
}
