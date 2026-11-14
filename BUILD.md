# Rebuild the deployed marketplace hub

Run from the repository root:

```sh
node scripts/verify-build.mjs --check-only
node scripts/verify-build.mjs --json
```

Requires Node.js 22.23+, rustup, Python 3, bash and tar on Linux or macOS. The runner installs the pinned Rust toolchain/target when missing, downloads the appropriate official Binaryen archive, verifies its committed SHA-256, and extracts a fresh optimizer from those verified bytes. Downloads are cached under ignored `.local/verification-tools/`. Use `--skip-install` when the compiler, target and archive are already available.

The recipe is Rust **1.95.0**, the locked workspace dependencies and release profile in `Cargo.toml`, target `wasm32-unknown-unknown`, followed by Binaryen **133** with `-Oz --enable-bulk-memory`. The platform archive URLs and checksums are pinned in [build.json](deployments/build.json); the official release is [Binaryen version_133](https://github.com/WebAssembly/binaryen/releases/tag/version_133). The runner verifies the executable version and records its binary digest before running it.

A successful result says `build-verified` and compares the rebuilt bytes against the [committed deployment artifact](deployments/evidence/marketplace-hub.wasm), its SHA-256 and the [qualification manifest's](deployments/qualification.json) NEAR code hash:

| Output | Expected |
| --- | --- |
| Bytes | `477522` |
| SHA-256 | `45f29ecac83ae3c31c7e8f300d314484d82184f40f35c4bb92c319f298b5240b` |
| NEAR code hash | `5i3hw9oXjH6Ri3fGGZ177U7ckk87oeqtUUVxtYMgPsiS` |

The JSON report includes actual source-input hashes, compiler, platform, optimizer/archive digests, executed steps and private log paths. Reports stay under ignored `.local/verification/`. A mismatch exits `1`; missing prerequisites or unavailable tooling exit `2`. No wallet credentials, deployment or public funds are used.

Exact reproduction was observed on macOS arm64 on 14 November 2026. Other platform archives are pinned inputs, not an assertion that every platform has been qualified. Each run must compare its actual output. Building matching bytes does not establish current chain state: use the separate [online evidence verifier](VERIFY.md) for RPC-based deployment, receipt and accounting checks. Offline evidence verification checks committed file integrity only.

For the actual production-interface lifecycle on valueless local tokens, run:

```sh
node scripts/verify-sandbox.mjs --json
```

This prepares the pinned Intents binary and local contracts, then runs the existing NEAR Sandbox qualification. It may download public dependencies during setup. The scenario itself uses only a fresh loopback chain, generated test identities and isolated fixture state. See [verification coverage](VERIFY.md) for what it proves and its provider/physical-installation limits.
