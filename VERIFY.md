# Verify Everywhere

Everywhere's current contract is the shared NEAR hub in [`contracts/marketplace-hub`](contracts/marketplace-hub/). It enforces per-placement booking, USDC credits, final NFT ownership and artwork/fulfillment gates. The API persists inventory, sessions and transaction journals. The connected frontend is in `prototype/`.

A placement NFT carries time-bounded creative access. Transferring it changes who can manage the artwork; it does not transfer the advertiser's refund or the owner's earnings. Generated vehicle references and owner-submitted evidence do not establish physical installation.

## Verification modes

Run from the repository root using Node.js 22.23+ and npm. These entry points do not load personal wallet credentials or send mainnet transactions. Tool installation/downloads and online RPC checks require network access.

| Command | What it establishes | Boundary |
| --- | --- | --- |
| `node scripts/verify.mjs --offline` | Hash/CID/manifest consistency for committed evidence bytes. | No install, network, current chain state or source compilation. |
| `node scripts/verify.mjs` | Locked JS install, backend/frontend tests, wallet/UI builds and isolated local API smoke check. | No live payment, hosted AI job, real wallet extension or chain execution. |
| `node scripts/verify-build.mjs` | Pinned source compilation and strict optimized WASM comparison (qualified macOS arm64; Linux currently differs). | Does not query current mainnet state or prove historical transactions. |
| `node scripts/verify-sandbox.mjs` | Actual interface, signatures and current hub execution through a complete local-chain campaign. | Valueless local tokens, injected wallet interface and controlled media transport. |
| `node backend/bin/verify-evidence.mjs` | Historical mainnet receipt bindings and fresh qualified state for the recorded campaign. | Requires available historical/current-state RPC providers; no physical-delivery proof. |

The quick/build/Sandbox runners write actual results and stage logs under ignored `.local/verification/<run>/`. `--json` selects a final machine-readable summary; `--help` lists flags. Exit `0` means the selected checks passed, `1` means a test/build/evidence assertion failed, and `2` means a prerequisite or environment dependency was unavailable. The online evidence CLI reports its own distinct verification or unavailable status and exits unsuccessfully unless verification completed; offline integrity must never be interpreted as online success.

For already installed dependencies, the runners support `--skip-install`. Build and Sandbox also support `--check-only`: inspect prerequisite availability without installing tools, compiling or starting a chain. A prerequisite check is not a passed build or lifecycle test.

## Quick local checks

```sh
node scripts/verify.mjs
node scripts/verify.mjs --offline
```

Expected: tests report zero failures, both builds succeed, and the isolated API serves its public shell, health endpoint and empty catalogue. The temporary server is stopped after its checks. A new checkout intentionally has no populated inventory or live execution configuration.

The underlying commands remain independently runnable:

```sh
npm ci --prefix backend --ignore-scripts
npm ci --prefix prototype --ignore-scripts
npm test --prefix backend
npm test --prefix prototype
npm run build:lab --prefix backend
npm run build --prefix prototype
```

To inspect the UI afterward, run `npm start --prefix backend` and open **http://127.0.0.1:4318**. Ordinary application startup reads the development configuration described in [backend setup](backend/README.md); use the verification runner for an isolated check. The [hosted marketplace](https://everywhere-near.vercel.app/explore) provides populated public inventory without credentials.

## Claims and executable evidence

