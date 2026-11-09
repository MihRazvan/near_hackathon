# Everywhere local integration backend

The backend connects dated advertising inventory to NEAR escrow, original-wallet claims, placement NFTs, artwork and fulfillment. It runs separately from the hosted design prototype, which still uses mock data.

## Run and test

Requires **Node.js 24.12+**. Tests and a read-only server startup need no wallet, credential or funds.

```sh
npm ci --prefix backend --ignore-scripts
npm test --prefix backend
npm start --prefix backend
```

The API listens on **http://127.0.0.1:4318**; health is `/api/health`. Without a credential file, transaction execution is disabled. SQLite state lives under ignored `.local/backend/`. The server validates its local Host and Origin and uses hashed bearer sessions.

Build the current artifact before deployment or attachment:

```sh
bash scripts/build-campaign.sh
```

The [Sandbox instructions](../proofs/sandbox/README.md) reproduce actual contract execution without public funds, including the pinned verifier and signing fixtures.

## Services

| Service | Behavior |
| --- | --- |
| `Auth` | EIP-191 and NEP-413 sign-in; one-use origin-bound challenges and persistent hashed sessions. Native signatures require a current full-access key. |
| `Marketplace` | Owner drafts, editable spots/prices, fixed dates, immutable publication manifests, buyer campaigns across owners, bookings, messages, issue requests and dashboards. |
| `ChainService` | Exact purchase signatures, verified acceptance events, original-creditor releases, nomination, native USDC redemption and pinned deployment attachment. |
| `NativeActions` | Unsigned customer NEAR transactions for NFT/fulfillment/arbiter actions; exact final wallet transaction confirmation. |
| `NearReads` | A recent finalized block binds terms, code hashes, settlement assets, credits and escrow solvency. Pending withdrawals block new plans. |
| `NearExecutor` / `BaseExecutor` | Explicit operator execution, durable signed bytes, signer locks, aggregate budgets and receipt reconciliation. |
| `OneClick` / `ReturnVerifier` | Bounded routes, original-wallet refund/return destinations and finalized Base USDC payout evidence. |
| `AssetAI` / `ChatGPT` | Editable text/image-derived proposals, scoped OAuth renewal and terminal stream validation. |
| `Media` | Public-content consent, bounded uploads, persistent deduplication, IPFS references and retrieved-byte hash verification. |
| Reconciliation worker | Checks submitted hashes and updates records. It never signs, broadcasts, retries transfers or finalizes campaigns. |

The current checkout adapter uses EVM signatures over Intents balances. Native NEAR wallets sign owner/NFT/arbiter actions. Signing in does not authorize spending. Each booked spot settles independently; a multi-owner campaign is not an atomic basket purchase.

Publishing checks one deployed contract per spot against the exact manifest, price, roles, dates and takeover rules. Draft changes invalidate publication preparation; published commercial terms cannot change. Owners deploy/initialize the current contract or use the local operator service before attachment. HTTP routes cannot submit arbitrary code or operator transaction plans.

Creating an issue is an **arbiter request**, not an on-chain decision. The separate arbiter signs the settlement gate. Evidence hashes do not establish physical truth. Exposure/impression statistics are unmeasured, not fabricated.

## HTTP contract

All paths start with `/api`. Private requests use `Authorization: Bearer <session token>`; JSON mutations use `Content-Type: application/json`. Customers never provide wallet private keys through HTTP.

| Flow | Routes |
| --- | --- |
| Discovery | `GET /browse`, `GET /sales/:id` |
| Session | `POST /auth/challenge`, `POST /auth/verify`, `POST /auth/logout`, `GET /me` |
| Owner setup | `POST /ai/draft`, `POST /assets`, `PATCH /assets/:id`, `POST /sales`, `PATCH /sales/:id` |
| Publication | `POST /sales/:id/publication`, `POST /sales/:id/publish` |
| Buyer campaign | `POST /campaigns`, `POST /bookings`, `GET /bookings/:id`, `POST /bookings/:id/submit` |
| Signatures | `GET /intents/:id`, `POST /intents/:id/relay`, `POST /nomination` |
| NFT/fulfillment | `POST /native-actions`, `POST /native-actions/:id/confirm` |
| Communication | `GET /bookings/:id/messages`, `POST /bookings/:id/messages`, `POST /bookings/:id/issues` |
| Artifacts | `POST /media` |
| Money | `GET /wallet/balances`, `POST /claims`, `POST /withdrawal-intent`, `POST /routes`, `POST /exit-intent` |
| Reconciliation | `GET /operations/:id`, `GET /routes/:id`, `GET /routes/:id/reconcile`, `GET /integration` |

