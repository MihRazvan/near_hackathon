# Local marketplace backend

Node.js 24.12+ backend integration, developed independently of the frontend prototype. This slice provides durable SQLite state, original-wallet authentication and recoverable spending reservations. It is not yet a public hosting configuration.

```sh
npm ci --prefix backend --ignore-scripts
npm test --prefix backend
```

Financial amounts are canonical integer strings. SQLite transactions aggregate budgets across wallets and processes. Operations bind a stable ID to a canonical plan hash; a repeated operation never authorizes another send. Unknown outcomes retain reservations across restart. Accounting is finalized only with matching verified chain evidence; storage recovery releases concurrent capital without resetting gross-spend counters.

`Auth` accepts EIP-191 challenges and NEP-413 signatures. Challenges bind the origin, wallet, network, nonce and expiry and can create one session only. NEAR verification additionally requires a current full-access key. Sessions contain hashed bearer tokens, not wallet keys. Signing in authorizes no financial transaction.

The default credential path is an ignored local server file; it is read only when `loadConfig` is explicitly called. Real keys are omitted from serializable configuration and never bundled into the frontend. No credentials or funded account are required for the tests.

`NearReads` binds price, campaign rules, credits, protocol code and escrow solvency to one finalized block. EIP-191 purchase plans commit the exact receiver, asset, amount, invoice, round and terms hash. `NearExecutor` and `BaseExecutor` persist signed bytes and transaction hashes before sending. An interrupted send is reconciled by its original hash; repeating an operation never dispatches another transfer. A local signer remains locked while its transaction outcome is unknown.

Base funding uses native USDC and a bounded [1Click exact-output route](https://docs.agentsonintents.com/integration/distribution-channels/1click-api/swap-types). Quote validation checks both destinations, deadlines and the authenticated upstream fee. [Provider fees](https://docs.agentsonintents.com/integration/distribution-channels/1click-api/fee-config) are separate from campaign principal. Only finalized Base receipts containing the exact USDC Transfer settle the source budget. An available return route does not imply a withdrawal has happened.

Explicit local operator commands use the ignored credential file and journal. Reads do not authorize writes; execution additionally requires `INTEGRATION_ALLOW_MAINNET=true`. Use dedicated test wallets only. The qualification funding command delivers 0.25 USDC per buyer, with a maximum input of 0.30 USDC and a persistent operation ID per buyer. Funding and marketplace purchase are distinct operations.

```sh
node backend/bin/qualify.mjs preflight
node backend/bin/qualify.mjs balances
node backend/bin/qualify.mjs fund A
node backend/bin/qualify.mjs fund B
node backend/bin/qualify.mjs status
node backend/bin/qualify.mjs routes
```

The local API and application services are delivered in subsequent slices. This branch disables Vercel Git deployments and does not change the hosted frontend prototype.
