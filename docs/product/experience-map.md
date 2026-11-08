# End-to-end experience and page inventory

Version 0.4 · **8 November 2026** · **Eight core decisions confirmed; remaining UX proposed for full-flow review**

This maps the complete product for a navigable mock and a designer handoff. The routes are proposed destinations, not a chosen framework, implemented API or promise that the existing contracts support every behavior. Several destinations share a layout. Tabs, dialogs and states are specified separately so “every page” does not become a collection of disconnected static screens.

## 1. Product vocabulary and actors

Public positioning: **Advertise on everything. Start with vehicles.**

| Term | Meaning |
|---|---|
| Buyer | Individual or business purchasing advertising. Can manage several brands/campaigns. |
| Space owner | Individual, rider, business or fleet offering permitted physical advertising space. |
| Asset / vehicle | Reusable physical object, photographs, descriptive information and surface layout. |
| Spot | A named surface on an asset: left door, rear panel, helmet side, etc. |
| Sale / listing | Owner's published offer for selected spots during a stated service period, with prices, closing time and fulfillment terms. |
| Placement / booking | A buyer's purchased position in a particular spot and sale. It can be provisional, displaced, locked or fulfilled. |
| Buyer campaign | A buyer's marketing project grouping placements, creatives, spend and results across owners. |
| Creative | Artwork plus its revisions, placement preview and approval status. |
| Installation proof | Submitted evidence of physical delivery, with reviewer decisions and timestamps. |
| Credit | Money owed to a specific original payer, with available and conditional portions distinguished. |
| Placement pass | User-facing presentation of the final placement right minted when bidding closes. Technical NFT details are secondary. |
| Platform operator | Reviews eligibility, support, disputed physical evidence and ambiguous payments within a disclosed authority model. |

One account can buy and list space. Businesses use workspaces; role switching changes navigation, not wallet ownership. Buying from a different connected wallet does not silently merge or transfer the previous wallet's claims. Linking a wallet in a live product requires proving control.

Sign-in is **wallet-only**: choose/connect a supported wallet, then sign the authentication message. Connection alone is not an authenticated session. A payment or purchase signature remains a separate action. Email can be optional contact information for updates; it is not a login or wallet-recovery mechanism.

Relationship: **Owner → Asset → Spots → Dated sale → Placement bookings**. Separately: **Buyer → Brand → Campaign → Placement bookings**. A booking connects the two sides. Reusing a car in next month's sale does not create a second car record; a campaign buying two cars does not combine their independent delivery promises into one booking.

### Confirmed product decisions

The user confirmed these on **8 November 2026**:

- **D01 — Fixed campaign dates.** Owners offer a defined service period, and takeovers end before installation. The proposed operational sequence closes intake before production begins so the final artwork can be prepared once.
- **D02 — Owner-managed production and installation.** The space owner arranges printing and installation and uploads proof. The buyer follows delivery and reviews the submitted evidence. Printing/installation price inclusion is confirmed in D13; earnings-release timing is confirmed in D08. Removal responsibility and detailed evidence/dispute rules remain open.
- **D03 — Campaigns across owners.** One buyer campaign can purchase multiple spaces from different owners. It groups placements, artwork, spend and results while retaining each placement's own status. Separate payment transactions are a recommendation for the first implementation; this decision alone does not establish a single atomic cart.
- **D04 — Instant booking.** Buyers purchase published eligible spots immediately under the advertised rules. Artwork review follows payment; there is no routine owner-acceptance request before checkout. Content changes or failure follow the published policy rather than letting an owner silently select another winner.
- **D06 — Wallet-only sign-in.** The account flow uses a wallet authentication message, with loading, rejected, expired and wrong-wallet states. Preserve the selected listing and any local draft through sign-in. Authenticated account recovery requires an authorized wallet.
- **D07 — Takeover settings per spot.** Owners set a sale-wide default and can override it for individual spots. Resolve and display the effective rule per spot in the editor, public page and checkout. Changing a default cannot change the terms of a funded booking.
- **D08 — Owner earnings after delivery and review.** Owner campaign earnings become available after the campaign ends and its issue-review window closes. Installation proof does not trigger an early payout. The review-window duration, evidence requirements and disputed-case resolution still need a defined policy.
- **D13 — One spot price including production.** The advertised spot price includes the advertising placement, printing and installation for its service period. There is no additional mandatory production charge at checkout or after purchase. Applicable wallet/network/conversion charges must still be disclosed separately; platform fee treatment and removal duties are not decided by this choice.

