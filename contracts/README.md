# NEAR marketplace contracts

The current application uses [marketplace-hub](marketplace-hub/README.md): one ordinary NEAR contract serves multiple independent offers. Every offer has its own committed terms, invoices, accounting, withdrawal journal, final NEP-171 placement NFT and fulfillment/issue gates. [VERIFY.md](../VERIFY.md) links current claims to their tests and public evidence.

## Current shared hub

Purchases bind the offer, invoice, expected round and published terms. A takeover replaces the holder before bidding closes. The next price is 1.5× the previous price, rounded up to a whole cent. A displaced payer retains principal and a conditional completion reward targeting a total of 1.1× their payment, also rounded up to a whole cent; a 1¢ test payment therefore quotes a 2¢ next price and a 2¢ total refund/reward if successful fulfillment vests the reward. Failure preserves refundable principal and cancels the conditional reward. Original principals, rewards and seller earnings remain owed to their original creditors. NFT transfers move creative authority without redirecting those credits.

After bidding closes, the final payer receives the placement NFT directly, including an EVM payer authenticated through NEAR Intents. The current product has no separate recipient-nomination step. The holder can submit artwork during the editing window; seller approval locks an exact revision. Editing stops at approval or the artwork deadline, and later transfers cannot reopen it. The token remains an archival campaign record.

Success requires service and review to end, locked artwork, installation evidence and no unresolved on-chain issue. A distinct arbiter resolves disputes or finalizes failure. Uploaded evidence is a commitment to submitted bytes, not independent proof of physical installation. The current hub retains an upgrade key; code-hash pinning detects code changes but does not make the deployment immutable.

```sh
# Current hub unit tests only.
cargo test --locked -p marketplace-hub --lib
# All current and historical contract unit suites.
bash scripts/test-contracts.sh
# Standalone current hub build.
bash scripts/build-hub.sh
```

Use rustup and the [pinned toolchain/Wasm target](../rust-toolchain.toml). The [build verification guide](../BUILD.md) describes the pinned optimizer and comparison with the committed deployment artifact. Build and verification commands do not deploy or spend funds.

## Historical experiments

These crates remain available to reproduce earlier designs. They are not the current publication path:

| Crate | Historical role |
| --- | --- |
| `marketplace` | Frozen single-position financial proof. |
| [campaign-marketplace](campaign-marketplace/README.md) | One dated placement per contract, native/Intents modes and NFT-recipient nomination. |
| `storefront-factory`, [campaign-factory](campaign-factory/README.md) | Keyless children referring to pinned global code. No mainnet factory deployment is claimed. |
| `completion-nft` | Superseded standalone NFT experiment. |
| `empty-campaign-refresh` | Development-only empty-state maintenance helper. |
| `test-token`, `test-intents` | Explicit local token/callback fixtures, not real asset issuers or signature verifiers. |

The [historical integration lab](../backend/lab/README.md) exercises the older factory/campaign path. The [production-interface Sandbox runner](../VERIFY.md#full-interface-on-a-local-chain) exercises the current shared hub and real pinned Intents verifier. The broader [local-chain suites](../proofs/sandbox/README.md) cover both generations and label their fixtures separately.

`marketplace-callback-fault.wasm` is a deliberate local callback failure artifact and must never be deployed as the application contract. Generated build artifacts and operational records remain ignored. The committed [deployment evidence](../deployments/evidence/README.md) is an explicit public copy of the qualified hub binary and synthetic artifact bytes.
