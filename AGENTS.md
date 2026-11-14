# Repository guide

Everywhere is a physical-advertising marketplace. The current contract is the shared NEAR hub in `contracts/marketplace-hub/`. Each offer has isolated accounting and a final NEP-171 placement NFT. NFT transfers change creative authority; refunds, rewards and earnings retain their original creditors.

## Current paths

- `prototype/src/`: connected vanilla ES-module frontend; the directory name is historical.
- `backend/src/`: persistent API, wallet sessions, Intents authorization, media, transaction journals and recovery.
- `contracts/marketplace-hub/src/lib.rs`: current on-chain roles, prices, credits, NFT and fulfillment gates.
- `contracts/marketplace-hub/src/tests.rs`: current hub unit assertions.
- `backend/bin/product-sandbox.mjs` and `prototype/tests/production-browser.mjs`: real local-chain interface qualification.
- `deployments/`: public mainnet manifests and hash-bound synthetic evidence.
- `VERIFY.md`: reproducible checks and their limits.

`contracts/marketplace`, `contracts/campaign-marketplace`, the factory crates and `backend/lab` preserve older experiments. Read their historical labels before using them to explain current behavior.

## Verification

Use Node 22.23+ and npm. From the repository root:

```sh
node scripts/verify.mjs --offline
node scripts/verify.mjs
```

The quick verifier uses isolated temporary state, no personal environment files, and no wallet or API credentials. Full-chain prerequisites and commands are in `VERIFY.md`. Read `--help` before choosing build or Sandbox verification. Reports go under ignored `.local/verification/`.

For targeted work, run the affected existing test suite and relevant build. Keep actual signatures/contract execution separate from provider fixtures in reports. A provider outage is not an evidence mismatch, and offline hashes do not establish current chain state.

## Implementation boundaries

- Preserve wallet consent, exact plan binding, original-operation recovery and original-creditor accounting.
- Do not replace a current chain check with a database assertion or fabricated successful response.
- Never commit `.env*` credentials, private keys, local state or private operational reports. Keep public verification evidence traceable to its declared manifest and actual checks; do not publish private operational reports.
- Label generated imagery and synthetic delivery truthfully. Artifact hashes commit submitted bytes; they do not prove a physical installation.
- Update factual documentation when changing behavior. Keep the current hub description separate from historical per-campaign and nomination flows.
