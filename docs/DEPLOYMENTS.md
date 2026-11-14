# Deployments and campaign status

[Overview](../README.md) | [Project brief](PROJECT-BRIEF.md) | [User flow](USER-FLOW.md) | [Architecture](TECHNICAL-ARCHITECTURE.md) | [Verify](../VERIFY.md) | [Docs](README.md)

## Mainnet identity

The app and verification tools use the account IDs and hub code hash in the [deployment manifest](../deployments/mainnet.json). It also links the recorded mainnet test.

| Item | Identity |
| --- | --- |
| Application | [everywhere-near.vercel.app](https://everywhere-near.vercel.app/) |
| Shared hub | [8a97f02b08b964bb618031529dfacf8cb4f922ddc646ef525c4d68355f81be20](https://nearblocks.io/address/8a97f02b08b964bb618031529dfacf8cb4f922ddc646ef525c4d68355f81be20) |
| NEAR code hash | `5i3hw9oXjH6Ri3fGGZ177U7ckk87oeqtUUVxtYMgPsiS` |
| Deployed WASM SHA-256 | `45f29ecac83ae3c31c7e8f300d314484d82184f40f35c4bb92c319f298b5240b` |
| Intents verifier | `intents.near` |
| Native USDC | `17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1` |

[The completed qualification](https://everywhere-near.vercel.app/records/e22dd301-786f-476c-af74-0df7cd2e6168) used real payments, final NFT issuance and original-wallet payouts. Artwork and installation evidence are synthetic; no physical ad was installed.

## Read-only verification

```sh
node backend/bin/verify-evidence.mjs --offline
node backend/bin/verify-evidence.mjs
node backend/bin/verify-evidence.mjs --history-rpc https://archival-rpc.mainnet.near.org
node backend/bin/verify-evidence.mjs https://archival-rpc.mainnet.near.org
```

The offline command checks committed bytes and manifest consistency without dependencies or network access. Online verification separately checks historical receipts and current qualified state. A positional HTTPS RPC is exclusive unless a separate history provider is explicitly supplied. An RPC that lacks old receipts or hits a rate limit returns an unavailable result. A mismatch means the verifier received data that disagreed with the manifest. [Diagnostics and limits](../VERIFY.md#mainnet-records-without-spending).

## AI and hosting

Owners can start from a photo or description on the homepage. After wallet sign-in, upload a vehicle photo, send one through a private phone QR link, describe a vehicle, or choose the labelled example van. NEAR AI proposes editable panel outlines. A description can generate a labelled reference image before panel detection. Drafts are private and do not allocate NEAR.

Try `/host/assets/new`, move a panel or type `Rename the first panel to Studio panel`, then continue to the offer screen. Set the operating area, campaign dates, all-in prices and per-panel takeover rules. Save a campaign draft or publish with wallet approval. Each published spot uses the existing hub; NFT issuance follows booking close. Complimentary publication depends on the live sponsor pool and limits.

Configure `NEAR_AI_API_KEY` on the server. Development also reads this credential from the owner-only `.env.local`; production uses explicit process secrets. `NEAR_AI_MODEL` defaults to `z-ai/glm-5.3-flash` with minimal reasoning. `NEAR_AI_IMAGE_MODEL` defaults to `black-forest-labs/FLUX.2-klein-4B`. `sharp` prepares generated images and `qrcode` renders the phone link locally. AI jobs have per-wallet/global limits, stable request IDs and retained results. A page reload checks its original job; interrupted paid inference is never retried automatically. Panel instructions apply explicit changes and keep unrelated geometry and prices. Manual editing remains available during provider outages.

The optional provider benchmark accepts up to 20 photos and writes a private report with latency and usage measurements:

```sh
node backend/bin/benchmark-vehicle-ai.mjs --run /path/to/manifest.json .local/vehicle-ai-report.json
```

The manifest contains entries such as `{"file":"/path/to/vehicle.jpg","prompt":"Suggest visible body panels"}`. It spends configured AI credits and makes no chain transactions. An owner still needs to review panel accuracy and measure the vehicle.

The personal AI companion uses its owner's local ChatGPT session and accepts only that owner's allowlisted wallets. Subscription credentials stay on the owner's computer.

Production uses the [Docker image](../Dockerfile) and [Railway configuration](../.railway/railway.ts), one application instance and a persistent SQLite volume. Configure HTTPS origins and server secrets explicitly. A separately hosted static frontend needs routes to the API and wallet adapter. Deployment configuration is described in the [backend README](../backend/README.md#production-hosting).

Personal wallet keys, local credentials, state databases and private test-run reports are excluded from the repository. The public qualification manifest and its three hash-bound evidence files are committed for independent checks.

## Physical motorcycle pilot

The team plans to install an Everywhere ad on its Pitboard motorcycle. The [motorcycle setup](https://everywhere-near.vercel.app/host/assets/new?pilot=motorcycle) includes editable Honda CBR600F2 details and downloadable outlined vector artwork. Opening this setup creates no saved draft, publication or payment, and the ad still needs installation. The owner must confirm the actual motorcycle details, permitted panel, dimensions, city, schedule and printing requirements, upload a current photo, and later supply real installation evidence. The draft artwork has no fixed print size. The existing public test uses synthetic delivery evidence.

## Team-run vehicle campaigns

Team-test listings use AI-generated vehicle references and nominal real USDC payments on the shared mainnet hub. The listing purpose and image provenance are committed in the published terms. Cards, checkout and public records label these campaigns; checkout requires acknowledgement that no physical advertising will be delivered. These test records have synthetic delivery evidence. The four generated reference covers and their prompts are credited in [ASSETS.md](../prototype/public/ASSETS.md).


| Vehicle | Current setup | Open |
| --- | --- | --- |
| Bucharest sport motorcycle | Side fairing and tail panel, each starting at 1¢ USDC; tail panel uses fixed booking | [Listing](https://everywhere-near.vercel.app/spaces/0627cf2a-28ad-4952-a16f-6b9fdfdbbe87?sale=2c541941-6d2f-4cf2-8cad-375cf4ad43ff) |
| Lisbon blue hatchback | Door-panel takeover starts at 2¢; independent rear door starts at 1¢ | [Listing](https://everywhere-near.vercel.app/spaces/7aec3544-317c-494c-adc2-cab5d510aa17?sale=59fca18a-6594-4591-a241-593c2604d76e) |
| Berlin workshop van | Cargo-panel NFT transferred to studio, studio artwork submitted; independent cab door starts at 1¢ | [NFT record](https://everywhere-near.vercel.app/records/aa80efd3-472d-4e64-b8f8-fec738d2d3e2), [cab-door listing](https://everywhere-near.vercel.app/spaces/3918c8f2-3263-4dfa-971e-02d6d13a6af3?sale=dc7a970a-a0b9-4664-8f7b-e4845a71c007&spot=spot-2) |
| Amsterdam cargo bicycle | Successful synthetic delivery: 3¢ received, 3¢ paid out, zero pending | [Public record](https://everywhere-near.vercel.app/records/fbc318d7-414a-4a2f-ab26-5270c4d7f905) |

Booking remains open for the motorcycle, hatchback and van cab door until **November 19, 2026, 12:00 UTC**, subject to their live on-chain state. Their service and review dates are published on each listing. The van's artwork window remains open until approval or its published deadline. The cargo bicycle's short campaign has completed. All four listings belong to dedicated team test wallets; the physical motorcycle pilot above is separate.

The motorcycle, hatchback and van each have two published placements. The cargo bicycle has one completed placement. Compatible offers are grouped on the vehicle page; selecting a placement keeps its original sale, terms, price, contract and checkout. Each additional surface is published as its own offer.

The [team campaign manifest](../deployments/team-campaigns.json) records seven published offers across the four vehicles, generated-image digests, setup transaction hashes, van NFT transfer and cargo-bike payouts. It excludes automatic keeper mint, finalization and reserve-reclaim transaction hashes that were not captured in that setup journal. The [NFT handoff transaction](https://nearblocks.io/txns/DbHN9bSg6J2Q72ocWBUjMnEsk7VSTy5btqm7W63crMdB) is separately verifiable from its signed action and NEP-171 transfer event. The before/after credit samples record the balances observed during setup.

Run the read-only verifier without keys or funds:

```sh
node backend/bin/verify-team-campaigns.mjs
```

It checks the pinned mainnet hub, all seven published offer bindings, the three additional placement creation receipts, current NFT ownership and artwork reference, the historical van handoff, the completed cargo-bike accounting, and both original-creditor payout transactions. Listing availability and NFT ownership can change after this setup as participants use the platform. These campaigns paid from existing Intents USDC balances and used the shared contract, with no new Base bridge or contract deployment.