| Behavior | Current implementation | Relevant checks |
| --- | --- | --- |
| NFT ownership determines creative control; approvals/deadlines end editing. | [`artwork`, `placement_owner`, `transfer_placement`, `nft_transfer`](contracts/marketplace-hub/src/lib.rs); [API authority](backend/src/product.mjs). | [Hub unit assertions](contracts/marketplace-hub/src/tests.rs), [production interface transfer/old-controller checks](prototype/tests/production-browser.mjs), [frontend authority states](prototype/tests/placement-nft.test.mjs). |
| NFT transfer preserves original-payer financial claims. | [`transfer_placement`, `fail`, `start_withdrawal`](contracts/marketplace-hub/src/lib.rs). | `evm_owner_is_nft_recipient_artwork_authority_and_claims_remain_with_payer_after_transfer` in [hub tests](contracts/marketplace-hub/src/tests.rs); actual Sandbox handoff and original-wallet payouts. |
| Purchases bind the offer, expected round, amount and committed terms. | [`purchase`](contracts/marketplace-hub/src/lib.rs), [intent plans](backend/src/intents.mjs), [hub plans](backend/src/hub-actions.mjs). | [Hub/API tests](backend/tests/hub.test.mjs), current contract unit tests and Sandbox purchases/takeover. |
| Missing evidence or unresolved issues prevent successful settlement. | [`finalize_success`, `issue`, `decide_issue`](contracts/marketplace-hub/src/lib.rs). | `time_alone_cannot_prove_fulfillment`, `participant_issue_blocks_permissionless_success`, and the [Sandbox issue/arbiter path](prototype/tests/production-browser.mjs). |
| Interrupted payments reconcile their original operation rather than authorizing a second transfer. | [Wallet request journal](backend/src/wallet-requests.mjs), [relayer executor](backend/src/near-executor.mjs). | [Original-intent recovery tests](backend/tests/original-intent-recovery.test.mjs), [provision recovery](backend/tests/provision-recovery.test.mjs), lost-response/API-restart Sandbox scenario. |
| Failed or duplicate callbacks cannot redirect or duplicate credit. | [`on_withdrawal`, `start_withdrawal`](contracts/marketplace-hub/src/lib.rs). | `callback_cannot_credit_twice`, `oversized_successful_transfer_result_never_restores_paid_credit`, and pending-principal/independent-offer checks in [hub tests](contracts/marketplace-hub/src/tests.rs). |

Run the current hub unit suite with rustup and the repository's pinned toolchain:

```sh
cargo test --locked -p marketplace-hub --lib
```

A targeted ownership/financial-entitlement assertion is also available:

```sh
cargo test --locked -p marketplace-hub --lib evm_owner_is_nft_recipient_artwork_authority_and_claims_remain_with_payer_after_transfer
```

The active-window tests `former_payer_cannot_submit_artwork_after_nft_transfer_during_active_window` and `transferred_nft_owner_revises_active_artwork_without_receiving_original_creditors_money` separately assert former-holder rejection, successful new-holder revisions, dynamic metadata and unchanged original-creditor claims. Contract unit tests do not substitute for real verifier/signature execution. The full Sandbox route below covers that integration boundary. [`bash scripts/test-contracts.sh`](scripts/test-contracts.sh) includes both current and historical unit suites; its larger count should not be mistaken for current-hub-only coverage.

## Source and deployed artifact

```sh
node scripts/verify-build.mjs --check-only
node scripts/verify-build.mjs
```

The [build guide](BUILD.md) identifies the pinned compiler, Binaryen optimizer, checksums and flags. Successful comparison establishes equality with [`deployments/evidence/marketplace-hub.wasm`](deployments/evidence/marketplace-hub.wasm), whose SHA-256 is `45f29ecac83ae3c31c7e8f300d314484d82184f40f35c4bb92c319f298b5240b` and NEAR code hash is `5i3hw9oXjH6Ri3fGGZ177U7ckk87oeqtUUVxtYMgPsiS`.

Exact reproduction is currently qualified on macOS arm64. The tested Linux x64 rebuild differs and fails this strict check. Registry panic-location labels are normalized with Rust remap flags; no deployed bytes are modified. The separate CI macOS job requires exact equality. See the build guide for host limitations and actual report diagnostics.

Current mainnet code identity is a separate RPC observation. The online evidence verifier checks it against the manifest while checking campaign identity, accounting and NFT/artifact state. The hub retains an upgrade key: pinned clients detect changed code, but source equality does not make the account immutable or constitute an independent security audit.

## Full interface on a local chain

```sh
node scripts/verify-sandbox.mjs --check-only
node scripts/verify-sandbox.mjs
# Linux: explicit pinned deployed-binary execution plus separate source compile
node scripts/verify-sandbox.mjs --hub-artifact deployed
```

Default `--hub-artifact rebuild` first requires exact source/deployment equality. Explicit `--hub-artifact deployed` separately compiles current source and verifies the committed deployed binary's byte count, SHA-256 and code hashes against both manifests before executing it. The report labels this provenance; this mode proves execution of the pinned deployment, without asserting Linux source equality.