The owner arranges and covers production before campaign earnings are released. Sale setup and the earnings dashboard should make that cash-flow timing clear.

## 2. Navigation and shared layout

**Public header:** Explore spaces · How it works · List your space · Sign in / Account.

**Buyer sidebar:** Overview · Campaigns · Saved spaces · Brand assets · Money & credits. Shared access to Inbox, Notifications, Settings and Help. “Brand assets” may initially open the creative library tab within workspace settings rather than requiring another independent screen.

**Owner sidebar:** Overview · My assets · Sales · Bookings · Calendar · Analytics · Earnings. Shared Inbox, Notifications, Settings and Help. A persistent **Create listing** action starts from an existing asset or offers asset creation.

**Account/workspace menu:** active workspace, Buy / List space switch, wallet connections, profile, sign out. Show the relevant connected wallet and chain during payment; do not require a wallet just to browse.

**Operator navigation:** Review queue · Listings · Cases · Payments · Audit history. This is a separate permissioned area, not the owner dashboard.

**Mobile:** compact navigation; filters in a sheet; spot details in a bottom sheet; checkout as a full screen; action-first dashboards. The surface editor has large handles and a list-based alternative. Capture happens on mobile; desktop resumes the same saved draft. Do not force a complex polygon editor into a tiny unzoomable thumbnail.

## 3. Public pages

| ID | Proposed destination | What is on the page | Main action and next destination |
|---|---|---|---|
| P01 | `/` | Clear buyer/owner entry points; real inventory cards; concise three-step explanation; featured vehicles and owner story; takeover explanation; trust/fulfillment overview. | Explore spaces → P02; List your space → A01/O03. |
| P02 | `/explore` | Search by area or keyword; grid/list toggle; filters for vehicle/type, campaign dates, price, spot availability and takeover mode; sort; selected filter chips; saved items. Optional approximate coverage map, not a live vehicle tracker. | Open an asset → P03; save → B05 after sign-in. |
| P03 | `/spaces/:slug` | Pitboard-style hero, photographs/views, interactive spots and equivalent list, sale/period selector, current brand previews, price/status, owner profile, approximate operating area, service dates, production timeline, terms and FAQ. Spot deep links use the selected sale/spot in the URL. | Select spot → placement panel; Buy / Take over → B06; contact → S02. |
| P04 | `/owners/:slug` | Public individual/business profile, stated verification level, areas/types, current listings, completed work with approved photos, contact action. | Open one of this owner's assets → P03. |
| P05 | `/how-it-works/buy` | Browse, select, pay, review artwork, lock, install, track; fixed booking versus takeover; clear available/conditional credit example. | Explore → P02. |
| P06 | `/how-it-works/list` | Capture/describe an asset, edit spots, set a dated sale, publish, review creative, fulfill and receive proceeds. Explain physical responsibilities. | Start listing → A01/O03. |
| P07 | `/help` | Searchable help grouped by buying, listing, payments, takeovers, artwork and delivery. | Read article → P08; contact support → S09. |
| P08 | `/help/:article` | One readable guide with relevant next actions and related articles. Include upload/print guidance and payment recovery. | Return to the task that led here. |
| P09 | `/policies/:policy` | Policy template with separate destinations for terms, privacy, content standards, cancellation/refunds, takeovers and physical fulfillment. Current version and effective date. | Return to listing/checkout; contact support. |

Asset card fields: useful photo, title/type, city or coverage area, selected sale dates, available spot count, **from price for that period, printing and installation included**, and a **Fixed / Takeovers / Mixed** badge reflecting the offered spots. The selected spot always shows its own effective rule. A current price must not be confused with a monthly subscription or a deposit. A described-only concept cannot appear as verified real inventory.

