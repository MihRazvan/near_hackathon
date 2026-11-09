# Everywhere — advertise on everything

A marketplace concept for buying and selling advertising space on physical objects, starting with vehicles. **Everywhere is a working name.**

**[Open the live prototype](https://everywhere-near.vercel.app)** · **[Browse every screen](https://everywhere-near.vercel.app/_screens)**

This repository currently publishes an interactive product prototype: 63 navigable screens covering public discovery, buyer campaigns, booking and takeovers, owner onboarding, editable ad spots, campaign sales, artwork review, installation proof, dashboards and support.

## Run locally

Requires Node.js 22.12+ or 24+ and npm.

```sh
cd prototype
npm ci --ignore-scripts
npm run dev
```

Open **http://localhost:4173**, or **http://localhost:4173/_screens** for the complete page index. The review bar switches sample personas and page states. Demo controls advance campaign stages and save page-specific feedback.

## Prototype scope

All authentication, payments, balances, AI generation, placement passes and analytics are simulated with local sample data. This website does not connect to wallets, submit blockchain transactions or verify physical ad delivery. State persists in the current browser; Reset restores the starting story.

The intended NEAR-powered marketplace lets owners publish dated campaigns, buyers book under published rules, and enabled spots accept takeovers before production. A final placement right is issued when bidding closes. These are product concepts represented by this mock; they are not live integrations in this deployment.

## Development and deployment

```sh
npm test --prefix prototype
npm run build --prefix prototype
vercel deploy --prod
```

Vercel configuration lives at the repository root. Website source and tests live in [`prototype/`](prototype/); see its [README](prototype/README.md) for connected review journeys and browser checks. No credentials or environment variables are required for the prototype.

## NEAR contracts and local integration

The integration branch includes a [local backend and HTTP API](backend/README.md), the [dated campaign contract](contracts/campaign-marketplace/README.md), the frozen financial proof and [actual Sandbox suites](proofs/sandbox/README.md). The backend handles wallet sessions, inventory, multi-owner buyer campaigns, exact Intents signatures, original-payer claims, final placement NFTs, artwork/proof, settlement and cross-chain returns. The hosted prototype remains independent and uses mock data.

Backend, unit and Sandbox tests require no funded wallet. The backend also starts in read-only mode without credentials. Follow the package instructions to reproduce local execution; funded public qualification is distinct from fixtures and Sandbox tests.
