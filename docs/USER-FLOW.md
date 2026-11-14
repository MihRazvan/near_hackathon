# User flow

[Overview](../README.md) | [Project brief](PROJECT-BRIEF.md) | [Architecture](TECHNICAL-ARCHITECTURE.md) | [Contracts](CONTRACTS.md) | [Verify](../VERIFY.md) | [Docs](README.md)

Marketplace is for finding and booking space. Owners manage listings in Dashboard; a new owner starts with a first-campaign prompt. Profile holds the connected wallet's reservations, NFTs, saved spaces and money.

![Owner and advertiser campaign lifecycle](assets/lifecycle.png)

## Space owner

1. Open [photo setup](https://everywhere-near.vercel.app/host/assets/new?mode=photo), send a photo through the private phone-capture link, or [describe a vehicle](https://everywhere-near.vercel.app/host/assets/new?mode=describe). Sign in with a supported wallet. A description can generate a labelled reference image.
2. Review the panel outlines AI proposes. Click a spot to edit its name or shape, drag it, resize it, or edit individual corners. Draw and duplicate spots; Delete/Backspace remove a selected spot outside text fields, and Undo/Redo recover changes. Add separate photos for the left, right, front, rear or top. Each spot belongs to its own photo; selecting it opens that view. AI edits apply only to the current view. The owner confirms dimensions before production.
3. Choose the operating area, fixed campaign dates and prices including printing/installation. Set a sale-wide takeover default and per-spot overrides. Private vehicle and campaign drafts allocate no NEAR.
4. Approve public IPFS storage for the vehicle photos, review the terms and approve publication in your wallet. Photos stay private until that approval; published photo references and spot-to-photo bindings are part of the committed listing manifest. Each placement is independently bound to an offer in the shared hub. The sponsor pool can cover eligible publication costs within its configured limits. Other publications require payment.
5. Use the dashboard to follow artwork and installation tasks. Approve the exact artwork revision, arrange printing and installation, then upload evidence before the relevant deadlines.
6. After service and issue review close, the contract checks the delivery requirements before settlement. Claim available earnings and withdraw through the supported wallet path. Unused offer reserves can be reclaimed by their original funder after all obligations settle.

![The actual placement editor using a controlled documentation fixture](assets/editor.png)

*The working editor with fixture data. This capture made no paid AI call or publication.*

## Advertiser

1. Browse [Marketplace](https://everywhere-near.vercel.app/explore), choose a vehicle and select a placement directly on its photo or in its placement list. Dates, the all-in price and booking/takeover availability belong to that specific offer.
2. Connect a wallet, review the fixed dates and price, acknowledge the rules, and reserve the spot. No campaign name or budget is required for a single reservation. The optional ad group control organizes the buyer's own reservations; it cannot edit the owner's offer. Artwork is reviewed later.
3. Approve the USDC payment and required signatures in your wallet. Funding from Base needs a quote. The application starts top-ups at 0.15 USDC; any amount above the reservation shortfall stays in the wallet’s spending balance. The quote separates the top-up, routing cost and reservation price. Base gas is separate. Sign-in alone never authorizes spending.
4. Follow the reservation and payment status in Profile. An optional ad group can contain reservations across multiple owners, with independent terms and payments. Its budget is a private spending limit. An ordinary reservation uses an internal group capped at the exact quoted price.
5. After booking closes, the final payer receives the NFT directly. EVM payers receive it too. Submit artwork or transfer creative control to a studio during the editing window.
6. Inspect owner-submitted evidence, raise an issue when appropriate, and claim any original-wallet refund/reward. Settlement and withdrawal follow the recorded creditor and original operation.

![An actual vehicle page with independently selectable placements and reservation/takeover actions](assets/listing.png)

*Public team-test listing. The generated reference image is not installation evidence, and its payments use real USDC.*

## Creative studio / NFT recipient

The current holder sees the placement in their wallet's placement rights. Transferring the NFT grants artwork authority to the new holder and removes it from the former holder. A studio can submit or revise artwork before owner approval or the artwork deadline. Each accepted revision changes the NFT metadata reference and hash.

![NFT creative rights and original-wallet financial claims](assets/nft-rights.png)

Approval fixes an exact revision for production. Editing also ends at the artwork deadline. A later archival transfer does not reopen that window. Refunds, conditional takeover rewards and owner earnings do not follow the NFT. [Exact rules and tests](CONTRACTS.md#nft-authority).

## Campaign arbiter

Participants can raise an on-chain issue during the permitted window. An unresolved issue blocks automatic success. The campaign's designated, separate arbiter reviews the evidence and signs its decision. Settlement also checks the service and review periods and the delivery requirements. A failed campaign refunds the entitled original payers.

The hash identifies the submitted file. The arbiter decides whether that evidence shows the agreed delivery.

## Rejection and recovery

| Situation | Platform behavior |
| --- | --- |
| Wallet request rejected before sending | The user can retry; rejection before sending leaves the action unsubmitted. |
| Send response lost, page reloaded or API restarted | The durable journal reconciles the original operation before offering a new transfer. |
| A different wallet connects | Sessions, placement authority and financial credits follow the connected identity. |
| NFT transferred away | Former-holder artwork actions are rejected by the hub; financial credits remain unchanged. |
| Provider check unavailable | The UI labels recorded data and any failed attempt to check current state. |
| Media/AI provider unavailable | Manual editing remains usable; interrupted inference is not automatically retried as a second paid job. |

The [Sandbox interface scenario](../prototype/tests/production-browser.mjs) runs the lifecycle on a local NEAR chain with genuine signatures. Its wallet UI is injected and its media transport is synthetic. It also tests a former holder's direct signed request against a matching successful request from the current holder. [Coverage and limits](../VERIFY.md#full-interface-on-a-local-chain).