P03 layout, desktop: image/interactive surface canvas takes the main column; selected-spot panel remains visible beside it. Below are the spot list, owner/coverage information, timeline, specifications, included production costs and terms. Switching a photo view keeps the selected spot if it exists in that view. A sold spot shows its actual status and the permitted action; a locked spot does not offer another takeover.

## 4. Account and onboarding pages

| ID | Destination | Content | Next action |
|---|---|---|---|
| A01 | `/sign-in` | Wallet picker → connect account → review/sign authentication message; return-to-task context; loading, rejected, expired and wrong-wallet states. No email/social login. | Return to checkout, a saved item, or the owner draft without losing it. |
| A02 | `/welcome` | Name and individual/business profile; choose Buy, List, or Both; minimal workspace/brand details. No unnecessary long questionnaire. | Buyer overview or first asset creation. |
| A03 | `/account/recovery` | Expired session/message, disconnected or wrong wallet; reconnect and sign again; explain which wallet owns the relevant records and provide support. | Recover access through an authorized wallet; support cannot substitute an email for financial authority. |

Confirmed: wallet-only sign-in. Browse publicly, then authenticate to save an account-backed draft, publish, purchase or access a private workspace. Local unsaved authoring can precede sign-in if its draft is preserved. The mock simulates authentication without requesting real signatures. Live wallet support and authentication verification still require implementation. Switching accounts must visibly update session/workspace access; it must not keep another wallet's private records open.

## 5. Buyer pages

| ID | Destination | Content and important states | Main action |
|---|---|---|---|
| B01 | `/buy` | Campaign summary, active/provisional placements, creative and proof tasks, upcoming starts/closes, spend and available credits. First-use empty state. | Create campaign or act on the next task. |
| B02 | `/buy/campaigns` | Cards/table with brand, dates, budget/spend, placement count, status and next action; filters and archived projects. | Open B04 or create B03. |
| B03 | `/buy/campaigns/new` | Brand, name, goal, desired area/dates and optional budget; attach an existing creative or skip it. | Save campaign and browse matched inventory. |
| B04 | `/buy/campaigns/:id` | Summary plus **Placements, Creatives, Activity, Results** tabs; remaining budget, actual purchases and pending tasks; add more spaces. Mixed status is supported. | Open one placement, attach artwork, buy another space, view B10. |
| B05 | `/buy/saved` | Saved spaces and planning shortlist; current availability/prices; assign to a campaign. | Open asset or start one placement checkout. |
| B06 | `/checkout/:intentId` | Selected vehicle, sale and spot; service dates; campaign/brand; public brand details and private contact; creative preview/upload optional; takeover consequences; single spot price including print/install; separately disclosed applicable payment fees; connected payer; supported pay asset; terms. | Pay → B07. Preserve the draft when authentication is required. |
| B07 | `/payments/:id` | Resumable payment timeline: needs wallet approval, source submitted, routing/funding, purchase authorization, accepted or issue requiring action. Receipt links are secondary detail. | Accepted → B08; received-but-not-applied → recovery/credits. |
| B08 | `/buy/placements/:id` | Vehicle/spot preview; holder and period; **Overview, Artwork, Delivery, Activity & receipts, Placement pass** tabs; a single next-action card. Includes displaced, failed and completed bookings. | Edit creative, review installation, claim credit, or open a support case. |
| B09 | `/buy/placements/:id/artwork` | Upload/select a brand asset, position/crop within the surface, see safe areas/specifications, notes and revision history; draft save and submit. Show rejected, superseded, approved and locked revisions. | Submit for review → B08; respond to requested changes. |
| B10 | `/buy/campaigns/:id/report` | Placement/service-day totals, spend, proof records, measured visits/scans if available; declared/estimated data labeled; reporting period and sample-data status. | Export sample report or open a contributing placement. |
| B11 | `/buy/money` | Available principal credits, conditional rewards, pending withdrawals, transaction history and original beneficiary wallet for each amount. | Claim/withdraw → B12; open payment/receipt. |
| B12 | `/buy/withdrawals/:id` | Amount, beneficiary, asset/chain choice where supported, conversion fee/output, approval and delivery state; unknown-result recovery. | Confirm permitted withdrawal or track its existing hash. |
| B13 | `/receipts/:id` | Itemized spot/period, original payer, price/fees, transaction references, booking and commercial record. Distinguish a payment receipt from a tax invoice. | Download receipt; return to placement or support. |

