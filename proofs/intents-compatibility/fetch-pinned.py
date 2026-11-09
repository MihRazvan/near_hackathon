#!/usr/bin/env python3
"""Fetch the exact pinned public verifier binary using read-only RPC."""
import base64
import hashlib
import json
from pathlib import Path
import urllib.request

HERE = Path(__file__).resolve().parent
PIN = json.loads((HERE / "pin.json").read_text())
TARGET = HERE / "artifacts" / "intents-mainnet.wasm"
EXPECTED = PIN["deployed_code"]["artifact"]["sha256"]


def verify(binary):
    if hashlib.sha256(binary).hexdigest() != EXPECTED:
        raise ValueError("verifier differs from the reviewed pin; refusing to replace it")
    return binary


def main():
    if TARGET.exists():
        verify(TARGET.read_bytes())
        print("Pinned verifier already present and hash verified")
        return
    errors = []
    for endpoint in ["https://near.drpc.org", "https://rpc.mainnet.near.org", "https://free.rpc.fastnear.com"]:
        try:
            body = json.dumps({"jsonrpc": "2.0", "id": "fetch-pinned-code-readonly", "method": "query", "params": {
                "request_type": "view_code", "account_id": PIN["account_id"], "finality": "final"
            }}).encode()
            request = urllib.request.Request(endpoint, data=body, headers={"Content-Type": "application/json", "User-Agent": "everywhere-sandbox-fixture/1"})
            with urllib.request.urlopen(request, timeout=30) as response:
                result = json.load(response)["result"]
            binary = verify(base64.b64decode(result["code_base64"], validate=True))
            TARGET.parent.mkdir(parents=True, exist_ok=True)
            temporary = TARGET.with_suffix(".tmp")
            temporary.write_bytes(binary)
            temporary.replace(TARGET)
            print(f"Pinned verifier verified: {len(binary)} bytes, SHA256 {EXPECTED}")
            return
        except Exception as error:
            errors.append(type(error).__name__)
    raise SystemExit("Could not retrieve the pinned verifier. Review availability or an explicit pin update. Errors: " + ", ".join(errors))


if __name__ == "__main__":
    main()