Sign-in starts with `{ "wallet": "<public address>" }`. EVM verification supplies `challengeId` and a personal-message `signature`. Native verification adds `accountId` and `publicKey`, with a base64 NEP-413 signature over the supplied message/nonce/recipient.

Booking preparation takes `campaignId`, `saleId` and `spotId`. The stored `planId` identifies the exact Intents message to sign. Plans expire within two minutes; changed prices/rounds require a fresh plan. Repeating a submitted plan reconciles its original transaction.

Native action kinds: `accept-nomination`, `mint`, `transfer`, `artwork`, `lock-artwork`, `delivery-proof`, `issue-decision`, `finalize-success`, `finalize-failure`. The returned wallet transaction contains its exact method, arguments, gas and deposit. Approval requires the revision the seller reviewed.

Media accepts canonical `base64`, `mime` and `publicContentAcknowledged: true`, limited to 1 MB. AI accepts `prompt` and optional PNG/JPEG `imageDataUrl`, limited to 2 MB. Draft geometry is approximate, requires owner approval and contains no inferred physical measurements.

## Provider setup

Optional secrets belong in owner-only `.local/integration.env`, never frontend variables or Git. The parser reads literal data rather than shell commands. Credential fields: `INTEGRATION_NEAR_ACCOUNT_ID`, `INTEGRATION_NEAR_PRIVATE_KEY`, `INTEGRATION_BUYER_A_PRIVATE_KEY`, `INTEGRATION_BUYER_B_PRIVATE_KEY`, `INTEGRATION_ONECLICK_API_KEY`, `INTEGRATION_IPFS_PINNING_TOKEN`. Use dedicated qualification wallets. Pinata uses the JWT, not a separate API secret.

For eligible ChatGPT plan access:

```sh
npm run connect:chatgpt --prefix backend
```

Open **http://127.0.0.1:4389** and complete consent. A separate scoped registration and renewable credentials live under `.local/chatgpt-auth/`. Coding-agent credentials are never read. See OpenAI's [local sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in) and [inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference) guides. This supports text/image analysis within the account's plan limits, not image generation. An interrupted rotating-token refresh requires reconnection rather than blind retries.