Checkout is a route even if desktop presents it as a focused panel. This permits reload, deep links and phone handoff. Source funding and purchase authorization can take separate wallet prompts; present them as explained stages of one checkout. Never describe a mere source transfer as a completed placement.

Confirmed: one campaign can contain several placements across different owners. The campaign detail must summarize those purchases and expose each owner's creative and delivery tasks. Recommend individual placement purchases initially; a multi-owner atomic checkout or guaranteed bundle needs a separate decision. Do not clear the entire campaign when one placement is displaced or its payment fails.

## 6. Owner pages

| ID | Destination | Content and important states | Main action |
|---|---|---|---|
| O01 | `/host` | Action queue: unfinished listings, expiring sales, creative approvals, installation/proof tasks, available proceeds. Summary across assets, sales and occupancy for the selected period. | Create a listing or complete a task. |
| O02 | `/host/assets` | All vehicles/objects; draft/live/archived filters; thumbnail, type, area, spot count and upcoming sale; duplicate and archive actions. | Open O07 or add O03. |
| O03 | `/host/assets/new` | Resumable asset wizard, detailed below. Photo, phone capture or describe-model entry; saved progress. | Review generated draft → O06, then O07/O08. |
| O04 | `/host/capture/:session` | Desktop handoff with QR/link, required photo checklist, connection/upload progress, resume/cancel and expired-session recovery. | Phone capture → O05; received photos → O06. |
| O05 | `/capture/:session` | Mobile camera/file upload, per-view checklist, permission denied/fallback upload, retake, upload progress, finish confirmation. | Photos appear in the paired owner draft. |
| O06 | `/host/assets/:id/review` | Source photos or described model, AI-suggested identity/views/spots, confidence/missing-information prompts, revise description/regenerate/manual paths. | Confirm/correct the draft → O08. |
| O07 | `/host/assets/:id` | **Overview, Photos & details, Spots, Sales, History** tabs; reusable object details and readiness checklist. Distinguish updates to future layouts from already sold ones. | Edit spots, create next sale, open an existing sale. |
| O08 | `/host/assets/:id/spots` | Multi-view surface editor: draw/select/resize polygon, label spot, hide/unavailable surfaces, dimensions/specs, image alignment, overlap warnings, undo/redo and revision. Equivalent list editor. | Save a layout version; continue to sale setup. |
| O09 | `/host/sales` | All dated sales across assets; draft/open/locked/in-production/live/completed/canceled filters; public-link action. | Create O10 or open O12. |
| O10 | `/host/sales/new` | Resumable sale wizard: asset, spots, dates, prices, sale-wide takeover default and per-spot overrides, fulfillment, preview and publish. | Preview O11 and publish → O12. |
| O11 | `/host/sales/:id/edit` | Page content, selected spots, price rules, content restrictions, costs/responsibility and complete timeline. Funded terms visibly locked; duplicate to a future sale. | Save draft, preview public page, publish or update permitted fields. |
| O12 | `/host/sales/:id` | Public listing summary; spot-by-spot holdings, sale activity, tasks and money; **Overview, Spots & buyers, Production, Activity** tabs. | Review artwork, close permitted intake, coordinate production, view fulfillment. |
| O13 | `/host/bookings` | All bookings across sales, filters by asset, buyer, period and required action; retain displaced history. | Open O14. |
| O14 | `/host/bookings/:id` | Counterparty, spot, dates, terms, artwork/proof status, conversation and receipts. Clearly identify current versus displaced holder. | Review artwork O15; fulfill O16; contact buyer; open case. |
| O15 | `/host/bookings/:id/artwork` | Buyer revision, vehicle preview, production specifications, notes, prior feedback and approved version. | Approve or request specific changes; later lock the final production revision under the agreed sequence. |
| O16 | `/host/sales/:id/fulfillment` | Owner-managed printing and installation checklist; install date/location privately; approved artwork, actual proof photos, spot coverage and delivery updates; buyer-review results and rework. Removal duties remain a policy decision. | Arrange printing/install, submit installation proof and resolve rework. |
| O17 | `/host/calendar` | Asset/spot availability, sale close, artwork due, installation window, service dates and maintenance blocks; conflicts visible. | Create a non-overlapping sale or open its task. |
| O18 | `/host/analytics` | Listing visits, saved/booked spots, period occupancy, revenue and transaction activity; filter asset/sale/date. Separate genuine measurement from declarations/sample data. | Open contributing sales or export. |
| O19 | `/host/earnings` | Held sale proceeds, campaign-end/review dates, available earnings, pending payouts, expenses/fees and history. Hold earnings through the service period and issue-review window; show any unresolved case separately. | Request a payout when the campaign and review requirements are satisfied → O20. |
| O20 | `/host/payouts/:id` | Destination ownership, amount/fees, confirmation and transfer tracking/recovery; immutable payout record. | Confirm or track an existing payout. |