The runner prepares pinned dependencies and artifacts, then executes [`backend/bin/product-sandbox.mjs`](backend/bin/product-sandbox.mjs) and the [production browser scenario](prototype/tests/production-browser.mjs). First-run tool/download/build time depends on the host; it is a deeper check than the quick JS verification.

Expected lifecycle: owner creates and publishes a spot; Buyer A purchases; Buyer B takes over; the final NFT is minted; creative control transfers and the former holder loses access; artwork is approved; installation evidence is submitted; a participant issue blocks success until a distinct arbiter resolves it; settlement, original-wallet claims and native USDC withdrawal complete. Rejected signatures, lost submit responses, API restart and wallet changes are also exercised. Terminal accounting assertions require received funds to equal withdrawn funds, zero pending withdrawals and zero remaining offer liabilities.

The former holder also signs an artwork request directly through Intents, bypassing API preflight. The real hub rejects it while editing is still active. The new holder signs the same direct message with the same gas parameters as a positive control; only the signer and nonce differ. That direct authority-control artifact is synthetic and unpinned. Subsequent UI submissions use digest-verified media, update the NFT metadata, and preserve financial creditors. The failed receipt is retained in the local result. The exact owner-only panic is asserted separately by the unit test; optimized Wasm may expose a trap rather than that panic text.

The chain and cryptographic signatures are real. Test accounts and tokens have no public value. The EIP-1193 provider is injected rather than a real Rabby/Meteor extension. Media-provider transport uses controlled synthetic storage while upload/digest validation runs normally. This scenario does not test an actual Base bridge, public pinning-provider availability, paid AI inference or physical installation. See [backend qualification details](backend/README.md#production-interface-on-near-sandbox).

## Mainnet records without spending

Open the [completed qualification record](https://everywhere-near.vercel.app/records/e22dd301-786f-476c-af74-0df7cd2e6168) or inspect [`deployments/qualification.json`](deployments/qualification.json). It records real USDC transactions, the final NFT, synthetic artwork/delivery commitments and original-wallet payouts. Public records retain historical receipts during provider outages while identifying unavailable fresh checks.

```sh
node backend/bin/verify-evidence.mjs
node backend/bin/verify-evidence.mjs --history-rpc https://archival-rpc.mainnet.near.org
node backend/bin/verify-evidence.mjs https://archival-rpc.mainnet.near.org
```

The explicit `--history-rpc` selects an archival provider for old receipts while current-state reads retain their default providers. A positional HTTPS RPC selects one exclusive endpoint for all reads unless a separate history endpoint is supplied. RPC diagnostics redact custom paths and query strings. Provider capability, old-transaction retention and rate limits can make a check unavailable; they do not justify a successful status or an evidence-mismatch conclusion. The online CLI exits `0` for completed verification, `1` for mismatches/invalid input/local-file failures and `2` for online verification being unavailable. Unavailable codes distinguish `RPC_RATE_LIMITED`, `HISTORY_UNAVAILABLE` and `RPC_UNAVAILABLE`; diagnostics include progress and the failing lane/method without exposing custom URL credentials. Read `--help` for the full diagnostic contract.

The separate [`verify-team-campaigns.mjs`](backend/bin/verify-team-campaigns.mjs) checks seven published team offers, the recorded van NFT handoff and cargo-bike payouts. [`team-campaigns.json`](deployments/team-campaigns.json) distinguishes transaction evidence, recorded credit samples and generated vehicle references. Live ownership/availability can change after setup.

## Scope and trust

- **On chain:** offer terms, authorized purchases, creditor accounting, NFT authority, artwork commitments and service/issue gates.
- **Off chain:** inventory records, session state, uploaded-file processing, provider access and durable operation journals. Claims of an entirely on-chain application would be inaccurate.
- **Human judgment:** permission to advertise on a surface, physical installation and disputed delivery. Evidence hashes commit bytes; they do not establish audience impressions or installation truth.
- **Deployment trust:** the current hub is upgradeable and a distinct arbiter can decide disputes. The operator sponsors bounded storage/transactions. Verification is not an external audit or a promise of unrestricted capacity.
- **Historical baseline:** Pitboard supplied the earlier concept/takeover idea. The [project history](docs/PROJECT-BRIEF.md#what-was-built-here) identifies the new application and NEAR implementation. Older contract/factory/lab documentation is explicitly historical.
