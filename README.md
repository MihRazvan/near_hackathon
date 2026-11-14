# Everywhere

<img src="docs/assets/banner.png" width="1600" alt="Everywhere. Advertise on everything. Pink and cobalt posters beside an illustrative vehicle advertisement." />

Everywhere turns physical advertising placements into transferable **NEAR NFT rights**. Start with a vehicle photo or description, edit the spots, and publish a campaign. Advertisers reserve space or take it over before production; the final placement NFT controls who can manage the artwork.

[Live platform](https://everywhere-near.vercel.app/) | [Demo video — coming soon](docs/DEMO.md#demo-video) | [Project brief](docs/PROJECT-BRIEF.md)

[Quickstart](#verify-in-5-minutes) | [User flow](docs/USER-FLOW.md) | [Technical architecture](docs/TECHNICAL-ARCHITECTURE.md) | [Contracts](docs/CONTRACTS.md) | [Verify](VERIFY.md) | [Docs](docs/README.md)

[![Verify submitted source](https://github.com/MihRazvan/near_hackathon/actions/workflows/verify.yml/badge.svg?branch=main)](https://github.com/MihRazvan/near_hackathon/actions/workflows/verify.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-2340ff.svg)](LICENSE)

---

## Problem first

Useful advertising space is already out there: a delivery van, a motorcycle, the car next door. Making that space available should be as straightforward as listing something on a marketplace.

The harder question is what happens **after someone pays**. Who controls the creative? Can another advertiser take over before printing? Who keeps the refund when a studio receives the artwork rights? What prevents payout before delivery and review?

Everywhere makes those rules part of the placement itself.

[![The actual Everywhere marketplace with vehicle campaigns and independently selectable advertising placements](docs/assets/marketplace.png)](https://everywhere-near.vercel.app/explore)

*Actual public interface. The team-run campaigns shown use generated vehicle references, real USDC and synthetic delivery; they do not represent installed ads.*

---

## Overview

- **List from a photo or a prompt.** NEAR AI proposes editable panels. Move, resize, reshape, duplicate or delete them, then choose dates, all-in prices and takeover rules.
- **Reserve or take over.** Advertisers book individual placements in USDC. Enabled takeovers replace the current advertiser before booking closes, preserving the displaced payer's refund and any conditional reward.
- **Own the creative right.** The final advertiser receives a NEP-171 placement NFT after booking closes. Transfer it to a studio and artwork authority follows the NFT; financial claims stay with their original wallets.

[![Everywhere's actual placement editor showing selectable and editable advertising panels on a van](docs/assets/editor.png)](docs/USER-FLOW.md#space-owner)

*Working frontend captured with an isolated editor fixture. No paid AI call, wallet connection or transaction was used for this screenshot.*

---

## The NFT is the control layer

A placement NFT carries **access rights to a real-world advertising surface for a defined campaign**. It is more than a collectible image: the contract checks the current holder before accepting artwork.

![NEP-171 transfer moves artwork authority from advertiser to studio. Refunds, rewards and earnings stay with their original creditors.](docs/assets/nft-rights.png)

**Dynamic NFTs:** each artwork revision updates the NFT's IPFS reference and content hash. Owner approval locks that exact revision for production. Approval or the artwork deadline ends editing; transferring an archival NFT cannot reopen it.

The NFT is neither vehicle ownership nor proof of installation. Each offer lives in a shared hub rather than a separate sub-account. Money deliberately stays with the original wallets so handing creative work to a studio cannot hand it somebody else's refund or earnings.

[Inspect the recorded mainnet NFT handoff](https://everywhere-near.vercel.app/records/aa80efd3-472d-4e64-b8f8-fec738d2d3e2) | [Read the authority and accounting rules](docs/CONTRACTS.md)

---

## How it works

![Campaign flow: scan or describe, reserve or take over, receive the final NFT, approve artwork, install and run, then claim and withdraw](docs/assets/lifecycle.png)

1. **Space owner:** review the vehicle's spots and publish fixed campaign dates. Prices include printing and installation.
2. **Advertiser:** reserve a placement or take it over under the published rules before booking closes.
3. **Final NFT holder:** submit artwork or transfer creative control to a studio during the editing window.
4. **Space owner:** approve the exact revision, arrange installation and submit evidence. Participants can raise an issue; a separate arbiter resolves disputes.
5. **Settlement:** after service and review end, fulfillment gates permit success. Original creditors claim their USDC and withdraw through the supported wallet flows.

One buyer campaign can contain placements from multiple owners; each placement remains independently booked and accounted for. [Follow both sides of the platform](docs/USER-FLOW.md).

---

## Tech stack

| Layer | Technology | What it does |
| --- | --- | --- |
| Placement rights and settlement | **Rust, NEAR SDK, NEP-171** | Shared-hub offer accounting, takeovers, dynamic NFTs, artwork and fulfillment gates |
| Wallets and payments | **NEAR Intents, ERC-191, NEP-413** | EVM-signed actions, native NEAR sessions, USDC credits and original-wallet payouts |
| Cross-chain funding | **Base USDC + 1Click** | Quoted funding/return routes and delivery reconciliation |
| Vehicle setup | **NEAR AI** | Photo analysis, generated references and editable panel suggestions |
| Media | **IPFS, SHA-256, sharp** | Public-content consent and verified artwork/evidence bytes |
| Application | **JavaScript ES modules, Vite, Node.js, SQLite** | Responsive frontend, durable API, sessions, operation journals and recovery |
| Qualification | **Node tests, Rust tests, Playwright, axe-core, NEAR Sandbox** | Clean-checkout checks and a real local-chain interface lifecycle |

[![Architecture: wallet-approved actions pass through the application to NEAR Intents and the shared marketplace hub; AI and media remain off-chain services](docs/assets/architecture.png)](docs/TECHNICAL-ARCHITECTURE.md)

The UI and inventory are off chain. Rights, creditor accounting and settlement rules are enforced on NEAR. The hub retains an upgrade key; physical evidence and disputes still require human judgment. [Trust boundaries and source map](docs/TECHNICAL-ARCHITECTURE.md#trust-boundaries).

---

## Hackathon tracks

| Track | Implemented contribution | Inspect |
| --- | --- | --- |
| **NFTs That Do Something** (`nfts`) | NEP-171 ownership, dynamic metadata and transferable creative access rights, with original-creditor separation | [NFT behavior](docs/CONTRACTS.md#nft-authority) |
| **Open Innovation** (`open`) | Physical advertising rights, pre-production takeovers and independently inspectable campaign settlement | [Project brief](docs/PROJECT-BRIEF.md) |
| **Real-World Money** (`realworld`) | USDC service payments, recoverable claims, EVM authorization through Intents and native withdrawals | [Payment path](docs/TECHNICAL-ARCHITECTURE.md#payment-and-recovery) |

[Track briefs and evidence map](docs/PROJECT-BRIEF.md#hackathon-fit). These are implementation claims with linked checks, not claims of completed physical delivery.

---

## Verify in 5 minutes

Use **Node.js 22.23+** and npm. No wallet, API key or funds are needed:

```sh
node scripts/verify.mjs
```

Expected: locked dependencies install; **257 backend, 97 frontend and 17 verification tests** pass; wallet/frontend builds succeed; an isolated local API passes its smoke checks and stops. Counts describe the current qualification; the actual report is authoritative. Fresh dependency downloads require network access.

```sh
node scripts/verify.mjs --offline  # Checks committed hashes without dependencies or network.
npm start --prefix backend        # After the quick build: opens the app on port 4318.
```

Open **http://127.0.0.1:4318**. A fresh checkout has an empty workspace and execution disabled. Use the [hosted marketplace](https://everywhere-near.vercel.app/explore) for populated inventory. AI and real publication/payments require configured services; they are not enabled by the quick check.

The [public CI](https://github.com/MihRazvan/near_hackathon/actions/workflows/verify.yml) checks Node 22.23/24.12, desktop/mobile UI and accessibility, exact deployed-WASM reproduction on macOS arm64, and a Linux local-chain lifecycle using the hash-checked deployed binary. The lifecycle covers **32 checks and 23 genuine EVM signatures**, including a rejected former-holder request and a matching successful current-holder request, with zero terminal liabilities or pending withdrawals.

[All verification modes, commands and boundaries](VERIFY.md) | [Pinned source rebuild](BUILD.md)

---

## Deployments and evidence

| Record | What to inspect |
| --- | --- |
| [Shared mainnet hub](https://nearblocks.io/address/8a97f02b08b964bb618031529dfacf8cb4f922ddc646ef525c4d68355f81be20) | Contract shared by independently accounted placements; [deployment manifest](deployments/mainnet.json) |
| [Completed mainnet qualification](https://everywhere-near.vercel.app/records/e22dd301-786f-476c-af74-0df7cd2e6168) | Purchase, takeover, final NFT, synthetic delivery and original-wallet payouts |
| [Van NFT handoff](https://everywhere-near.vercel.app/records/aa80efd3-472d-4e64-b8f8-fec738d2d3e2) | Creative control transferred to a studio; financial creditors retained |
| [Seven published team offers](deployments/team-campaigns.json) | Motorcycle, hatchback and van placements, plus a completed cargo-bike campaign |

Recorded payments are real. Artwork/delivery evidence is synthetic, and **no physical installation is claimed**. The genuine motorcycle pilot is pending installation and evidence. Historical receipt availability can limit fresh RPC verification; offline hash checks do not prove current chain state. [Full deployment status, campaigns and limitations](docs/DEPLOYMENTS.md).

---

## Documentation

[Project brief](docs/PROJECT-BRIEF.md) · [User flow](docs/USER-FLOW.md) · [Technical architecture](docs/TECHNICAL-ARCHITECTURE.md) · [Contracts](docs/CONTRACTS.md) · [Verification](VERIFY.md) · [Build](BUILD.md) · [Deployments](docs/DEPLOYMENTS.md) · [Demo & submission links](docs/DEMO.md) · [Docs index](docs/README.md)

Everywhere develops the pre-existing **Pitboard** sponsorship concept and takeover idea. The [project brief](docs/PROJECT-BRIEF.md#what-was-built-here) identifies the new implementation and commit history. Development used Codex and Claude under team direction; runtime AI uses the separately configured NEAR AI service. The private personal subscription companion stays on its owner's computer.

Original code is licensed under [MIT](LICENSE), copyright Everywhere contributors. Third-party assets and dependencies retain their licenses: [application asset credits](prototype/public/ASSETS.md), [documentation visual provenance](docs/assets/README.md), [backend lockfile](backend/package-lock.json), [frontend lockfile](prototype/package-lock.json), [Rust lockfile](Cargo.lock).

Built for [NEAR HACKATHON](https://nearhackathon.com/).