### Asset creation steps

1. **Choose the asset:** vehicle type; photo/capture, model description or a suitable existing template.
2. **Capture or describe:** guided front/side/rear views as needed; phone handoff; make/model/year where known; simple text prompt alternative.
3. **Generate and review:** show progress, cancellation, retry and manual fallback. Draft images and suggested spots remain editable. Label a concept rendering as a concept.
4. **Define spots:** use O08; name and size surfaces; avoid unsafe/unavailable areas; confirm approximate versus verified production dimensions.
5. **Describe the real offering:** useful photos, coverage area, intended use/events, owner permission and operating information. Capture private contact separately.
6. **Save the reusable asset:** readiness checklist, then “Create a sale.” Owner can leave a draft and resume later.

### Sale creation steps

1. **Pick asset and spots:** choose a saved layout version; define exclusivity/conflicting surfaces.
2. **Set the schedule:** open/close, artwork due, installation window, service start/end, review/settlement milestones. Require time for physical production.
3. **Set commercial terms:** one price per spot for the entire service period, including printing and installation; sale-wide takeover default with **Use sale default / Enabled / Disabled** per spot. Show each spot's effective rule and a reset-to-default action. Recommend a published fixed multiplier/reward policy initially. Snapshot the effective rule for publication/checkout; subsequent default changes cannot alter funded terms.
4. **Set fulfillment/content terms:** confirm the owner arranges and covers printing/installation before earnings are released; show campaign-end and review milestones; proposed removal duties; permitted content; promised deliverables and required proof. Internal production-cost estimates are not extra buyer charges.
5. **Preview and publish:** desktop/mobile public preview, readiness checklist, confirm frozen commercial terms, publication progress and a shareable link. A failed publication preserves the draft.

Owner branding can configure title, description, cover image and public profile in the mock. A fully arbitrary page builder is a separate product; the first design uses one well-defined, customizable listing template.

## 7. Shared workspace and support pages

| ID | Destination | Required content/action |
|---|---|---|
| S01 | `/inbox` | Conversations linked to a booking/sale, unread and needs-reply filters, empty state. |
| S02 | `/inbox/:threadId` | Thread, participants, referenced placement, attachments and quick links to artwork/proof. Show private contact only to authorized parties. |
| S03 | `/notifications` | Activity and tasks: taken over, deadline approaching, artwork changes, proof ready, payout update. Each notification opens the relevant task. |
| S04 | `/settings/profile` | Name, avatar, optional contact email and public/private contact fields; authenticated wallet identity. Contact information does not provide sign-in or restore wallet control. |
| S05 | `/settings/workspace` | Individual/business identity, public owner profile, brand assets, workspace switch, team/access section. Small-team permissions can be mocked without requiring a full agency product. |
| S06 | `/settings/wallets` | Signed-in wallet, current payer, authenticated-session status, switching/disconnect and claims held by each wallet. Optional secondary-wallet linking requires proof of control and a defined access policy; no automatic account merge. |
| S07 | `/settings/notifications` | Transactional email/in-app preferences; essential financial status remains visible in the account. |
| S08 | `/settings/billing` | Business billing details, commercial documents, receipt history and declared fee treatment. No invented tax-compliance claim. |
| S09 | `/support/new` | Choose booking/payment/delivery/account issue, attach context/evidence, explain requested resolution. |
| S10 | `/support/cases/:id` | Status, evidence, messages, operator decision and transaction consequences where applicable. |

