#!/usr/bin/env bash
set -euo pipefail
TASK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$TASK_ROOT"
export PATH="$HOME/.cargo/bin:$PATH"
mkdir -p target/proof-artifacts
cargo build --locked --release --target wasm32-unknown-unknown \
  -p pitboard-marketplace -p completion-nft -p proof-test-token -p proof-test-intents -p storefront-factory -p empty-campaign-refresh
cp target/wasm32-unknown-unknown/release/pitboard_marketplace.wasm target/proof-artifacts/marketplace.wasm
cp target/wasm32-unknown-unknown/release/completion_nft.wasm target/proof-artifacts/completion-nft.wasm
cp target/wasm32-unknown-unknown/release/proof_test_token.wasm target/proof-artifacts/test-token.wasm
cp target/wasm32-unknown-unknown/release/proof_test_intents.wasm target/proof-artifacts/test-intents.wasm
cp target/wasm32-unknown-unknown/release/storefront_factory.wasm target/proof-artifacts/storefront-factory.wasm
cp target/wasm32-unknown-unknown/release/empty_campaign_refresh.wasm target/proof-artifacts/empty-campaign-refresh.wasm
cargo build --locked --release --target wasm32-unknown-unknown -p pitboard-marketplace --features callback-fault
cp target/wasm32-unknown-unknown/release/pitboard_marketplace.wasm target/proof-artifacts/marketplace-callback-fault.wasm
# Restore Cargo's ordinary output to the default, non-fault build.
cargo build --locked --release --target wasm32-unknown-unknown -p pitboard-marketplace
