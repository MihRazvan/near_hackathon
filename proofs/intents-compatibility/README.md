# Pinned Intents Sandbox fixture

This package provides the canonical SDK signer used by local-chain tests. It generates ephemeral keys in memory, outputs public signed fixtures, and refuses non-loopback RPC metadata. It does not broadcast transactions or load real wallet credentials.

```sh
npm ci --prefix proofs/intents-compatibility --ignore-scripts
npm ci --prefix proofs/evm-intent-signing --ignore-scripts
python3 proofs/intents-compatibility/fetch-pinned.py
bash scripts/build-proof.sh
cargo test --locked -p technical-proof --tests -- --nocapture
```

`pin.json` records the deployed verifier code hash and artifact SHA256 used by the proof. The fetcher downloads code through read-only mainnet RPC, refuses a changed binary and stores it in ignored `artifacts/`. If mainnet has upgraded, obtain the exact historical artifact or review a new pin explicitly; tests must not silently change their verifier.

The downloaded deployed binary is initialized with synthetic local state and valueless fixture tokens. This qualifies receiver, signature and callback execution; it does not clone mainnet balances or prove live bridge/provider settlement. Generated local results are stored in ignored directories.

`sign-local-intent.mjs` accepts JSON on stdin with local `rpcUrl`, `standard` (`erc191` or `nep413`), `verifyingContract`, and `intents`. Optional `followupIntents` signs subsequent messages with the same ephemeral identity and distinct nonces. Named NEAR identities require registering the generated public key on the local verifier; EVM identities can use their implicit signer address. Never use this fixture as the application signing service.