Keep messages, creative feedback and disputes related but distinct: a requested artwork change is not automatically a financial dispute, and a chat message cannot reverse an accepted payment.

## 8. Operator pages

| ID | Destination | Required content/action |
|---|---|---|
| M01 | `/ops` | Review queues: listing eligibility, overdue proof, reported content, disputes and payment exceptions. |
| M02 | `/ops/listings/:id` | Submitted asset/photos, permission declarations, content and dates, reasoned approve/request-changes/reject decisions. |
| M03 | `/ops/cases/:id` | Parties, exact booking terms, evidence versions, review history and permissible resolution. Decisions show their financial effect and responsible authority. |
| M04 | `/ops/payments/:id` | Source and settlement evidence, accepted booking/invoice, pending credits, unknown-result recovery. Support does not have a “mark paid” shortcut. |
| M05 | `/ops/audit` | Filterable operational decisions and their actor/time/evidence, with related case and transaction links. |

A minimal operator flow belongs in the mock because the current physical-delivery policy depends on human review. A full enterprise moderation tool is outside the first live release.

## 9. Global destinations, dialogs and states

| ID | Destination/state | Behavior |
|---|---|---|
| G01 | Not found / removed listing | Explain whether the link is invalid or inventory is no longer offered; preserve access to the buyer's existing booking. |
| G02 | Access denied / wrong workspace | Explain the active workspace; offer a permitted switch or account recovery. Do not expose the other owner's private dashboard. |
| G03 | Temporarily unavailable / maintenance | Explain what is unavailable and whether saved drafts/payment tracking can still be accessed. |

Required dialogs/sheets: wallet/provider/account selection; brand/campaign picker; listing filters; selected spot; price-changed review; takeover rules and old-holder credit breakdown; upload picker; discard-unsaved-changes; leave generation running; publish confirmation; production-lock confirmation; cancellation request; payout confirmation; placement-pass delivery wallet/claim; optional pass transfer explanation; report listing; share/copy public link.

Do not create a separate page for every toast or every transaction status. These are explicitly reviewable states of the page/dialog above.

## 10. Complete journeys to demonstrate in the mock

**Buyer, first purchase:** explore publicly → open an asset → inspect a spot, dates and its effective takeover rule → choose Buy or Take over → connect and sign in with the intended wallet if needed → select/create campaign and brand → review exact cost and published rules → approve simulated payment and purchase authorization → booking is accepted without an owner-request stage → submit creative → follow its production and delivery timeline.

**Owner, first listing:** choose List your space → wallet sign-in, preserving any local draft → photograph on phone or describe a model → review AI suggestions → correct spots → add real photos/details → save asset → create dated sale → set prices, takeover default and any spot overrides → define fulfillment → preview → publish → open owner dashboard and public page.

**Owner, second sale:** open an existing asset → duplicate a completed sale into a non-overlapping future period → choose reusable spots → update dates/prices/terms → publish a new public sale. History and existing buyer rights remain intact.

**Takeover:** buyer B views an eligible occupied spot → sees price, closing time and consequences → pays/signs with B's wallet → B becomes provisional holder → A receives notification and a credit breakdown → A can claim available principal or explore/re-enter → A's private artwork remains private; B receives its own creative task.

**Close and final right:** closing time passes → intake is visibly closed → final holder is determined → placement pass is prepared/claimed → any necessary native delivery wallet is selected and accepted → final artwork review and production lock proceed. Minting is not proof of physical installation. Historical creditors remain unchanged by the NFT.

**Fixed booking:** owner disables takeovers for a spot through an explicit override or the inherited sale default before publication → buyer purchases immediately → spot becomes unavailable for another buyer for that sale → artwork review and fulfillment continue. Other spots in the same sale can still allow takeovers.

