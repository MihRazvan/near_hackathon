# Local marketplace backend

Node.js 24.12+ backend integration, developed independently of the frontend prototype. This slice provides durable SQLite state, original-wallet authentication and recoverable spending reservations. It is not yet a public hosting configuration.

```sh
npm ci --prefix backend --ignore-scripts
npm test --prefix backend
```

Financial amounts are canonical integer strings. SQLite transactions aggregate budgets across wallets and processes. Operations bind a stable ID to a canonical plan hash; a repeated operation never authorizes another send. Unknown outcomes retain reservations across restart. Accounting is finalized only with matching verified chain evidence; storage recovery releases concurrent capital without resetting gross-spend counters.

`Auth` accepts EIP-191 challenges and NEP-413 signatures. Challenges bind the origin, wallet, network, nonce and expiry and can create one session only. NEAR verification additionally requires a current full-access key. Sessions contain hashed bearer tokens, not wallet keys. Signing in authorizes no financial transaction.

The default credential path is an ignored local server file; it is read only when `loadConfig` is explicitly called. Real keys are omitted from serializable configuration and never bundled into the frontend. No credentials or funded account are required for the tests. Additional HTTP, protocol and application services are delivered in subsequent slices.
