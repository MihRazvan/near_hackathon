#!/usr/bin/env bash
set -euo pipefail
TASK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$TASK_ROOT"
export PATH="$HOME/.cargo/bin:$PATH"
cargo build --locked --release --target wasm32-unknown-unknown -p campaign-marketplace
mkdir -p target/proof-artifacts
cp target/wasm32-unknown-unknown/release/campaign_marketplace.wasm target/proof-artifacts/campaign-marketplace.wasm
python3 - <<'PY'
import hashlib, json
from pathlib import Path
p=Path('target/proof-artifacts/campaign-marketplace.wasm')
data=p.read_bytes()
Path('target/proof-artifacts/campaign-manifest.json').write_text(json.dumps({
 'contract':'campaign-marketplace','artifact':str(p),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),
 'initializer':'new_campaign','version':2
},indent=2)+'\n')
print('Campaign contract:',len(data),'bytes; SHA256',hashlib.sha256(data).hexdigest())
PY
