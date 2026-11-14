# Documentation visual provenance

[Overview](../../README.md) | [Docs index](../README.md)

These images explain the implementation and show its interface. They are not independent transaction or physical-installation evidence; those claims have separate [verification paths](../../VERIFY.md).

## Authored graphics

| Image | Editable source | Content |
| --- | --- | --- |
| [Banner](banner.png) | [banner.html](source/banner.html) | Everywhere branding and the existing illustrative van creative |
| [Creative right](nft-rights.png) | [nft-rights.html](source/nft-rights.html) | NEP-171 creative authority versus original financial creditors |
| [Campaign flow](lifecycle.png) | [lifecycle.html](source/lifecycle.html) | Owner → advertiser → NFT holder → delivery → settlement |
| [Architecture](architecture.png) | [architecture.html](source/architecture.html) | Off-chain application/services and NEAR-enforced rights and accounting |
| [Contract timeline](contract-lifecycle.png) | [contract-lifecycle.html](source/contract-lifecycle.html) | Booking, artwork, service/review and settlement gates |

The diagrams are repository-native HTML/CSS with authored SVG connector geometry, rendered with Playwright. They use the application's existing Bricolage Grotesque / Hanken Grotesk fonts and pink `#ff3d9a`, cobalt `#2340ff`, ink `#1a1a1a`, wall `#dedcd6` and paper `#f7f6f2` palette. No AI-generated UI or image text is used.

The banner embeds the existing `van-dublin-ad.webp` illustration. The editor fixture uses `setup-van.webp`. Original-photo, AI-edit, generated-reference and font provenance/license notices are in [application asset credits](../../prototype/public/ASSETS.md). This documentation does not relicense those assets.

Regenerate the five graphics from the repository root after installing locked backend dependencies:

```sh
node scripts/render-doc-assets.mjs
```

A local Google Chrome installation is the default. `PLAYWRIGHT_CHANNEL` can select an installed Playwright browser. The renderer serves only documentation artwork and the referenced public fonts/images on loopback, blocks remote requests and makes no AI, wallet, API or chain calls.

## Interface screenshots

Capture details and timestamps live in [screenshots.json](screenshots.json).

| Image | Origin | Boundary |
| --- | --- | --- |
| [Marketplace](marketplace.png) | Anonymous public `/explore` | Real UI at capture time; listed vehicles are generated team-test references. |
| [Mobile marketplace](marketplace-mobile.png) | Same public page at 390px | Interface capture, not transaction evidence. |
| [Vehicle listing](listing.png) | Public motorcycle listing | Actual placement outlines, offer choices and observed state. |
| [Placement NFT](nft-record.png) | Public van campaign record | Recorded creative handoff; it is not installation evidence. |
| [Editor](editor.png) | Actual built frontend with an isolated API fixture | Fixture-owned draft; no real sign-in, paid inference, publication or payment. |

Public captures use a fresh anonymous browser context, reduced motion, GET/HEAD requests and no connected wallet. Screenshots are not edited to invent balances, prices, ownership, availability or successful verification. Provider availability and current campaign state may differ when the pages are revisited.

The public records preserve the distinction between real USDC transactions and synthetic artwork/delivery. The genuine motorcycle pilot is separately pending installation. Keep those captions when reusing these images.
