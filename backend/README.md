# Everywhere backend

The API connects physical advertising inventory to the shared NEAR marketplace hub and USDC held in NEAR Intents. It also serves the connected frontend and the external-wallet adapter.

## Run

Requires **Node.js 24.12 or newer**. Run from the repository root:

```sh
npm ci --prefix backend --ignore-scripts
npm ci --prefix prototype --ignore-scripts
npm run build:lab --prefix backend
npm run build --prefix prototype
npm start --prefix backend
```

Open **http://127.0.0.1:4318**; health is `/api/health`. `build:lab` builds the shared wallet adapter used by the application. Execution is disabled unless explicitly configured. SQLite defaults to the ignored `.local/backend/` directory in development. Optional development settings are read from an owner-only `.local/integration.env`; production uses explicitly supplied configuration.

A configured hub account and code hash identify the marketplace deployment. The operator needs a separate relayer account for authorized relays and background transactions. Public artifact uploads require a server-side pinning-provider token. Base funding/withdrawal routes require their provider configuration. No customer private key is accepted by the HTTP API.

## Application services

| Service | Responsibility |
| --- | --- |
| `Auth` | Origin-bound EIP-191/NEP-413 challenges, signature verification and persistent wallet sessions. Production sessions use secure HttpOnly cookies. |
| `Marketplace` / `Product` | Owner inventory, editable surfaces, fixed-date sales, buyer campaigns, discovery, messages and wallet-scoped workspaces. |
| `HubPublication` / `ChainService` | Terms-bound publication, qualified shared-hub attachment, exact Intents authorizations and original-creditor payouts. Eligible publication can use the hub's bounded sponsor pool. |
| `NativeActions` | Unsigned native-wallet transaction plans and verification of the exact finalized transaction. EVM hub actions use verified Intents authorization. |
| `NearReads` | Recent finalized state, pinned code/assets, matching campaign terms and pooled escrow solvency checks. |
| `NearExecutor` | Durable signed bytes, operation identities, signer locks, fee budgets and original-receipt reconciliation for relayer transactions. |
| `Media` | Public-content consent, bounded uploads, content references and retrieved-byte SHA-256 verification. |
| `OneClick` / funding / returns | Quoted Base USDC funding and return routes, original-wallet destination checks and finalized delivery evidence. |
| Reconciliation worker | Reads existing operations and synchronizes receipts and bookings; it does not initiate transfers or settlement. |
| Production keeper | Bounded, leased maintenance of published offers on the configured hub: final NFT minting and eligible successful settlement. It does not decide disputes or automatically finalize failure. |

The commercial terms of a published sale are fixed. A buyer campaign can combine placements from different owners, but each spot has an independent booking and settlement. Takeovers end before artwork production; the final placement NFT is issued directly to the final payer. NFT ownership changes do not redirect financial credits.

Participants can sign an on-chain issue before the review deadline. Open issues block successful settlement until the independent arbiter resolves them. Installation evidence and hashes preserve what was submitted; they do not independently verify physical delivery or audience exposure.

## API outline

All application endpoints start with `/api`. JSON mutations require `Content-Type: application/json`; browser clients send their session cookie. Sign-in and payment authorization are separate.

| Flow | Entry points |
| --- | --- |
| Public discovery | `GET /catalog`, `GET /browse`, `GET /sales/:id` |
| Account | `POST /auth/challenge`, `POST /auth/verify`, `GET /auth/session`, `POST /auth/logout`, `GET /workspace` |
| Owner setup | `/assets`, `/sales`, `/captures`, `/ai/draft` |
| Publication | `POST /sales/:id/publication-options`, `/sales/:id/prepare-publish` |
| Buyer | `/campaigns`, `/bookings`, `/intents` |
| Actions and evidence | `/native-actions`, `/token-actions`, `/media`, `/placements/:id/issues` |
| Money and recovery | `/wallet/balances`, `/claims`, `/routes`, `/wallet-funding`, `/withdrawal-intent`, `/wallet-requests` |

Prepared plans bind their actor, receiver, amount or action, terms and relevant state. Intents include authorization nonces and deadlines. Changed prices require a fresh review. Submitted operations keep their original hashes. An unknown result must be reconciled before another payment. Refunds and withdrawals go to the original entitled wallet, subject to its signed withdrawal instructions.

## Optional AI

Manual onboarding works without AI credentials. Owners can describe a vehicle, upload a photo and edit approximate 2D surfaces. AI suggestions still require owner review; the system does not infer verified physical measurements.

A server API provider can be configured for public AI drafting with `OPENAI_API_KEY` and optional `OPENAI_MODEL`. A separate personal companion supports an owner's own locally authenticated ChatGPT connection, restricted to explicitly configured owner wallets. Public visitors cannot consume that personal subscription. OAuth credentials stay local; pairing secrets belong only in protected server/local configuration.

