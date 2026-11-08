# Marketplace experience research

Checked **8 November 2026**. This is product research for a design discussion. Proposed behavior is explicitly separate from features already implemented in Pitboard or the NEAR proof repository.

## Product direction

Build a two-sided marketplace for physical advertising inventory, with self-service owner onboarding and a campaign workspace for buyers. The public vehicle page retains Pitboard's visual spot selection, but the product also covers discovery, authoring, scheduling, purchasing, creative approval, physical delivery and settlement.

Use **buyers** and **space owners** in planning. In advertising, “advertiser” commonly means the business purchasing an ad, whereas the user's description also uses it for the seller. Public calls to action can avoid that ambiguity: **Find ad space** and **List your space**. A person or business may do both through one account.

## What comparable products teach us

These are workflow references, not evidence that our proposed mechanism is novel or that those products implement it.

| Reference | Observed workflow | Recommendation for this project |
|---|---|---|
| [AdQuick marketplace](https://www.adquick.com/marketplace) and [outdoor advertising guide](https://www.adquick.com/outdoor-advertising) | Inventory discovery sits inside a broader campaign planning, purchase and measurement workflow. | Marketplace cards should lead to a visual asset page; buyers also need a campaign that groups several purchases. |
| [AdQuick API workflow](https://docs.adquick.com/index.html) | Advertiser records, campaign planning, selected inventory, creative records and reporting are separate concepts. | Keep buyer campaign, placement booking and creative revision distinct. A successful payment does not mean the ad is installed. |
| [AdQuick media-owner product](https://www.adquick.com/media-owners) | Owner operations include availability, holds, date conflicts, contract records and proof of posting. | The owner dashboard needs an action queue and a calendar, as well as revenue charts. |
| [Passionfroot onboarding](https://help.passionfroot.me/en/articles/11552627-day-1-with-passionfroot) | Owners build a storefront, add products, disclose rates and availability, and publish a shareable page. | Separate the reusable asset and its spots from the dated sale offered to buyers. Provide both marketplace discovery and direct links. |
| [Passionfroot collaboration flow](https://help.passionfroot.me/en/articles/11552787-the-collaboration-flow) | Booking, creative exchange and payment have distinct steps with notifications. The help article also flags a retired content-proposal feature. | Keep a task-oriented placement workspace. Adapt the underlying stages rather than copying every screen from a changing product. |
| [Carvertise owner/driver onboarding](https://carvertise.com/for-drivers) | Location, vehicle and driving habits feed campaign matching. Installation and removal are explicit parts of fulfillment. | Vehicle photos alone are not a complete listing. Include coverage area, availability, installation responsibility and removal terms. |
| [Carvertise installation agreement](https://carvertise.com/wp-content/uploads/2023/10/General_CarvertiseWrap-ShopAgreement_2023.pdf) | Installer work is tied to campaign specifications and a mock-up. This is a historical operational example, not current pricing or a template for our terms. | A production proof needs its own approval and lock milestone, separate from a promotional AI preview. |
| [AdQuick reporting documentation](https://docs.adquick.com/reports) | Booking records, delivery and exposure reporting have different data and methodology. Some delivery reporting is estimated or reconciled later. | Separate measured product activity, owner-declared activity and exposure estimates. Avoid an unlabeled “impressions” number. |
| [W3C multi-page forms](https://www.w3.org/WAI/tutorials/forms/multi-page/) and [form notifications](https://www.w3.org/WAI/tutorials/forms/notifications/) | Long tasks benefit from logical stages and clear progress; submission results and errors need understandable feedback. | Give creation a resumable wizard, preserve entered data, and provide specific next actions for failed generation, uploads and checkout. |

## Existing work worth carrying forward

### Pitboard

The local `pitboard` repository is primarily one public motorcycle page, interactive spot selection, a recoverable checkout and a small operator view. Its existing patterns include wallet connection, brand/artwork intake, token selection, transaction progress, a “Your spots” area, takeover explanations and a physical production timeline. The public page explicitly says takeovers close before design approval and printing.

Useful product patterns: a hero that makes the physical inventory tangible; clickable surface geometry with a parallel list; persistent selected-spot details; a complete price and period summary; artwork previews; saved payment progress; and a readable status timeline.

The expanded product needs additional architecture around that page: searchable inventory, several owners and assets, seller authoring, dated sales, buyer campaign management, creative collaboration, physical proof, payouts and exception handling. Pitboard's current implementation status must not be inferred from its aspirational copy; its README describes limits on takeovers and returns.

### NEAR proof repository

There is substantial contract and payment qualification work. In particular, the prior mainnet session confirmed a purchase and qualified a second-wallet takeover path in tests and a mock browser. Those facts do not constitute a complete marketplace application.

Important limits for the design discussion:

- The contract proof is **one current position per storefront instance**. A public asset page with several independently bookable spots needs an inventory layer and a deliberate deployment/aggregation design.
- Takeover economics are fixed in the proof. Owner-selectable takeover mode, configurable prices and multiple sale periods are product work, not existing settings we can simply display as functional.
- Existing contracts enforce financial and artwork authority; they do not establish legal vehicle ownership, installation, actual driving or ad exposure.
- The current final-placement NFT path for an Intents buyer requires nomination and acceptance by a native NEAR recipient. A seamless “receive the pass” flow needs additional onboarding work. The mock must include the necessary delivery-wallet state rather than assuming every EVM account receives a native NFT directly.
- Physical success/failure currently uses an explicit arbiter. The product needs a visible review/dispute process and defined commercial policy before live delivery can depend on it.
- Some READMEs and early proof notes contain historical counts or superseded statements. The technical baseline should reconcile those claims before it is presented as current implementation documentation.

## Recommended product decisions

### Public first, identity when an action requires it

Let visitors browse and inspect spaces without an account or wallet. Preserve the selected listing, spots, campaign and uploaded work through sign-in. Use one account with buyer and owner areas. Connect wallets when paying, claiming or doing an action that requires wallet authority; keep the active payer visible. Connecting an app account and proving control of a payment wallet are different tasks.

For the mock, use explicit sample personas and simulated wallets. The production authentication choice remains open. A future email or passkey login must not be presented as a working custody or signature solution simply because the mock contains its screen.

### Model time before adding an auction

Recommendation: an owner publishes a sale for a stated service period. A physical spot may be sold at a fixed price or allow takeovers **before a closing time**. Artwork is finalized and production starts afterward. A running physical campaign is not displaced by a new bid. The owner may create another sale for a later period without drawing the asset again.

The close time, artwork due date, production/installation window, service start/end and settlement milestones are distinct. Represent them in both public details and private timelines. If the user chooses continuously replaceable advertising instead, it needs a different physical fulfillment and cost model; do not silently use digital-screen assumptions for stickers.

### Keep multiple placements manageable

Recommendation: a buyer campaign groups placements across owners. For the initial real implementation, each placement can retain a separate payment and fulfillment status. A campaign builder and shortlist need not promise one atomic cross-owner cart. The mock should show partially purchased, partially displaced and partially delivered campaigns, as well as the ideal case.

### Preserve the takeover, make its consequences explicit

A paid holder is provisional until the stated close. A takeover replaces that holder and creates the original payer's credit. Show the displaced buyer what happened, what money is available, what reward is conditional, and how to choose another space or re-enter at the current price.

Under the current proof economics, a displaced principal becomes available while the additional 10% stays conditional until the matching refund exposure ends. Example: for a 100-USDC principal, show **100 USDC available** and **10 USDC conditional** in separate rows. This is a product illustration, not a guaranteed profit or current live price. Native settlement, withdrawal and a later conversion back to the source chain are separate states.

Takeover-off means the accepted booking cannot be displaced during that sale. Make this an understandable listing badge and explain the difference before payment. Published funded terms, dates and surface geometry should not be silently editable.

### Make creation impressive and correctable

Owner entry points: photograph/upload the actual vehicle, continue capture on a phone, or describe a make/model. AI suggests an editable inventory draft. A text-generated image is labeled a concept; it does not become evidence of the actual vehicle or production dimensions. Require actual photos and physical details before a real listing becomes eligible to accept payment.

The essential editor is a photo-based surface editor with selectable shapes, labels and manual corrections. Guided capture, prompt revisions and a curated 3D preview can improve the experience. They should share the same saved asset and draft. Do not block publishing on arbitrary-vehicle 3D reconstruction or represent projected artwork as a print-ready wrap template.

### Make fulfillment part of the product

The owner needs to accept or request changes to permitted artwork, finalize an approved production revision, arrange installation under the selected policy, upload proof and manage problems. The buyer needs to see the same milestones, review evidence and report a delivery issue. Content review cannot become a hidden way to pick a different financial winner after accepting payment.

Printing, installation and removal costs need a visible owner and price treatment. The user has been asked to choose the initial responsibility model. Any printable production package must use verified dimensions and approved revisions; the prototype's vehicle visualization alone is insufficient.

### Make the dashboards useful without fabricated measurement

Buyer summary: booked and active placements, campaign spend, next creative/proof task, displaced bookings and credits. Owner summary: published inventory, occupied spots for a period, pending approvals, installation tasks, held proceeds and available payouts.

List views and dashboard counters should reconcile with the underlying sample bookings. QR scans or landing-page visits can be measured if implemented. Declared mileage stays labeled as declared. Geographic coverage is approximate public information; private addresses and precise travel traces do not belong on a public listing.

## What the mock should settle

The designer should be able to understand the complete information hierarchy, page content, actions, role permissions, navigation and responsive behavior. The mock should also answer what happens after payment, after takeover, after the close, after an artwork rejection and after a physical failure.

We should review the full experience once, then build coherent vertical slices against that agreed map. New contract or payment integrations come after the product semantics are stable. See the page inventory and decision log in [the experience map](experience-map.md).