**Production and fulfillment:** owner reviews buyer revision → changes requested and resubmitted, or approved → final production version locked → owner arranges printing and installation within the advertised spot price → owner uploads actual proof photos → buyer reviews proof or raises a case → campaign runs to its end → issue-review window closes → eligible owner earnings become available → owner requests payout. Detailed dispute handling remains a policy decision; an unresolved case must have a visible review state.

**Campaign across owners:** buyer creates one campaign → adds a car spot from owner A and a motorcycle spot from owner B → purchases the placements → reuses brand assets with separate surface-specific revisions → sees creative, installation and money status per placement in the campaign summary. A takeover or delivery issue on one placement leaves the other placement intact.

**Interrupted payment:** close/reload during routing or a wallet timeout → return to saved payment page → inspect existing evidence → continue authorization when funds are available or track the existing send. Never restart the transfer merely because a response was lost. Money received after the spot becomes unavailable gets a recoverable credit/refund path.

**Physical failure:** missed installation or invalid proof → support case with both parties and terms → disclosed reviewer resolves it → show corresponding credits/refund, canceled conditional rewards and owner payment state. Avoid promising an automatic full refund based only on AI interpretation of an image.

## 11. State model the designer needs

Keep separate state axes; one overloaded “active” badge cannot describe the whole product.

| Object | Example states to cover |
|---|---|
| Asset draft | Empty → uploading → generating → review needed → editable → ready; failed generation/manual fallback; archived. |
| Sale | Draft → publishing → open → closed/lineup locked → production → service live → complete; canceled/needs review. |
| Individual spot | Available, someone checking out, provisional holder/takeover eligible, fixed-booked, final holder, not offered, conflicting/blocked. |
| Payment | Quote → wallet approval → source submitted → funding → purchase authorization → accepted; rejected, expired, unknown, received/unapplied, credited/refunded. |
| Booking | Provisional → displaced or final → awaiting creative → production → installed/live → complete; canceled/disputed. |
| Creative | Missing → draft → submitted → changes requested → approved → locked; superseded. |
| Physical proof | Missing → submitted → review → accepted or rework requested → disputed. |
| Money | Held, available principal, conditional reward, available owner proceeds, withdrawal requested, processing, delivered, failed, unknown. |
| Placement pass | Not due, closing, needs delivery wallet, acceptance pending, minting, issued, rights locked, expired/canceled. |

For every major page, provide loading, no data, populated, error and relevant permission states. At least one fixture must demonstrate each exceptional state above. Errors name the failed step and a safe next action. Drafts and paid records survive refresh.

Owner earnings specifically cover **Held during campaign → Held during issue review → Available → Payout processing → Paid**, plus an **Under review** case state. Proof approval alone does not advance held earnings to Available. A mock review-window duration must be labeled illustrative until that duration is agreed.

## 12. Design handoff and mock acceptance

The mock is interactive, uses one coherent set of sample data and makes no real wallet requests, AI purchases, deployments or fund transfers. A persistent prototype indicator is sufficient; avoid filling the customer flow with engineering diagnostics.

Provide:

- A route/screen index linking all destinations, tabs, wizard steps and noteworthy states.
- Sample buyer, space-owner and operator personas, plus clear switching for review.
- At least three owners and several cars, motorcycles and bikes; more than one asset and sale for one owner; one prior, one current and one future sale; two buyers competing for one spot.
- A buyer campaign with placements across owners; one takeover-enabled and one fixed-booking sale; a failed or disputed fulfillment example.
- Listing, spot panel, checkout and receipt agree on one price including printing/installation. Owner earnings fixtures show an installed active campaign with held proceeds, a completed campaign still in issue review, and an eligible completed campaign with available proceeds.
- Scenario reset and saved mock state, so the teammate can reliably revisit a screen.
- Completed click paths for all journeys in section 10; no primary CTA that silently does nothing.
- Desktop/mobile reference views for marketplace, asset page, owner capture/editor, checkout, booking workspace and each dashboard. All other routes remain responsive.
- Each page's purpose, entry/exit, key content, primary action and state notes; reusable component inventory; no requirement that the teammate infer behavior from lorem ipsum.
- Clearly labeled sample analytics, described-only concepts, approximate coverage and unavailable future functionality.

