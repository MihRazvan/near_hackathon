# Technical architecture

[Overview](../README.md) | [Project brief](PROJECT-BRIEF.md) | [User flow](USER-FLOW.md) | [Contracts](CONTRACTS.md) | [Verify](../VERIFY.md) | [Docs](README.md)

The API stores vehicle listings and coordinates wallet actions. The shared NEAR hub enforces placement rights and tracks payments and balances. The frontend is in `prototype/`, the directory name used since the first version.

![Application services and NEAR architecture](assets/architecture.png)

## Components and source map

| Component | Responsibility | Source |
| --- | --- | --- |
| Connected frontend | Marketplace, photo/outline editor, checkout, dashboard, profile and public campaign records | [`prototype/src/integration`](../prototype/src/integration/), [frontend setup](../prototype/README.md) |
| Persistent API | Inventory, sessions, wallet plans, media, buyer campaigns, operation status and recovery | [`backend/src/product.mjs`](../backend/src/product.mjs), [backend setup](../backend/README.md) |
| SQLite | Durable application state and transaction journals; it is not the authority for on-chain ownership or payment finality | [`backend/src/store.mjs`](../backend/src/store.mjs) |
| Wallet authorization | NEP-413 native sessions; ERC-191 EVM authorization bound to the intended action | [`backend/src/auth.mjs`](../backend/src/auth.mjs), [`intents.mjs`](../backend/src/intents.mjs) |
| Shared hub | Per-offer terms, purchases, takeover credits, NFTs, artwork, fulfillment, issues and withdrawals | [`contracts/marketplace-hub/src/lib.rs`](../contracts/marketplace-hub/src/lib.rs) |
| NEAR Intents | Verify EVM signatures and execute authorized actions; maintain USDC balances and payouts | [`backend/src/intents.mjs`](../backend/src/intents.mjs), [`hub-actions.mjs`](../backend/src/hub-actions.mjs) |
| 1Click routing | Quote Base funding/return routes and reconcile deposit/delivery | [`backend/src/browser-funding.mjs`](../backend/src/browser-funding.mjs), [`customer-funding.mjs`](../backend/src/customer-funding.mjs) |
| NEAR AI | Propose editable panels from a photo; generate labelled vehicle references from descriptions | [`backend/src/asset-ai.mjs`](../backend/src/asset-ai.mjs) |
| Media | Consent, uploads, IPFS references and retrieved-byte digest checks | [`backend/src/media.mjs`](../backend/src/media.mjs) |
| Keeper / executor | Bounded relaying, reconciliation, eligible NFT minting and settlement | [`backend/src/near-executor.mjs`](../backend/src/near-executor.mjs), [`keeper.mjs`](../backend/src/keeper.mjs) |

