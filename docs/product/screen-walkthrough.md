# Key screen walkthrough

**8 November 2026 · Draft for discussion**

This describes the functional composition of the main screens before building the navigable mock. The [experience map](experience-map.md) remains the complete destination/state inventory. Visual styling is for the designer; these notes define what users see and can do.

Confirmed foundation: dated sales, instant booking, owner-managed printing/installation and proof upload, buyer campaigns across owners, wallet-only sign-in, and per-spot takeover controls inheriting a sale-wide default. Production-cost presentation and owner earnings-release timing are still awaiting decisions.

## 1. Marketplace: find an appropriate space

**First view:** a brief “Advertise on everything” introduction, location/date search, visible inventory and a List your space action. A visitor can immediately explore without signing in.

**Search area:** operating area, campaign dates, asset type and budget; secondary filters include available spots and fixed/takeover-enabled spots. Filter and sort choices stay visible as removable chips. Use a grid first; approximate coverage map is optional.

**Card:** useful real photo, asset title, owner, coverage area, sale/service dates, matching available spot count, price for that period, Fixed / Takeovers / Mixed indicator. When filtering for fixed spots, the card price/count must describe matching spots rather than a cheaper takeover spot on the same asset.

**Click:** opens the public asset page with the selected sale period preserved. Save prompts wallet sign-in when needed and returns to the same item.

**Empty result:** explain the active filters and offer clear/remove filters. A public visitor sees useful inventory before any wallet prompt.

## 2. Asset page: the expanded Pitboard experience

**Header:** asset name, owner, approximate operating area, selected service period and share/save actions.

**Main area, desktop:** multi-view photograph/vehicle preview on the left; selected-spot panel on the right. Numbered or named surfaces are clickable. A parallel spot list provides the same selection and availability information. On mobile, the selected spot opens in a bottom sheet with the primary action in reach.

**Spot panel, in order:**

1. Spot name and dimensions/specification status.
2. The exact service dates and currently selected sale.
3. Available, provisional holder, fixed-booked or final/closed status.
4. Price to purchase now and the effective takeover rule.
5. Buy spot or Take over action when permitted.
6. Compact production/cost and cancellation details, with full terms accessible.

An occupied takeover-enabled spot can show the provisional brand artwork as a **preview**. It must not imply that a physical ad is already installed. A fixed-booked spot exposes its status without another purchase action.

**Below the canvas:** all spots, owner/asset details, coverage and declared use, schedule, production responsibilities, content rules and FAQ. Show verified, declared and illustrative information accurately.

## 3. Owner onboarding: create a reusable asset

**Entry:** List your space → wallet sign-in → name/public owner details if new → choose Photograph / Continue on phone / Describe model. Preserve any existing local draft.

**Capture:** view checklist, camera/file-upload alternative, progress and retake. Desktop shows the phone handoff link and received photos; the phone ends with a clear handoff confirmation.

**Generation review:** source input beside a suggested vehicle/views/spots draft. Allow correct model, revise prompt, regenerate and continue manually. A described image stays labeled a concept until real asset information is supplied.

**Editor:** view switcher and surface canvas; spot list beside it; selected-spot properties below/beside the list. Draw/resize, rename, adjust specifications, remove, undo and save. The list offers a usable alternative to direct manipulation. Geometry is reusable for future sales.

**Finish:** review real photos/details, coverage and readiness; save the asset; Create a sale. Saving an asset alone does not put it on sale.

## 4. Sale setup: prices, dates and takeover rules

**Steps:** choose asset/spots → schedule → commercial terms → production/content terms → preview and publish. A summary stays accessible and drafts can be resumed.

**Commercial terms screen:**

- Sale-wide Takeovers enabled/disabled default.
- Spot table with photo marker/name, price for the entire period and takeover selection: Use sale default / Enabled / Disabled.
- Effective-rule badge on every row, so inheritance is visible without opening settings.
- Clear reset-to-default action for an override.
- Published takeover economics explanation where relevant; a custom formula editor is not part of the proposed first mock.

**Schedule:** sale close, artwork due, production/installation window and service start/end. The suggested order leaves production time after the final holder is determined. Owner availability conflicts are visible before publication.

**Fulfillment:** the owner confirms arranging printing and installation and submitting proof. Price presentation depends on the pending cost decision. Removal, content standards, evidence and review terms must also be visible.

**Publish preview:** show exactly the public page and selected-spot checkout terms. After publication, a changed default cannot alter a funded spot's effective rules. A new sale can reuse the asset with new dates and terms.

