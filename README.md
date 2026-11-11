# Everywhere — advertise on everything

Everywhere connects people who have physical advertising space with people who want to advertise. The MVP starts with vehicles: owners describe or photograph a vehicle, edit its advertising surfaces, and publish a campaign with dates, prices and content rules. Advertisers discover spaces, book immediately and manage artwork and delivery from their workspace.

The application now uses persisted inventory, wallet authentication and real NEAR contract integrations. The frontend lives in `prototype/` for historical reasons; it contains the connected application.

Open the [live application](https://everywhere-near.vercel.app). The [public deployment manifest](deployments/mainnet.json) identifies the mainnet contract, pinned code and completed synthetic qualification campaign. That campaign exercised real payments and on-chain fulfillment records; no physical advertisement was installed.

## Try it in two minutes

Open **[Try a takeover](https://everywhere-near.vercel.app/experience)** and sign in with an existing EVM or NEAR wallet. Choose a prepared brand, book the example spot, trigger its competitor’s takeover, close booking, approve the example delivery, and claim the example payouts. The optional studio handoff moves creative authority while the original money destinations stay fixed. Progress resumes for the same wallet on the same browser.

Wallet authentication is real. This accelerated experience uses example money and does not request token funding, broadcast transactions or issue a visitor-owned NFT. It is separate from ordinary marketplace inventory and payments. There are no artificial waiting periods; two minutes is a visitor target, not a claim about wallet-provider response times.

Then open the **[recorded mainnet campaign](https://everywhere-near.vercel.app/records/e22dd301-786f-476c-af74-0df7cd2e6168)**. Its 11 transaction receipts cover actual 1¢/2¢ USDC purchases, takeover, NFT mint, artifact commitments, fulfillment, settlement and original-wallet payouts: **3¢ received, 3¢ withdrawn, zero pending**. The qualification used synthetic artwork and delivery evidence; no physical advertisement was installed. The creative-control handoff has separate real Sandbox coverage; it was not recorded in this V3 mainnet campaign. Funding came from pre-existing Intents balances, rather than a new Base bridge in that run.

The public record exposes current finalized state and a scoped receipt manifest, with explicit unavailable/mismatch states. Reproduce historical verification without keys or funds:

```sh
node backend/bin/verify-evidence.mjs
```

The [qualification manifest](deployments/qualification.json) binds the receipt hashes, original signed action meanings, actors, offer, token amounts, terms and artifact digests. The verifier re-reads finalized NEAR receipts and campaign state. The [machine-readable endpoint](https://everywhere-near.vercel.app/api/evidence/qualification) distinguishes historical receipt verification from its cached current-state check.

## Hackathon tracks

| Track | What the implementation demonstrates |
| --- | --- |
| **Open Innovation** (`open`) | Physical advertising rights with pre-production takeovers, original-payer refunds, completion rewards and independently inspectable settlement. |
| **Real-World Money** (`realworld`) | USDC payments and recoverable claims for advertising services, EVM signing through NEAR Intents, native withdrawals and quoted Base funding routes. |
| **NFTs That Do Something** (`nfts`) | A NEP-171 placement receipt controls who can submit artwork during the permitted window. Transfer changes that authority while financial creditors stay fixed. Approval locks the creative before printing. |

Everywhere develops the pre-existing **Pitboard** vehicle-sponsorship concept and takeover idea. This repository contains the Everywhere application, wallet integration, NEAR contracts, shared marketplace hub and verification suites. The earlier static marketplace prototype begins at [46483c9](https://github.com/MihRazvan/near_hackathon/commit/46483c9); NEAR contract implementation begins at [ae3efa1](https://github.com/MihRazvan/near_hackathon/commit/ae3efa1). The commit history shows the progression from prototype to connected platform; we do not present the earlier concept as newly invented.

## The campaign lifecycle

1. **List space.** Create a vehicle listing, review its surfaces, and set campaign dates and all-in prices including printing and installation. Takeovers can be enabled per surface.
2. **Book advertising.** Pay in USDC under the published rules. One buyer campaign can contain placements from multiple owners; each placement is booked independently.
3. **Take over before production.** An enabled takeover replaces the current advertiser before booking closes. Refunds and any conditional reward remain attached to the original payer.
4. **Receive the final placement right.** After booking closes, a NEP-171 NFT records the final placement right directly for the final payer, including an EVM wallet. Artwork authority can follow the NFT; financial claims remain with their original wallets.
5. **Deliver the campaign.** The advertiser submits artwork. The owner approves its exact revision, arranges printing and installation, and uploads evidence. Participants can open an on-chain issue before review ends; a separate arbiter resolves disputed cases.
6. **Settle and withdraw.** The background keeper can finalize success after service and review end when artwork is locked, installation evidence exists and no issue remains open. Owners and displaced advertisers claim their respective USDC credits and can withdraw through the supported wallet flows.

The NFT records a placement right, not ownership of the vehicle or proof that an advertisement was installed. Installation evidence is supplied by the owner and disputes require human judgment. The application does not invent impressions, GPS routes or measured exposure statistics.

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
