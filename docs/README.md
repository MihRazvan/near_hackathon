# Everywhere documentation

[Overview](../README.md) | [User flow](USER-FLOW.md) | [Architecture](TECHNICAL-ARCHITECTURE.md) | [Contracts](CONTRACTS.md) | [Verify](../VERIFY.md) | [Deployments](DEPLOYMENTS.md)

Everywhere makes physical advertising placements bookable in USDC and gives the final advertiser a transferable NEP-171 creative right. Start with the product, then follow a claim to its implementation and executable evidence.

| Read | Question it answers |
| --- | --- |
| [Project brief](PROJECT-BRIEF.md) | What is different, which tracks fit, and what was built here? |
| [User flow](USER-FLOW.md) | How do the owner, advertiser, studio and arbiter use the platform? |
| [Technical architecture](TECHNICAL-ARCHITECTURE.md) | Where do inventory, signatures, AI, media and settlement live? |
| [Contracts](CONTRACTS.md) | What does the shared hub enforce, and what moves with the NFT? |
| [Verification guide](../VERIFY.md) | Which commands establish which claims? What needs a network? |
| [Build guide](../BUILD.md) | How can the deployed WASM be reproduced exactly? |
| [Deployment and campaign status](DEPLOYMENTS.md) | Which mainnet records are real, which media are synthetic, and what is pending? |
| [Demo and submission links](DEMO.md) | Where will the video and X post go, and what can be inspected now? |
| [Visual provenance](assets/README.md) | Which images are screenshots, illustrations or diagrams, and how are they regenerated? |

## Start without a wallet

Open the [live marketplace](https://everywhere-near.vercel.app/explore) and a [completed campaign record](https://everywhere-near.vercel.app/records/e22dd301-786f-476c-af74-0df7cd2e6168), or run:

```sh
node scripts/verify.mjs
node scripts/verify.mjs --offline
```

The quick verifier uses isolated state and configuration. It does not load personal keys or authorize public-chain actions. The [verification guide](../VERIFY.md) describes its reports and failure modes.

## Implementation entry points

| Area | Source |
| --- | --- |
| Current on-chain implementation | [`contracts/marketplace-hub`](../contracts/marketplace-hub/) |
| Persistent API and wallet plans | [`backend/src`](../backend/src/) |
| Connected frontend and placement editor | [`prototype/src`](../prototype/src/) |
| Real local-chain interface qualification | [`product-sandbox.mjs`](../backend/bin/product-sandbox.mjs), [`production-browser.mjs`](../prototype/tests/production-browser.mjs) |
| Mainnet identity and evidence | [`deployments`](../deployments/) |
| CI checks | [`verify.yml`](../.github/workflows/verify.yml) |

The `prototype` directory name is historical: it contains the working application. Older marketplace/factory crates and the backend lab preserve earlier experiments and are labelled as such. Private research, operational journals, personal credentials and internal planning documents are not part of this public docs set.
