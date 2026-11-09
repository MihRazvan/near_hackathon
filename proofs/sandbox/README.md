# Actual local-chain integration tests

These suites execute compiled Wasm on NEAR Sandbox 2.14.0 with valueless fixture tokens and local accounts. They cover callbacks, stale/concurrent purchases, claims, failure solvency, NFT authority and locking, factory isolation and implicit-account behavior.

Install the pinned signing helpers, fetch the exact verifier and build contracts before running:

```sh
npm ci --prefix proofs/intents-compatibility --ignore-scripts
npm ci --prefix proofs/evm-intent-signing --ignore-scripts
python3 proofs/intents-compatibility/fetch-pinned.py
bash scripts/build-proof.sh
cargo test --locked -p technical-proof --tests -- --nocapture
```

Rustup must provide the pinned Rust version and Wasm target. The first run downloads the pinned Sandbox binary. Tests using the downloaded Intents implementation initialize it with synthetic state; this is genuine local contract execution, not funded public settlement.

To run only the low-principal Intents proof:

```sh
cargo test --locked -p technical-proof --test end_to_end real_cent_principal_intents_proof -- --nocapture
```

It executes 1/2-cent failure and 10/15-cent success flows with distinct ERC-191 identities, principal claims and final zero escrow balances. Round-up behavior is intentional: a one-cent principal has a one-cent rounded conditional reward.

Generated artifacts and result records remain ignored. No personal key, funded account or API key is required. `maintenance.rs` qualifies a development-only empty-state helper; it does not authorize changing a funded campaign.