Review content hierarchy and interaction before visual styling. Typography, color system, illustration, motion and final composition are the teammate's design work, informed by the agreed functional mock.

## 13. Decisions for the user

Confirmed direction: advertise on everything; vehicles first; visual spot selection; multiple owner pages/sales; buyer and owner dashboards; final NFT at bidding close; delayed refunds are acceptable; different buyer wallet addresses can own different placements. D01–D04, D06–D08 and D13 below are also confirmed within the stated scopes.

Confirmed decisions are marked explicitly. The remaining rows are proposals:

| ID | Decision | Recommendation | Why it changes the experience |
|---|---|---|---|
| D01 | Fixed service periods or continuously replaced ads? | **Confirmed:** fixed campaign dates; takeovers close before installation. Closing before production is the proposed operational sequence. | Calendar, booking and takeover UI use a dated service period and a finalization milestone. |
| D02 | Who arranges printing and installation? | **Confirmed:** the owner arranges printing/installation and uploads proof. Price inclusion and earnings timing are confirmed separately in D13/D08. Removal and detailed delivery policy remain open. | Owner production/proof tasks and buyer delivery review are required. |
| D03 | Can a buyer campaign span multiple owners? | **Confirmed:** one campaign can buy multiple spaces from different owners. Separate initial checkout transactions remain a recommendation. | Campaign dashboard aggregates independent placement, creative, delivery and money states. |
| D04 | Purchase acceptance or a manual request first? | **Confirmed:** book published eligible spots immediately; review artwork afterward against published rules. | Checkout has no routine booking-request approval state. Artistic revisions, content-policy failures and refunds remain explicit post-purchase workflows. |
| D05 | One account for both roles? | Yes; individual/business workspace and role navigation. | Avoids duplicate identities; linked wallets retain their own financial authority. |
| D06 | Wallet-only app login or familiar app account plus wallet linking? | **Confirmed:** wallet-only sign-in. | Wallet connection and authentication signature are distinct; preserve the task and show account switching/recovery. Email is optional contact only. |
| D07 | What is configurable about takeovers? | **Confirmed:** on/off per spot, with a sale-wide default. Fixed published multiplier/reward economics remain a recommendation. | Editor shows inherited rules and overrides; public cards support mixed modes; checkout displays the selected spot's frozen terms. |
| D08 | When do owner earnings become available? | **Confirmed:** after the campaign ends and its issue-review window closes. Review-window length, exact evidence requirements and disputed-case resolution remain open. | Earnings remain held after installation and through the campaign/review period. Proof approval is not early payout authorization. |
| D09 | What owner customization is needed? | Content, photos, spots, commercial terms and profile using a shared page template. | Keeps every listing usable while permitting distinct vehicles and brands. |
| D10 | What reporting can we claim? | Booking/spend, proof and genuinely collected visits/scans; declared data labeled. | Determines useful dashboards without invented exposure or ROI. |
| D11 | Production permission to edit artwork vs NFT delivery? | Stage drafts before close; final placement pass at close; production locks approved revision. | Requires a clear delivery-wallet state and alignment with supported on-chain artwork authority. |
| D12 | Bundles and exclusivity across spots? | Independent spots with explicit conflict groups first; no mixed bundle guarantee. | Prevents selling overlapping surfaces or promising atomic multi-owner purchases. |
| D13 | Does the advertised price include printing/installation? | **Confirmed:** one spot price includes placement, printing and installation. Payment costs remain separately disclosed where applicable; removal and platform fee policy remain open. | Public prices, spot panels, checkout and receipts use the same included service scope; no later mandatory production charge. |

The high-impact decision round is complete. Review the [key screen walkthrough](screen-walkthrough.md) as one complete experience before building the mock. Remaining routine UX recommendations can be reviewed together; precise policy parameters stay explicitly open rather than prompting another feature-by-feature questionnaire or implying approval.
