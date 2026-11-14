# Everywhere project brief

[Overview](../README.md) | [User flow](USER-FLOW.md) | [Architecture](TECHNICAL-ARCHITECTURE.md) | [Contracts](CONTRACTS.md) | [Verify](../VERIFY.md) | [Docs](README.md)

## The idea

**Advertise on everything. Start with vehicles.** A space owner creates a listing from a photo or description, reviews AI-proposed panels and publishes campaign dates and all-in prices. An advertiser books an individual placement in USDC. An enabled takeover can replace that booking before production.

After booking closes, the final advertiser receives a placement NFT. Its holder controls artwork during the editing window and can hand that work to a studio by transferring the NFT. The original wallets keep their financial claims.

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

The official [hackathon FAQ](https://nearhackathon.com/#faq) says Claude Code and Codex screen whether projects run and match their README, with human judges making the decisions. The evidence links below let either reviewer follow implementation claims. They are not an invented scoring rubric or a guarantee of selection.

| Selected track | Fit | Deliberate boundary |
| --- | --- | --- |
| [NFTs That Do Something](https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/10-nfts.md) (`nfts`) | **NEP-171**, **dynamic NFTs**, and transferable **access rights** to campaign artwork | Offers share one hub. Each NFT is not a NEAR sub-account and does not own the original parties' money. |
| [Open Innovation](https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/13-open.md) (`open`) | A physical-advertising marketplace combines AI-assisted inventory, takeovers, creative ownership and inspectable settlement | AI does not independently establish dimensions, vehicle ownership, installation or exposure. |
| [Real-World Money](https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/08-realworld.md) (`realworld`) | USDC service payments, NEAR Intents authorization, bounded sponsorship, recoverable credits, native withdrawal and quoted Base routes | Local Sandbox qualification does not establish a public Base bridge or genuine physical service delivery. |

The track briefs offer example builds and suggested tools. Everywhere's fit is the implementation described here; it does not claim every example feature in those prompts. It does not claim Chain Signatures, an autonomous AI treasury, per-NFT sub-accounts, carbon credits or measured advertising impressions.

## What was built here

Everywhere develops the pre-existing **Pitboard** vehicle-sponsorship concept and takeover idea. This repository contains the Everywhere application, connected wallet flows, NEAR contracts, shared marketplace hub, AI-assisted editor and verification suites.

- The earlier static marketplace prototype begins at [46483c9](https://github.com/MihRazvan/near_hackathon/commit/46483c9).
- NEAR contract implementation begins at [ae3efa1](https://github.com/MihRazvan/near_hackathon/commit/ae3efa1).
- The current contract is [`contracts/marketplace-hub`](../contracts/marketplace-hub/); earlier campaign/factory crates remain labelled historical.

The commit history provides provenance. The original Pitboard idea is not presented as newly invented.

Development used Codex and Claude for AI-assisted implementation and review under team direction. Runtime photo/prompt inference uses the separately configured NEAR AI provider. The personal subscription companion is a private development feature, not a public shared credential. Original code is [MIT licensed](../LICENSE); [third-party assets](../prototype/public/ASSETS.md) keep their own licenses.

## What is verified and what remains

- **Application:** public marketplace, owner editor, campaign management, wallet sessions and recovery paths have executable tests.
- **Contract behavior:** current hub unit tests and real local-chain qualifications cover original-creditor accounting, NFT authority, fulfillment gates, disputes, payouts and withdrawal.
- **Source identity:** public macOS arm64 CI reproduces the exact deployed WASM. Linux tests source and executes the separately hash-checked deployed binary; it does not claim Linux source equality.
- **Mainnet:** recorded qualifications use real USDC transactions, final NFTs and synthetic artwork/delivery. Fresh historical checks depend on provider availability.
- **Physical pilot:** the team selected its Pitboard motorcycle and Everywhere branding. Real installation and evidence remain pending.

[Run the checks](../VERIFY.md) · [Inspect deployments and media provenance](DEPLOYMENTS.md) · [Demo placeholders and inspection route](DEMO.md)