## 5. Wallet sign-in and account switching

**Sign-in screen:** preserve a compact summary of the interrupted task; show supported wallet choices; connect the selected account; then ask for an authentication signature with clear sign-in wording.

**Success:** return to the saved task or workspace. Payment authorization is requested only in its own flow. Contact email can be optional profile information for updates.

**Account switch:** display the active wallet, end/re-evaluate its authenticated session and sign in with the new account. Update workspace permissions and financial records accordingly. Access to another wallet's bookings or claims is not inferred from a matching name or email.

**Failures:** rejected message, expired message/session, unsupported wallet and wrong account each have a specific next action. Reconnecting does not start another payment. The mock simulates these states through sample personas.

## 6. Checkout: instant booking under published rules

**Summary:** vehicle and spot preview, owner, service dates, spot mode, price and full amount payable. The selected spot and sale remain visible throughout.

**Buyer details:** choose/create the campaign and brand; reuse brand assets or save artwork for the next step. The same buyer campaign can contain placements with several owners. The first proposed real checkout remains placement-specific; combined payment is not yet decided.

**Wallet:** show the signed-in payer, supported payment selection, balance/fee information and a clear switch action. Returning from a switch preserves the selection but revalidates permission and price.

**Primary action:** Pay and book / Pay to take over. The flow explains its wallet approvals as progress stages, then shows a confirmed booking when the purchase is accepted. Routine owner booking approval is absent; artwork review follows the accepted purchase.

**Takeover details:** closing time, provisional status and published consequences are visible before payment. The displaced buyer's available principal and conditional reward are displayed separately in that buyer's money view.

**Interrupted flow:** resume the saved payment record, show what is confirmed and offer the next valid action. Expired quotes or price changes require review of the updated amount. Received funds without an accepted placement have an explicit recovery/credit state.

## 7. Buyer placement workspace: what happens after payment

**Top:** asset/spot, campaign, owner, service dates and status; one prominent next-action card.

**Tabs:** Overview · Artwork · Delivery · Activity & receipts · Placement pass.

- **Artwork:** reuse/upload creative, edit placement preview, submit, read feedback and track exact revisions. Drafts may be prepared before bidding closes; final production uses the approved locked revision.
- **Delivery:** owner schedule, production status, actual installation proof and buyer review/report-issue actions. Changes requested on proof are distinct from artistic changes.
- **Activity:** purchase, takeover, approvals, production lock and proof history; receipts remain accessible.
- **Placement pass:** after bidding closes, show preparation/claim/issued status and any required delivery-wallet selection. Minting does not mark installation complete.

For a displaced booking, replace the next-action card with what changed, the original payer's credit breakdown and Claim / Find another space actions. Keep its history and private artwork available to that buyer.

## 8. Owner booking workspace and production

**Top:** buyer/brand, current-holder status, spot, dates and pending task. A displaced buyer is visibly historical rather than an active production task.

**Artwork review:** preview the submitted revision on the surface, inspect production specifications, approve or request specific changes. Content-policy failure follows published rules and an explicit resolution state.

**Production:** confirm the final holder and approved revision, lock it for printing, arrange printing/installation, then upload actual proof for the relevant spots. The owner sees review results and any rework required.

**Money:** held funds and potential earnings are distinguished from available proceeds. The exact release milestone follows the pending user decision; no receipt or image automatically makes funds withdrawable in the mock's model.

## 9. Campaign and dashboard views

**Buyer campaign:** one summary of goals, period, spend and results, with a placement table/card list grouped or filterable by owner. Each row has its own creative, production, delivery and financial status. One failed or displaced placement does not reset the others. The buyer can add more spaces and reuse creative assets while submitting a suitable revision for each surface.

**Buyer overview:** next actions first; then provisional/live placements, approaching deadlines, campaign summary and available credits. Empty state leads directly to discovery or campaign creation.

**Owner overview:** next actions first; then assets/sales, spots booked for the selected period, upcoming production tasks and money summary. Existing assets lead to another dated sale. Analytics explain measured versus declared/sample information.

Inbox, notifications and support open the relevant booking or task. Financial and physical progress use the same coherent sample records across all these pages.

## Review gate

Review these compositions together with the complete page inventory, then build the functional mock. Remaining decisions should be consolidated into the experience map. The prototype will provide a route/state index and sample personas so the designer can revisit each state without replaying the entire journey.
