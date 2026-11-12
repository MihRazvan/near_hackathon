# Everywhere: advertise on everything

Everywhere connects people who have physical advertising space with people who want to advertise. The MVP starts with vehicles: owners describe or photograph a vehicle, edit its advertising surfaces, and publish a campaign with dates, prices and content rules. Advertisers discover spaces, book immediately and manage artwork and delivery from their workspace.

Each final placement becomes a NEAR NFT whose owner controls artwork during the permitted window. A studio can receive that NFT and take over the creative without changing the original financial claims.

The application uses persisted inventory, wallet authentication and real NEAR contract integrations. The frontend lives in `prototype/` for historical reasons; it contains the connected application.

Open the [live application](https://everywhere-near.vercel.app). The [public deployment manifest](deployments/mainnet.json) identifies the mainnet contract, pinned code and completed synthetic qualification campaign. That campaign exercised real payments and on-chain fulfillment records; no physical advertisement was installed.

## Try the interactive example

Open **[Try a takeover](https://everywhere-near.vercel.app/experience)** and sign in with an existing EVM or NEAR wallet. Choose a prepared brand, book the example spot, trigger its competitor's takeover, close booking, approve the example delivery, and claim the example payouts. The studio handoff transfers the example placement NFT and its artwork authority. Payment claims stay with their original wallets. You can also keep creative control yourself. Progress resumes for the same wallet on the same browser.

Wallet authentication is real. This accelerated experience uses example money and does not request token funding, broadcast transactions or issue a visitor-owned NFT. It is separate from ordinary marketplace inventory and payments. The example has no waiting periods. Allow about two minutes after wallet sign-in.

Then open the **[recorded mainnet campaign](https://everywhere-near.vercel.app/records/e22dd301-786f-476c-af74-0df7cd2e6168)**. Its 11 transaction receipts cover actual 1¢/2¢ USDC purchases, takeover, NFT mint, artifact commitments, fulfillment, settlement and original-wallet payouts: **3¢ received, 3¢ withdrawn, zero pending**. The qualification used synthetic artwork and delivery evidence; no physical advertisement was installed. The creative-control handoff has separate real Sandbox coverage; it was not recorded in this V3 mainnet campaign. The run used pre-existing Intents balances. It did not include a new Base bridge.

The public record exposes current finalized state and a scoped receipt manifest, with explicit unavailable/mismatch states. Reproduce historical verification without keys or funds:

```sh
node backend/bin/verify-evidence.mjs
```

The [qualification manifest](deployments/qualification.json) binds the receipt hashes, original signed action meanings, actors, offer, token amounts, terms and artifact digests. The verifier re-reads finalized NEAR receipts and campaign state. The [machine-readable endpoint](https://everywhere-near.vercel.app/api/evidence/qualification) distinguishes historical receipt verification from its cached current-state check.

## The NFT thesis

A placement NFT is a transferable, time-bounded right to manage the creative for a specific physical advertising surface and campaign. The owner can submit or replace artwork before approval and the artwork deadline. Transfer the NFT to a creative agency and that agency gains the authority; the former owner loses it. Original-payer refunds, takeover rewards and owner earnings retain their original creditors.

Submitting a new artwork revision updates the NFT metadata's IPFS reference and content hash. The space owner approves that exact revision before printing. Approval or the artwork deadline closes editing, and the NFT remains a campaign record afterward. A later archival transfer cannot reopen the creative window. Artwork submission and transfers use the existing marketplace contract.

The short interactive experience puts the NFT handoff in its main path. The public mainnet records show minted NFTs and artwork commitments. The Berlin van also records a real mainnet NFT handoff to a studio; the setup verified former-controller rejection, new-controller artwork submission and unchanged financial credits. The real Sandbox qualification covers the same authority boundary. The physical motorcycle pilot remains pending real installation and evidence.

## Hackathon tracks

| Track | What the implementation demonstrates |
| --- | --- |
| **NFTs That Do Something** (`nfts`) | A NEP-171 placement NFT controls who can submit artwork during the permitted window. Transfer changes that authority while financial creditors stay fixed. Artwork revisions update its reference; approval locks the creative before printing. |
| **Open Innovation** (`open`) | Physical advertising rights with pre-production takeovers, original-payer refunds, completion rewards and independently inspectable settlement. |
| **Real-World Money** (`realworld`) | USDC payments and recoverable claims for advertising services, EVM signing through NEAR Intents, native withdrawals and quoted Base funding routes. |

Everywhere develops the pre-existing **Pitboard** vehicle-sponsorship concept and takeover idea. This repository contains the Everywhere application, wallet integration, NEAR contracts, shared marketplace hub and verification suites. The earlier static marketplace prototype begins at [46483c9](https://github.com/MihRazvan/near_hackathon/commit/46483c9); NEAR contract implementation begins at [ae3efa1](https://github.com/MihRazvan/near_hackathon/commit/ae3efa1). The commit history shows the progression from prototype to connected platform; we do not present the earlier concept as newly invented.

## The campaign lifecycle

1. **List space.** Create a vehicle listing, review its surfaces, and set campaign dates and all-in prices including printing and installation. Takeovers can be enabled per surface.
2. **Book advertising.** Pay in USDC under the published rules. One buyer campaign can contain placements from multiple owners; each placement is booked independently.
3. **Take over before production.** An enabled takeover replaces the current advertiser before booking closes. Refunds and any conditional reward remain attached to the original payer.
4. **Receive the final placement right.** After booking closes, a NEP-171 NFT records the final placement right directly for the final payer, including an EVM wallet. Artwork authority can follow the NFT; financial claims remain with their original wallets.
5. **Deliver the campaign.** The advertiser submits artwork. The owner approves its exact revision, arranges printing and installation, and uploads evidence. Participants can open an on-chain issue before review ends; a separate arbiter resolves disputed cases.
6. **Settle and withdraw.** The background keeper can finalize success after service and review end when artwork is locked, installation evidence exists and no issue remains open. Owners and displaced advertisers claim their respective USDC credits and can withdraw through the supported wallet flows.

The NFT records the right to manage a placement's artwork. Vehicle ownership and installation evidence are separate. Installation evidence is supplied by the owner and disputes require human judgment. The application does not invent impressions, GPS routes or measured exposure statistics.

## Why NEAR

| Component | Role |
| --- | --- |
| Shared NEAR marketplace hub | Separate offer accounting, takeover rules, escrow credits, final placement NFTs, artwork commitments and fulfillment/issue gates in one contract. |
| NEAR Intents | EVM-signed purchases and authorized owner/advertiser actions, plus USDC balances and original-wallet payouts. |
| Base USDC and 1Click | Quoted funding and return routes for Base wallets, with transaction and delivery reconciliation. |
| Native NEAR wallets | NEP-413 sign-in and wallet-signed contract/token actions through the NEAR wallet connector. |
| Persistent API and SQLite | Inventory, buyer campaigns, wallet sessions, media records, conversations, operation journals and recovery. |

Customers approve signatures and transfers in their own wallets. Wallet sign-in alone does not authorize spending. The app reconciles an interrupted transaction against its original recorded operation before offering another transfer.

The hub currently retains an upgrade key. Keep hub administration and that key local, separate from the hosted relayer account. Backend code-hash pinning detects a changed deployment; it does not make the contract immutable.

## Run locally

Requires **Node.js 24.12 or newer** and npm. From the repository root:

```sh
npm ci --prefix backend --ignore-scripts
npm ci --prefix prototype --ignore-scripts
npm run build:lab --prefix backend
npm run build --prefix prototype
npm start --prefix backend
```

Open **http://127.0.0.1:4318**. The backend serves the compiled frontend, wallet adapter and `/api` together. Startup without execution credentials provides a read-only marketplace. Publication, payments, public artifact storage and optional AI require their configured services; the isolated Sandbox browser suite below provides a complete local execution environment without public funds.

See [backend setup](backend/README.md), [frontend development](prototype/README.md), [hub contract](contracts/marketplace-hub/README.md) and [local-chain proofs](proofs/sandbox/README.md).

## Verify

```sh
npm test --prefix backend
npm test --prefix prototype
npm run build --prefix prototype
node prototype/tests/startup-browser.mjs
node prototype/tests/judge-browser.mjs
```

The judge browser suite uses isolated API fixtures for desktop/mobile layouts, example isolation, wallet-scoped progress, evidence outages and retries. It does not claim actual wallet or mainnet execution.

The [production browser qualification](backend/README.md#production-interface-on-near-sandbox) runs the actual interface against a real isolated NEAR Sandbox, the compiled shared hub and the pinned Intents verifier. It covers an unfunded EVM owner, publication, distinct buyers, takeovers, rejected signatures, restart recovery, automatic NFT minting, EVM creative-control transfer and former-controller rejection, fulfillment, disputes, settlement, exact payouts and native USDC withdrawal.

Its injected EIP-1193 wallet shell produces real signatures; it does not automate a real extension's approval UI. Media-provider HTTP is isolated while the actual upload/digest verification runs. Native arbiter actions use the authenticated API and real signatures. Base routing and real pinning-provider availability require separate provider qualification.

## AI and hosting

Manual description/photo onboarding and surface editing are the default. An optional server API provider can propose editable surfaces. The private personal AI companion connects only its owner's allowlisted wallets to that owner's locally authenticated ChatGPT connection; subscription credentials stay on the owner's computer and are not shared with public visitors.

Production uses the [Docker image](Dockerfile) and [Railway configuration](.railway/railway.ts), one application instance and a persistent SQLite volume. Configure HTTPS origins and server secrets explicitly. A static frontend deployment also needs the API and wallet-adapter routes; the frontend build alone does not provide the application backend. Deployment configuration is described in the [backend README](backend/README.md#production-hosting).

Personal wallet keys, local credentials, state databases and generated qualification evidence are excluded from the repository.

## Physical motorcycle pilot

The team has selected its Pitboard motorcycle and Everywhere branding for a genuine pilot. The [prepared owner draft](https://everywhere-near.vercel.app/host/assets/new?pilot=motorcycle) includes editable Honda CBR600F2 details and downloadable outlined vector artwork. Nothing is automatically saved, published, paid or installed. The owner must confirm the actual motorcycle details, permitted panel, dimensions, city, schedule and printing requirements, upload a current photo, and later supply real installation evidence. The draft artwork has no promised physical print size. Until those steps happen, the public qualification remains explicitly synthetic.

## Team-run vehicle campaigns

Team-test listings use AI-generated vehicle references and nominal real USDC payments on the shared mainnet hub. The listing purpose and image provenance are committed in the published terms. Cards, checkout and public records label these campaigns; checkout requires acknowledgement that no physical advertising will be delivered. Synthetic delivery evidence stays separate from a genuine installation. The four generated reference covers and their prompts are credited in [ASSETS.md](prototype/public/ASSETS.md).


| Vehicle | Current setup | Open |
| --- | --- | --- |
| Bucharest sport motorcycle | Side fairing and tail panel, each starting at 1¢ USDC; tail panel uses fixed booking | [Listing](https://everywhere-near.vercel.app/spaces/0627cf2a-28ad-4952-a16f-6b9fdfdbbe87?sale=2c541941-6d2f-4cf2-8cad-375cf4ad43ff) |
| Lisbon blue hatchback | Door-panel takeover starts at 2¢; independent rear door starts at 1¢ | [Listing](https://everywhere-near.vercel.app/spaces/7aec3544-317c-494c-adc2-cab5d510aa17?sale=59fca18a-6594-4591-a241-593c2604d76e) |
| Berlin workshop van | Cargo-panel NFT transferred to studio, studio artwork submitted; independent cab door starts at 1¢ | [NFT record](https://everywhere-near.vercel.app/records/aa80efd3-472d-4e64-b8f8-fec738d2d3e2), [cab-door listing](https://everywhere-near.vercel.app/spaces/3918c8f2-3263-4dfa-971e-02d6d13a6af3?sale=dc7a970a-a0b9-4664-8f7b-e4845a71c007&spot=spot-2) |
| Amsterdam cargo bicycle | Successful synthetic delivery: 3¢ received, 3¢ paid out, zero pending | [Public record](https://everywhere-near.vercel.app/records/fbc318d7-414a-4a2f-ab26-5270c4d7f905) |

Booking remains open for the motorcycle, hatchback and van cab door until **November 19, 2026, 12:00 UTC**, subject to their live on-chain state. Their service and review dates are published on each listing. The van's artwork window remains open until approval or its published deadline. The cargo bicycle's short campaign has completed. All four listings belong to dedicated team test wallets; the physical motorcycle pilot above is separate.

The motorcycle, hatchback and van each have two published placements. The cargo bicycle has one completed placement. Compatible offers are grouped on the vehicle page; selecting a placement keeps its original sale, terms, price, contract and checkout. Each additional surface is published as its own offer.

The [team campaign manifest](deployments/team-campaigns.json) records seven published offers across the four vehicles, generated-image digests, setup transaction hashes, van NFT transfer and cargo-bike payouts. It excludes automatic keeper mint, finalization and reserve-reclaim transaction hashes that were not captured in that setup journal. The [NFT handoff transaction](https://nearblocks.io/txns/DbHN9bSg6J2Q72ocWBUjMnEsk7VSTy5btqm7W63crMdB) is separately verifiable from its signed action and NEP-171 transfer event. Historical before/after financial-credit samples are recorded observations.

Run the read-only verifier without keys or funds:

```sh
node backend/bin/verify-team-campaigns.mjs
```

It checks the pinned mainnet hub, all seven published offer bindings, the three additional placement creation receipts, current NFT ownership and artwork reference, the historical van handoff, the completed cargo-bike accounting, and both original-creditor payout transactions. Listing availability and NFT ownership can change after this setup as participants use the platform. These campaigns used existing Intents USDC balances; they did not require a new Base bridge or deploy another contract.
