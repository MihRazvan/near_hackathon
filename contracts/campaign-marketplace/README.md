# Dated placement campaigns

This contract version adds committed inventory/terms, fixed or takeover booking, artwork and installation deadlines, service dates, delivery evidence and issue-gated post-review settlement. It is separate from the frozen `marketplace` proof and is initialized only through `new_campaign` on a new account. It is not a migration to run over an already-funded legacy state.

Every purchase message includes `invoice_id`, `expected_round` and the base64 `published_terms_sha256` committed in `CampaignTerms`. Terms are immutable. Fixed placements reject further purchases; takeover placements retain the original solvency and original-creditor accounting.

Buyer artwork editing ends at `artwork_due_ns`. The seller can lock the exact submitted revision before `installation_due_ns`, then commit a delivery-proof URI/hash with a storage deposit. Success requires the complete review deadline, locked artwork, delivery proof and no unresolved on-chain issue. The arbiter is distinct from the seller and records issue decisions with an evidence hash. Uploaded evidence is a commitment, not independent proof of physical installation.

Native and Intents settlement remain separate per instance. NFT ownership transfers artwork authority; accrued financial claims stay with the original payer. The standard NFT expires at service end; editing permissions stop earlier at the published artwork deadline or production lock.

```sh
cargo test --locked -p campaign-marketplace --lib
bash scripts/build-campaign.sh
```

The financial and NFT regression tests are shared with the frozen proof; additional campaign tests cover term mismatches, fixed spots, schedule constraints, production deadlines, evidence and disputes. Public funded qualification is recorded separately from local results.