Local personal sign-in is available through `npm run connect:chatgpt --prefix backend`. The companion runs with `node backend/bin/personal-ai-agent.mjs`; its explicit configuration is defined in [the agent](bin/personal-ai-agent.mjs). It must remain online for its owner to use that connection. The ordinary manual editor remains available when AI is offline.

## Tests

```sh
npm test --prefix backend
npm test --prefix prototype
```

Unit tests use isolated stores and controlled provider responses. See [Sandbox proofs](../proofs/sandbox/README.md) for actual compiled-contract suites.

### Production interface on NEAR Sandbox

Requires the pinned Rust toolchain/Wasm target, Python 3, Playwright from the backend development dependencies, and Google Chrome (`PLAYWRIGHT_CHANNEL=chrome`, the runner's default). Build the fixture inputs from the repository root:

```sh
python3 proofs/intents-compatibility/fetch-pinned.py
bash scripts/build-hub.sh
cargo build --locked --release --target wasm32-unknown-unknown -p proof-test-token
cp target/wasm32-unknown-unknown/release/proof_test_token.wasm target/proof-artifacts/test-token.wasm
cargo build --locked -p technical-proof --bin hub-lab-chain
npm run build:lab --prefix backend
npm run build --prefix prototype
node backend/bin/product-sandbox.mjs
```

The runner starts a fresh real NEAR Sandbox and a production-mode API with development wallet/lab endpoints disabled. It uses the actual pinned Intents verifier, compiled shared hub, synthetic USDC and generated EVM keys held only in the Node test runner. A fresh owner starts without NEAR or USDC funding. No personal environment file or public funded wallet is loaded.

The scenario exercises publication, purchases/takeover, a rejected signature, a lost submit response, recreated API/store/workers with retained SQLite state, automatic NFT minting, artwork approval, installation evidence, participant issues, arbiter resolution, automatic success, exact original-wallet payouts and native USDC delivery. It also checks that `accountsChanged` invalidates the prior session. Final assertions require all received offer funds to be withdrawn, with no pending withdrawals or remaining liabilities.

Qualification boundaries are explicit: the browser wallet provider is injected, while its signatures and contract execution are real. Pinning HTTP uses isolated synthetic storage, with the real media validation and retrieved-byte hashing. Native arbiter actions use the authenticated API; the direct native-USDC withdrawal is exercised through the interface. Real extension/Meteor approval windows, hosted provider availability and Base bridge delivery need separate qualification. Generated evidence stays under ignored `.local/product-sandbox/`.

## Production hosting

The [Dockerfile](../Dockerfile) builds the frontend and wallet adapter, then runs the API on Node 24.12. [Railway configuration](../.railway/railway.ts) uses one replica, `/api/health`, a persistent volume and bounded CPU/memory. Install its tooling with `npm ci --prefix .railway --ignore-scripts`; preview infrastructure changes with `railway config plan` before applying them. Set `APP_STATE_DIR` to the mounted state directory; preserve and back up the SQLite database and transaction journals across deploys. An ephemeral serverless filesystem is not suitable for this state model.

Use the [configuration template](../.env.example). Configure `APP_ENV=production`, exact HTTPS `APP_ORIGIN`/`APP_API_ORIGIN`, the pinned hub account/code hash, provider credentials and the relayer's server secret. Production does not discover a developer's local environment file. Live execution and the keeper each require explicit enablement. Cross-origin static hosting needs matching allowed origins and API/wallet-asset routing.

Private reference photos share an atomic 128 MiB local quota, which `APP_LOCAL_PHOTO_MAX_BYTES` can lower. Assets and camera handoffs also have per-wallet and global limits; expired handoff photos and capabilities are removed. Public IPFS uploads have a separate byte quota. These limits preserve room on the persistent volume for payment journals.

For a one-time migration, stop the original writer and reconcile all unfinished operations before exporting a standalone SQLite snapshot. Put it beside the state directory on the mounted volume and configure `APP_STATE_IMPORT_PATH` and its exact `APP_STATE_IMPORT_SHA256` in the hosting process environment. Startup verifies its integrity, schema and operation journals before replacing an empty bootstrap database. Populated customer state is refused. A durable import marker prevents subsequent restarts from restoring the old snapshot over newer transactions. Keep transaction execution disabled on the destination until the original writer is stopped and migration is verified.

Keep the hub administrator/upgrade key local and use a separate hosted relayer account. The hub retains an upgrade key; code-hash qualification detects changes but does not remove that trust assumption. Customer wallet keys and personal AI subscription credentials never belong in the frontend, public repository or hosted application secrets.
