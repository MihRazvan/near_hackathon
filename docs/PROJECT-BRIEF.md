# Everywhere project brief

[Overview](../README.md) | [User flow](USER-FLOW.md) | [Architecture](TECHNICAL-ARCHITECTURE.md) | [Contracts](CONTRACTS.md) | [Verify](../VERIFY.md) | [Docs](README.md)

## The idea

Everywhere starts with vehicle ad space. An owner adds a photo or description, edits the panels AI suggests, and publishes campaign dates with prices that include printing and installation. Advertisers book individual placements in USDC. Where the owner allows takeovers, another buyer can replace a booking before production.

After booking closes, the final advertiser receives a placement NFT. Its holder can manage the artwork during the editing window or transfer that right to a studio. Refunds and earnings stay with the wallets originally owed them.

## What makes the implementation different

| Mechanism | Observable behavior | Code / evidence |
| --- | --- | --- |
| Photo/prompt to editable inventory | Suggested panels become directly editable outlines; manual editing remains available | [Onboarding](../prototype/src/integration/onboarding.mjs), [editor](../prototype/src/integration/spot-workspace.mjs), [vehicle AI](../backend/src/asset-ai.mjs) |
| Pre-production takeovers | A distinct buyer replaces the current booking under the committed terms; displaced-payer credit is preserved | [Hub](../contracts/marketplace-hub/src/lib.rs), [completed record](https://everywhere-near.vercel.app/records/e22dd301-786f-476c-af74-0df7cd2e6168) |
| Transferable creative authority | The current NFT holder can submit artwork; the former holder loses access | [NFT rules](CONTRACTS.md#nft-authority), [real local-chain browser scenario](../prototype/tests/production-browser.mjs) |
| Dynamic metadata | An artwork revision updates the token's IPFS reference and hash | [Hub tests](../contracts/marketplace-hub/src/tests.rs), [van handoff](https://everywhere-near.vercel.app/records/aa80efd3-472d-4e64-b8f8-fec738d2d3e2) |
| Original-creditor separation | NFT transfer cannot redirect refunds, completion rewards or earnings | [Hub unit assertions](../contracts/marketplace-hub/src/tests.rs), [verification claim map](../VERIFY.md#claims-and-executable-evidence) |
| Durable wallet recovery | Interrupted sends reconcile their original recorded operation before another transfer is offered | [Wallet request journal](../backend/src/wallet-requests.mjs), [original-intent recovery tests](../backend/tests/original-intent-recovery.test.mjs) |

## Hackathon fit

The [hackathon FAQ](https://nearhackathon.com/#faq) says Claude Code and Codex check whether projects run and do what their README describes. Human judges make the final decisions.

| Selected track | Implementation | Limits |
| --- | --- | --- |
| [NFTs That Do Something](https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/10-nfts.md) (`nfts`) | NEP-171, dynamic NFTs and transferable artwork access | Offers share one hub. Individual NFTs have no NEAR sub-accounts or funds of their own. |
| [Open Innovation](https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/13-open.md) (`open`) | A physical-advertising marketplace combines AI-assisted inventory, takeovers, creative ownership and inspectable settlement | AI does not independently establish dimensions, vehicle ownership, installation or exposure. |
| [Real-World Money](https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/08-realworld.md) (`realworld`) | USDC service payments, NEAR Intents authorization, bounded sponsorship, recoverable credits, native withdrawal and quoted Base routes | Local Sandbox qualification does not establish a public Base bridge or genuine physical service delivery. |

The briefs' example builds are optional. Chain Signatures, autonomous AI treasuries, per-NFT sub-accounts, carbon credits and measured advertising impressions are outside this implementation.

## What was built here

Everywhere builds on the earlier Pitboard vehicle-sponsorship concept and takeover idea. This repository contains the app, wallet integration, NEAR contracts, shared hub, AI-assisted editor and verification tools.

- The earlier static marketplace prototype begins at [46483c9](https://github.com/MihRazvan/near_hackathon/commit/46483c9).
- NEAR contract implementation begins at [ae3efa1](https://github.com/MihRazvan/near_hackathon/commit/ae3efa1).
- The current contract is [`contracts/marketplace-hub`](../contracts/marketplace-hub/); earlier campaign/factory crates remain labelled historical.

The team used Codex and Claude for implementation and review. The app uses NEAR AI to process vehicle photos and descriptions. A separate personal subscription companion runs on its owner's computer. Original code is [MIT licensed](../LICENSE); [third-party assets](../prototype/public/ASSETS.md) keep their own licenses.

## What is verified and what remains

- Tests cover the marketplace, owner editor, campaign management, wallet sessions and payment recovery.
- Hub unit tests and local-chain runs cover financial ownership, NFT artwork access, delivery requirements, disputes, payouts and withdrawal.
- macOS arm64 CI reproduces the exact deployed WASM. Linux tests the source and runs the hash-checked deployed binary; its compiled output differs from the deployment.
- Recorded mainnet tests use real USDC and final NFTs with synthetic artwork/delivery. Fresh receipt checks depend on RPC availability.
- The planned physical pilot uses the Pitboard motorcycle and Everywhere branding. Installation and evidence are still pending.

[Run the checks](../VERIFY.md) · [Inspect deployments and media provenance](DEPLOYMENTS.md) · [Demo and product walkthrough](DEMO.md)
