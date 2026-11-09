#!/usr/bin/env bash
set -euo pipefail
TASK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$TASK_ROOT"
export PATH="$HOME/.cargo/bin:$PATH"
mkdir -p target/proof-artifacts
bash scripts/build-campaign.sh
python3 proofs/intents-compatibility/fetch-pinned.py
cargo build --locked --release --target wasm32-unknown-unknown -p campaign-factory -p proof-test-token
cp target/wasm32-unknown-unknown/release/campaign_factory.wasm target/proof-artifacts/campaign-factory.wasm
cp target/wasm32-unknown-unknown/release/proof_test_token.wasm target/proof-artifacts/test-token.wasm
cargo build --locked -p technical-proof --bin lab-chain
