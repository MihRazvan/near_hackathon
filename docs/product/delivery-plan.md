# Commit and delivery plan

Proposed **8 November 2026**. The user requested meaningful commits/pushes and a complete experience definition before starting the product mock.

## Current state

At the start of this planning pass, `origin/main` contained the initial README commit. The local working tree contained roughly 170 pending paths covering research, contracts, tests, payment qualification, browser fixtures, public evidence and documentation. The application mock does not yet exist. Existing root/proof READMEs include historical implementation statements that need reconciliation.

The local dedicated identities and journals are under `.local/`; they must stay out of Git. Dependencies, compiled output, generated WASM and browser session output are excluded through root and per-proof ignore files. Public proof artifacts still need review: “public signature” is not by itself a reason to publish every operational record or screenshot.

Do not turn the existing work into one catch-all commit, and do not pretend the recovered baseline was developed in a historical sequence it did not have. Commit messages should describe coherent snapshots and the actual feature they introduce.

## The first small increment

Commit this product-planning package and repository ignore rules as **documentation and repository hygiene only**:

- `docs/product/README.md`
- `docs/product/research.md`
- `docs/product/experience-map.md`
- `docs/product/delivery-plan.md`
- `.gitignore`

Suggested message: `docs: map marketplace journeys and mock design scope`.

Validate local links, screen IDs, decision status, diff formatting and the exact staged file list, then push this increment. The existing modified root README, contract code and payment console remain outside this commit. Its purpose is to give the team a reviewable product discussion without publishing an unreviewed technical backlog.

## Recover the existing technical baseline in coherent groups

These are proposed dependency-ordered groups. Determine exact file sets and verify the staged snapshot before making each commit; this is not permission to sweep in an entire directory blindly.

| Group | Intended commit | Boundary and validation |
|---|---|---|
| T01 | `docs: record NEAR research and architecture decisions` | Research/strategy source documents, dated assumptions, citations and the distinction between experiments and product. User-supplied hackathon guidance stays a reference; later user overrides remain explicit. |
| T02 | `feat: establish tested NEAR escrow and storefront baseline` | Rust workspace, contract code, fixtures, NFT authority, factory, local-chain suites and matching build tooling. These files are coupled through workspace members and the build script. Prefer an honest runnable baseline of a few dozen files to several broken commits. Split further only if manifests/scripts/tests remain coherent at every boundary. |
| T03 | `test: qualify deployed Intents compatibility and wallet signatures` | Independent Node/Python public probes and offline signing fixtures with lockfiles; review captured upstream source/evidence, attribution and what needs versioning. Exclude downloaded binaries and dependencies. |
| T04 | `feat: add mainnet qualification and account setup tools` | Read-only preflight, dedicated key handling, setup/deployment planning/execution, public provider rules and tests. Include required transitive modules; do not introduce a module with a missing local import. |
| T05 | `feat: add recoverable USDC checkout and scoped relay` | Funding journal, purchase/signature validation, reconciliation, narrowly scoped relay, return planning and backend tests. A standalone return module may be a further commit if its dependencies allow it. |
| T06 | `feat: expose wallet selection and two-buyer qualification UI` | Local server integration, UI, browser mocks and tests. This is the technical qualification console, not the product marketplace. Small provider/account/recovery follow-ups are separate commits only if they remain usable independently. |
| T07 | `docs: reconcile proof status and publish reviewed evidence` | Correct the root README and proof map; select reproducible public records and explain actual mainnet versus local/mock results. Update links/counts against the committed source. |

The empty-campaign refresh helper is test-only maintenance code with narrow assumptions, not a public asset-management feature. Preserve its context and restrictions in the appropriate technical group; do not silently promote it into the product.

For each group: stage explicit paths, inspect the diff, run checks that fit the change, commit, and push. If a claimed feature depends on uncommitted code, include the minimal dependency or move that feature to the next group. Local ignored credentials must never be necessary for a basic contributor test run.

## Build the agreed product mock in reviewable feature slices

First resolve the high-impact decisions in the experience map. Then implement these as parts of **one agreed complete experience**, with a visible page index and all remaining destinations tracked. These are commit/review boundaries, not a replacement for the full product plan.

| Increment | User outcome | Included pages/interactions |
|---|---|---|
| M01 | The teammate can navigate the whole proposed product. | App shell, shared patterns, sample personas/data, screen index, role/workspace switch and page destinations. Track unfinished routes explicitly rather than pretending they work. |
| M02 | A visitor can find a space and understand what they can buy. | Home, explorer/search/filters, owner profile, Pitboard-style asset page, spot selection, sale periods and fixed/takeover variants. |
| M03 | An owner can turn an object into editable inventory. | Capture/upload/prompt entry, desktop/phone handoff, generation/review states, surface editor, saved asset and asset list. |
| M04 | An owner can publish and manage more than one sale. | Sale setup, schedule, spot prices including printing/installation, takeover default and per-spot overrides, owner-managed production responsibilities, preview/publish, sales list/detail and availability calendar. |
| M05 | A buyer can purchase and take over with understandable recovery. | Buyer campaign creation, wallet-only sign-in simulation, instant checkout, simulated wallet selection, payment progress, accepted/displaced states, receipts and available/conditional credits. No real funds or wallet calls. |
| M06 | Both parties can move from paid booking to physical delivery. | Buyer/owner booking workspaces, creative revisions and approval, production lock, installation evidence, proof review and final placement-pass states. |
| M07 | Both sides can operate day to day. | Buyer and owner dashboards, multi-asset/campaign lists, truthful sample analytics, earnings held through campaign/review then available for payout, inbox, notifications and settings. |
| M08 | The complete mock has no hidden dead ends. | Help/policies/support, operator review and recovery views, remaining empty/error/access states, responsive review, route walkthrough and designer handoff. |

Keep one sample data model across these slices. A purchase or takeover should update the related public page, private dashboards, notifications and money view. Do not create unrelated hardcoded screenshots that disagree about the same booking.

Each meaningful increment should be inspectable on a branch/preview and have a short statement of what the teammate can now do. If there is enough related work to review as one small pull request, use that boundary. Push commits regularly; merging and deployment follow the agreed repository workflow rather than being bundled into an unrelated edit.

## Review standard

Before implementation, review the public asset page, both creation wizards, checkout, booking workspace and money terminology together. After implementation, walk the complete mock using the documented personas and scenarios; verify mobile layouts and every primary action. The handoff includes page states and interaction notes, not just a home page and dashboard screenshots.

The immediate approval is about the **experience specification**. Visual design and production integration are subsequent work. No new funded transaction, live deployment or production migration is part of this research increment.
