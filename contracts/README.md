# NEAR marketplace contracts

The current product contract is [campaign-marketplace](campaign-marketplace/README.md), which adds committed terms, fixed spots and the full service/review lifecycle. The `marketplace` crate below remains a frozen historical proof so its exact-hash deployment and recovery tests remain reproducible. New product deployments use a new account and `new_campaign`; do not overwrite funded legacy state.

The financial core currently represents one finite advertising position per contract. It accepts either an allowlisted NEP-141 token or an allowlisted Intents token, enforces an invoice and expected round, and maintains original-payer credits through takeovers and placement-right transfers.

Takeover prices are 1.5× rounded up to a cent. A displaced payer receives available principal and a separate conditional reward; successful physical-fulfillment adjudication can vest that reward only after the configured review deadline. Failure cancels rewards and preserves principal refunds. Physical fulfillment is decided by an explicit trusted arbiter, not inferred from a blockchain transaction or image.

The final-placement NFT is issued after bidding closes. Its owner controls artwork submission while rights are active; the seller locks an exact revision. Historical financial claims remain with their original creditor. Intents buyers nominate a native NEAR recipient who accepts independently.

The factory proof creates isolated keyless children referencing pinned global code and verifies native-token registration. Global-code publication and native/Intents settlement are distinct integrations; do not assume this proof is a mainnet factory deployment.

## Local unit tests and builds

Requirements: rustup, the pinned Rust toolchain, and the Wasm target from `rust-toolchain.toml`.

```sh
bash scripts/test-contracts.sh
bash scripts/build-proof.sh
```

`marketplace-callback-fault.wasm` deliberately fails a callback in local testing. It is separate from the ordinary artifact and must never be deployed as the application contract. `test-token` and `test-intents` are explicit local fixtures, not real asset issuers or signature verifiers. `completion-nft` is a superseded standalone experiment. `empty-campaign-refresh` is a narrowly scoped development maintenance fixture, not a mechanism for changing funded campaign terms.

Compiled artifacts and operational records are not committed. Further backend integration must preserve the distinction between unit tests, actual Sandbox execution and funded public execution. Development accounts retaining full-access keys are upgradeable test accounts.
