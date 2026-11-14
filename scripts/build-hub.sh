#!/usr/bin/env bash
set -euo pipefail
TASK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$TASK_ROOT"
export PATH="$HOME/.cargo/bin:$PATH"
cargo build --locked --release --target wasm32-unknown-unknown -p marketplace-hub
TASK_TARGET_DIR="${CARGO_TARGET_DIR:-target}"
if [[ "$TASK_TARGET_DIR" != /* ]]; then TASK_TARGET_DIR="$TASK_ROOT/$TASK_TARGET_DIR"; fi
mkdir -p target/proof-artifacts
cp "$TASK_TARGET_DIR/wasm32-unknown-unknown/release/marketplace_hub.wasm" target/proof-artifacts/marketplace-hub.unoptimized.wasm
cp target/proof-artifacts/marketplace-hub.unoptimized.wasm target/proof-artifacts/marketplace-hub.wasm
# Optional official Binaryen optimizer. Require the exact local binary digest so
# an optimizer update cannot silently produce a different deployment artifact.
if [[ -n "${HUB_WASM_OPT:-}" ]]; then
  : "${HUB_WASM_OPT_SHA256:?Set the verified wasm-opt binary SHA256}"
  python3 - <<'PY'
import hashlib, os, subprocess
from pathlib import Path
tool=Path(os.environ['HUB_WASM_OPT'])
digest=hashlib.sha256(tool.read_bytes()).hexdigest()
if digest != os.environ['HUB_WASM_OPT_SHA256']:
 raise SystemExit('wasm-opt binary checksum mismatch')
subprocess.run([str(tool),'-Oz','--enable-bulk-memory','target/proof-artifacts/marketplace-hub.unoptimized.wasm','-o','target/proof-artifacts/marketplace-hub.wasm'],check=True)
PY
fi
python3 - <<'PY'
import hashlib, json, os, subprocess
from pathlib import Path
p=Path('target/proof-artifacts/marketplace-hub.wasm')
data=p.read_bytes()
raw=Path('target/proof-artifacts/marketplace-hub.unoptimized.wasm').read_bytes()
optimizer=None
if os.environ.get('HUB_WASM_OPT'):
 optimizer={
  'name':'Binaryen wasm-opt','version':subprocess.check_output([os.environ['HUB_WASM_OPT'],'--version'],text=True).strip(),
  'binary_sha256':os.environ['HUB_WASM_OPT_SHA256'],'flags':['-Oz','--enable-bulk-memory'],
 }
Path('target/proof-artifacts/hub-manifest.json').write_text(json.dumps({
 'contract':'marketplace-hub','artifact':str(p),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),
 'unoptimized_bytes':len(raw),'unoptimized_sha256':hashlib.sha256(raw).hexdigest(),'optimizer':optimizer,
 'initializer':'new','version':1,'settlement':'intents',
 'offer_storage_bytes':60000,'offer_storage_deposit_yocto':'600000000000000000000000',
 'initial_sponsor_limit':0,'default_sponsored_per_owner_limit':8,
 'deployment_notes':'Regular account deployment, no global-code publication. Code storage and initial state must be funded separately. Sponsorship requires an explicit operator fund_sponsor_pool call.'
},indent=2)+'\n')
print('Shared hub:',len(data),'bytes; SHA256',hashlib.sha256(data).hexdigest())
print('Code-only storage collateral at 0.00001 NEAR/byte:',len(data)/100000,'NEAR; measure initialized storage separately.')
PY
