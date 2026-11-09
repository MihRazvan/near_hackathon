#!/usr/bin/env bash
set -euo pipefail
TASK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$TASK_ROOT"
# Select both Cargo and rustc through rustup, including on hosts with Homebrew Rust.
export PATH="$HOME/.cargo/bin:$PATH"
cargo test --locked -p pitboard-marketplace -p campaign-marketplace -p storefront-factory --lib "$@"