The [lockfiles](../README.md#documentation) pin dependencies. Runtime AI and hosting configuration are described in [deployment details](DEPLOYMENTS.md#ai-and-hosting).

RPC requests are spaced 100 ms apart by default, configurable with `APP_NEAR_RPC_INTERVAL_MS`. Concurrent visitors share identical in-flight reads and a five-second public display cache. Each keeper batch shares one finalized block for immutable hub/token reads and renews it during slow batches. Payment preparation still reads fresh finalized state.

## From a vehicle to an offer

1. A signed-in owner creates a private vehicle draft from a photo, a private phone capture, a description or the labelled sample.
2. NEAR AI returns editable panel outlines in image coordinates. The owner confirms the layout and physical dimensions before production.
3. The owner creates a campaign with fixed dates, all-in prices and per-panel takeover rules. The API prepares a terms commitment and operation plan.
4. The owner approves publication in their wallet. The shared hub binds each offer to its original listing and terms; sponsorship remains bounded by live balances and policy limits.
5. The application checks the transaction result before confirming publication. Private drafts stay off chain and allocate no NEAR storage.

## Payment and recovery

### EVM wallet

The application prepares an intent for the user to review and sign with ERC-191. The wallet signs the exact, indented JSON stored in the plan; existing compact messages remain valid for recovery. A readable summary is decoded from those same bytes while the wallet is open. This does not change the ERC-191 format or make the wallet display an EIP-712 confirmation. The relayer sends it to the configured NEAR Intents verifier. The verifier and hub check the signer, offer, amount, expected state and committed terms; the server can relay that signed action without receiving the user's spending key.

USDC already in the supported Intents balance can fund an action. Base funding uses a separate 1Click quote and wallet-approved transfer. The provider's quote sets routing costs and minimums. The app follows delivery and refund status. Live Base routing needs its own test outside the local-chain run.

### Native NEAR wallet

NEP-413 authenticates the session, and the wallet signs each required contract or token action separately. Before a native USDC withdrawal, the app checks whether the receiving account needs token storage registration.

### Durable operation recovery

[`wallet-requests.mjs`](../backend/src/wallet-requests.mjs) and the executor retain operation identity, signed-plan binding and transaction/delivery observations. After a lost HTTP response, the app checks the original transaction before requesting another transfer. The browser checks its original recorded operation after reload or restart.

The [original-intent tests](../backend/tests/original-intent-recovery.test.mjs), [provision-recovery tests](../backend/tests/provision-recovery.test.mjs) and [production Sandbox interface](../prototype/tests/production-browser.mjs) exercise these boundaries.

## NFT and media path

![NFT authority and financial separation](assets/nft-rights.png)

After booking closes, the final payer receives a NEP-171 token. The current holder controls artwork within its active window. Transferring the token changes creative authority without changing original financial creditors.

Artwork is stored as public content only with explicit consent. The media implementation verifies the retrieved bytes against their SHA-256. The hub commits the artifact URI/hash and revision, and dynamic token metadata follows the accepted artwork. Owner approval locks an exact revision. Installation evidence similarly commits submitted bytes and refers to the relevant approved artwork.

The CID and SHA-256 bind the submitted file; the NFT records who controls its artwork. Physical installation still needs [owner evidence and human review](USER-FLOW.md#campaign-arbiter), under the [contract rules](CONTRACTS.md).

## Trust boundaries

| Boundary | Enforced or retained | Remaining trust / limit |
| --- | --- | --- |
| Wallet → application | Session identity and explicit action approval | Real wallet-extension UI and response times belong to the provider. |
| Application → Intents / hub | Signed plan, offer terms, actor, expected round and financial amounts | Current hub has an upgrade key; clients pin code identity, but the contract is not immutable. |
| NFT transfer → creditors | Original refund/reward/earnings ownership remains fixed | NFT custody grants creative access only within the permitted window. |
| Database → chain | Application journals reconcile actual outcomes | Inventory, presentation and orchestration remain off chain. |
| Media → physical service | Exact submitted bytes and approval revision are committed | Owner evidence and disputed delivery need human judgment. |
| Keeper → settlement | Success is constrained by service/review times, locked artwork, evidence and no unresolved issues | Automation cannot independently observe a physical installation. |
| AI → panel layout | Output is editable and owner-confirmed | No guaranteed dimensions, automatic placement accuracy or vehicle-ownership proof. |

The app has no measured-impression, GPS-route, carbon-offset or exposure-reporting service.

## Hosting and source identity

Production uses the [Docker image](../Dockerfile) and [Railway configuration](../.railway/railway.ts), one persistent API instance and a SQLite volume. The static frontend also requires working API and wallet-adapter routes. The server reads credentials from configured secrets. Private development files are excluded from public assets.

Pinned [macOS arm64 CI](https://github.com/MihRazvan/near_hackathon/actions/workflows/verify.yml) rebuilds source and requires exact equality with the deployed 477,522-byte WASM. Linux unit-tests source and executes a separately hash-checked committed deployment in Sandbox. The Linux report records that the source build differs from the deployed bytes. [Build recipe and host limits](../BUILD.md).

## Verify this architecture

```sh
node scripts/verify.mjs
node scripts/verify.mjs --offline
node scripts/verify-sandbox.mjs --hub-artifact deployed --json
```

The Sandbox command installs or downloads missing prerequisites and uses valueless local tokens. It runs signed actions through the pinned Intents verifier and hub from the app interface. The wallet UI is injected and the media transport is synthetic; live Base routing and physical delivery need separate checks. [Full verification guide](../VERIFY.md).
