# Everywhere frontend

This directory contains the connected Everywhere application. The `prototype` name is historical; pages use the real API, persisted wallet-scoped records and on-chain campaign state.

## Run with the API

Requires **Node.js 24.12 or newer**. From the repository root:

```sh
npm ci --prefix backend --ignore-scripts
npm ci --prefix prototype --ignore-scripts
npm run build:lab --prefix backend
npm run build --prefix prototype
npm start --prefix backend
```

Open **http://127.0.0.1:4318**. The backend serves `prototype/dist`, `/wallets.js` and `/api` on one origin. For frontend iteration, run `npm run build --prefix prototype -- --watch` alongside the backend and refresh the page. The API and its configured services provide authentication, inventory and transaction state.

## User journeys

- **Marketplace:** browse published vehicles, filter spaces, select surfaces, review campaign dates/rules and book available spots.
- **Advertiser workspace:** create campaigns across owners, approve USDC purchases or takeovers, submit artwork, follow fulfillment, message owners, raise issues and manage refunds/withdrawals.
- **Owner workspace:** describe or photograph a vehicle, review/edit surfaces, publish priced campaign periods, approve artwork, provide installation evidence and manage earnings.
- **Account and operations:** connect/switch wallets, edit profiles, review notifications, reconcile original payment requests, and resolve cases as the campaign's authorized arbiter.

Wallets sign actual authentication and transaction requests. EVM wallets use Intents for hub actions; native NEAR wallets use the NEAR connector. Production hides development identities and local test controls. The final NEP-171 placement right belongs directly to the final payer after booking closes, including an EVM payer; the normal flow needs no separate NFT-recipient nomination.

Manual description/photo onboarding is available without AI. An optional configured provider can suggest editable 2D surfaces. The private personal AI companion serves only its owner's allowlisted wallets through that owner's local connection. Owners must confirm surfaces and real printing measurements.

Campaign status, balances and earnings come from recorded state. Installation evidence is owner-supplied, disputes involve an arbiter, and placement NFTs do not prove physical installation. Reports do not fabricate audience impressions or GPS measurements.

## Code map

| Path | Purpose |
| --- | --- |
| `src/app.mjs`, `routes.mjs`, `ui.mjs` | Public/workspace shell, routes and common visual components. |
| `src/store.mjs` | Minimal session UI state, navigation and notices. |
| `src/integration/runtime.mjs`, `actions.mjs` | API sessions, wallet authorization, forms, transaction progress and recovery. |
| `src/integration/public.mjs`, `buyer.mjs`, `owner.mjs` | Marketplace, advertiser and space-owner journeys. |
| `src/integration/shared.mjs`, `capture.mjs` | Account, messaging, support, arbitration and scoped phone-photo handoff. |
| `tests/*.test.mjs` | Routing, money/status logic, owner/buyer progress and view regressions. |
| `tests/production-browser.mjs` | Actual production-interface flow against the isolated shared-hub Sandbox fixture. |

Surface previews are approximate rectangular layouts on illustrative vehicles or uploaded photos. Photo drafting is private unless the owner explicitly publishes a cover; submitted public artwork/evidence requires consent.

## Verify and host

```sh
npm test --prefix prototype
npm run build --prefix prototype
```

Run the full application browser qualification through [the backend Sandbox runner](../backend/README.md#production-interface-on-near-sandbox). It uses real signatures and contract execution with an injected wallet shell, isolated media transport and clearly stated external-provider limits.

The [Docker deployment](../Dockerfile) serves the compiled frontend with the persistent API. A separately hosted static bundle needs `/api` and `/wallets.js` routed to that backend, matching origins and HTTPS session configuration. Keep keys and provider secrets on their appropriate server/local side; they are never frontend build variables. See [production hosting](../backend/README.md#production-hosting).

## Visual identity

The interface takes its cues from street advertising and transport signage: Barlow Condensed display type, Manrope interface text, petrol blue, signal yellow and warm white. The outward-arrow mark represents a physical surface reaching a wider audience. Marketplace and onboarding pages use street photography; working screens prioritize readable forms, financial states and clear tables.

- `src/brand.mjs` contains the shared wordmark and mark.
- `src/identity.css` defines fonts, tokens, public pages and shared controls.
- `src/workspace-identity.css` carries those tokens into advertiser, owner and operations screens.
- `src/integration/marketing.mjs` contains the homepage composition and illustrative ad preview. It does not create bookable inventory.
- [Asset credits](public/ASSETS.md) record the image sources and included open font licenses. Fonts and photographs are served locally.

Design research included [Barlow’s transit-inspired origins](https://github.com/jpt/barlow), [Anthropic’s frontend design guidance](https://github.com/anthropics/skills/tree/main/skills/frontend-design), [Impeccable](https://github.com/pbakaus/impeccable) and [Vercel’s interface guidelines](https://github.com/vercel-labs/web-interface-guidelines). The application keeps its existing vanilla ES modules and uses native CSS transitions, respecting reduced-motion preferences.
