# Public qualification evidence

These files support `node backend/bin/verify-evidence.mjs --offline`. They are public synthetic test artifacts, not customer uploads or private operational reports.

| File | Origin | SHA-256 |
| --- | --- | --- |
| `marketplace-hub.wasm` | Deployed mainnet hub, retrieved with the read-only `view_code` RPC query | `45f29ecac83ae3c31c7e8f300d314484d82184f40f35c4bb92c319f298b5240b` |
| `artwork.txt` | Raw IPFS artwork bytes identified in `qualification.json` | `c475c89deb17a68ace4f521ddfbf14d4b119d7b3c862ba4b11fe2e870c1e8341` |
| `delivery.txt` | Raw IPFS delivery bytes identified in `qualification.json` | `401e7c2256849e3f4ee87ca193f3ab42ddc4cfa07559bd4a0d6f02c91470aef2` |

The WASM was retrieved from account `8a97f02b08b964bb618031529dfacf8cb4f922ddc646ef525c4d68355f81be20` and matched the pre-existing deployment digest before being committed. Its SHA-256 encoded in base58 is the pinned NEAR code hash `5i3hw9oXjH6Ri3fGGZ177U7ckk87oeqtUUVxtYMgPsiS`. This is a copy of the deployed binary, not a claim of reproducible compilation from the current source tree.

The text files were retrieved from their manifest IPFS CIDs and matched their recorded SHA-256 digests before being committed. Both explicitly describe synthetic qualification material. They do not document an installed advertisement.

The offline verifier checks file integrity, raw CID digests and consistency between [the deployment manifest](../mainnet.json) and [the qualification manifest](../qualification.json). Those manifests are repository declarations, not an independent chain proof. Offline success does not establish live ownership, settlement or transaction finality. Use the online verifier for fresh mainnet receipt and state checks:

```sh
node backend/bin/verify-evidence.mjs
node backend/bin/verify-evidence.mjs https://archival-rpc.mainnet.near.org
```

It verifies all eleven recorded transaction outcomes and their scoped events, then checks the pinned hub and current offer accounting, NFT holder and artifact commitments. A mismatch or unavailable provider exits with a nonzero status. Neither mode loads wallet credentials, sends transactions or spends funds.