[Pinata uploads](https://docs.pinata.cloud/api-reference/endpoint/upload-a-file) publish public content. Qualification uses only small synthetic artifacts.

## Spending and recovery

Live operator execution requires `INTEGRATION_ALLOW_MAINNET=true`. Default qualification ceilings: **1 USDC** gross Base transfers, **0.0001 ETH** Base gas, **0.15 NEAR** fees, **7.5 NEAR** concurrent allocations, **16 NEAR** gross allocations, and **12 NEAR** retained in treasury. Refunds never reset gross counters. Exact integer accounting persists across restart and processes.

Signed bytes/hashes are durable before broadcast. [NEAR finality](https://docs.near.org/api/rpc/transactions) and relevant receipts are checked before settlement. Unknown outcomes retain reservations. Explicit rebroadcast reuses identical bytes/hash. A narrowly constrained lower-gas settlement replacement consumes the same unused nonce; its predecessor reservation clears only after final inclusion.

Ordinary pinned Intents transfers move exact principal; the configured swap fee is not an extra transfer surcharge. [1Click fees](https://docs.agentsonintents.com/integration/distribution-channels/1click-api/fee-config) and slippage are separate. Provider `SUCCESS` alone never proves payout: return verification requires canonical finalized Base USDC Transfer logs to the quoted original wallet.

```sh
node backend/bin/qualify.mjs preflight
node backend/bin/qualify.mjs balances
node backend/bin/qualify.mjs status
node backend/bin/qualify.mjs fund A
node backend/bin/qualify.mjs fund B
node backend/bin/qualify.mjs campaign failure
node backend/bin/qualify.mjs buy failure A
node backend/bin/qualify.mjs buy failure B
node backend/bin/qualify.mjs claim failure A
node backend/bin/qualify.mjs finalize failure
node backend/bin/qualify.mjs claim failure B
node backend/bin/qualify.mjs recover failure
```

The success scenario uses 10/15-cent principal, final NFT rights, evidence, issue decisions and post-review payouts. `qualify-api.mjs` exercises the HTTP flow with dedicated wallets. Dates are accelerated synthetic test dates, not commercial defaults.

Recovery keys remain in owner-only `.local/backend/keys/` files; the treasury key remains in private configuration. `qualify.mjs recover success` can return remaining contract NEAR after zero-liability checks, but **also deletes the live NFT contract**; retain it while the proof is needed. Role-wallet balances remain controlled by their retained keys. Keys and operational records are excluded from Git and public deployment.

## Scope

Funded qualification covers Base funding, purchase/takeover, principal refunds, reward cancellation/vesting, final NFT nomination/transfer, artwork/proof, dispute decisions, settlement, native USDC redemption and original-wallet Base returns. Sandbox covers costly rejection/failure cases. Multi-owner application composition uses controlled chain adapters in tests; the funded scenarios use the dedicated qualification seller.

The hosted frontend is not connected yet. Global-code factory creation is a separate Sandbox proof; no mainnet global publication was purchased. Development deployments retain recovery keys and are upgradeable test accounts. This is integration qualification, not a production security audit or automated physical verification.
## Dedicated wallet interface

The [integration lab](lab/README.md) exercises the full owner, buyer, takeover, NFT, fulfillment and payout lifecycle without changing the design prototype. It runs a real local NEAR Sandbox chain and also provides an external-wallet interface alongside the existing mainnet API. See its qualification file for what was tested and its remaining mainnet limits.

Wallet publication uses `POST /api/sales/:id/prepare-publish` and `POST /api/publication-actions/:planId/confirm`. Request reservations, explicit rejections and reconciliation use `/api/wallet-requests`. `POST /api/token-actions` prepares owner-signed native USDC storage, self-withdrawal and redeposit actions. These return unsigned plans; the public API never accepts a customer private key.

## Connected product pages

Build `prototype` with `npm ci --prefix prototype && npm run build --prefix prototype`, and build the wallet bundle with `npm run build:lab --prefix backend`. The local API now serves the product pages at its root (`http://127.0.0.1:4318/` for mainnet); `/lab` remains the dedicated technical console. The static Vercel prototype remains a separate design preview.

The connected pages use persisted owner inventory, edited surfaces, immutable sales, buyer campaigns, individual payments, placement NFTs, public artifacts, participant messages, issue decisions, and original-wallet payouts. `/settings/wallets` switches identities; `/account/recovery` checks original transactions. Prices use native USDC held in NEAR Intents. Base funding and returns use exact, reviewed 1Click routes with final-chain reconciliation.

`npm run lab --prefix backend` starts a valueless real NEAR Sandbox at port 4320. `LAB_PORT=4324 LAB_PUBLICATION_MODE=recoverable npm run lab --prefix backend` exercises dedicated development accounts with retained recovery keys instead of the keyless global-code factory. `prototype/tests/connected-flows.js` is a Playwright CLI scenario for this latter configuration; it uses the actual product forms and signatures. Local clock controls exist only in Sandbox.

Mainnet recoverable publication and funded development identities are separately disabled by default. Enabling them requires the local execution configuration and sufficient approved allocation, gas and treasury-floor limits. Each new development spot currently reserves approximately 7.15 NEAR for code/storage and operating balance; the exact quote uses the compiled artifact and current protocol fees. Recovery must first clear all token liabilities. Deleting a development account also removes its NFT, so retain it while the campaign or demonstration needs that NFT. This account model is for development qualification; the factory path creates keyless accounts.

Photos used for drafting remain private unless the owner explicitly publishes a listing cover. Phone capture uses a short-lived, single-upload capability and needs a device that can reach the same local server. Image analysis proposes editable 2D surfaces; physical dimensions and installation still require owner verification. GPS, measured impressions and automated physical verification are not implemented.

To inspect a dedicated development spot’s recoverable collateral, run `node backend/bin/recover-publication.mjs PLAN_ID SPOT_ID`. This is read-only. Add `--execute` to retire a terminal, zero-liability account and return its remaining NEAR to the configured treasury. Minted NFTs require the additional explicit `--retire-nft` flag. Repeating recovery reconciles the original deletion; it does not create another transfer. Unknown or outstanding transactions block retirement.

The browser scenarios in `prototype/tests/connected-{flows,native,capture,recovery}.js` cover the product forms on a fresh Sandbox. Run the native and takeover scenarios before recovery (recovery registers the arbiter’s token storage once). They exercise one-cent bookings, rejected signatures, two-cent takeovers, NFT authority, real synthetic IPFS artifacts, successful and failed settlement, withdrawals/refunds, camera handoff, API restart and wallet-scoped recovery. Extension prompts still require manual verification with the user’s installed wallet; the automated scenarios use explicitly labeled, valueless Sandbox signers.
