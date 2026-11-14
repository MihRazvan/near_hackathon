# Rebuild the deployed marketplace hub

Run from the repository root:

```sh
node scripts/verify-build.mjs --check-only
node scripts/verify-build.mjs --json
```

The **macOS arm64** build matches the deployed bytes exactly. The tested Linux x64 build compiles, but its output differs and fails the equality check.

You need Node.js 22.23+, rustup, Python 3, bash and tar. The runner installs the pinned Rust toolchain/target when missing, downloads the appropriate official Binaryen archive, verifies its committed SHA-256, and extracts a fresh optimizer from those verified bytes. Downloads are cached under ignored `.local/verification-tools/`. Use `--skip-install` when the compiler, target and archive are already available.

The recipe is Rust **1.95.0**, the locked workspace dependencies and release profile in `Cargo.toml`, target `wasm32-unknown-unknown`, followed by Binaryen **133** with `-Oz --enable-bulk-memory`. The platform archive URLs and checksums are pinned in [build.json](deployments/build.json); the official release is [Binaryen version_133](https://github.com/WebAssembly/binaryen/releases/tag/version_133). The runner verifies the executable version and records its binary digest before running it. It invokes `bash scripts/build-hub.sh --reproduce-deployment`, which uses Rust `--remap-path-prefix` to preserve the dependency panic-location labels embedded in this existing deployment. The original registry prefix is pinned in `build.json`. The flag changes compiler input labels; source files and deployed Wasm bytes stay unchanged. A normal `bash scripts/build-hub.sh` remains a general source compilation without this reproduction normalization.

A successful result says `build-verified` and compares the rebuilt bytes against the [committed deployment artifact](deployments/evidence/marketplace-hub.wasm), its SHA-256 and the [qualification manifest's](deployments/qualification.json) NEAR code hash:

| Output | Expected |
| --- | --- |
| Bytes | `477522` |
| SHA-256 | `45f29ecac83ae3c31c7e8f300d314484d82184f40f35c4bb92c319f298b5240b` |
| NEAR code hash | `5i3hw9oXjH6Ri3fGGZ177U7ckk87oeqtUUVxtYMgPsiS` |

The JSON report includes actual source-input hashes, compiler, platform, optimizer/archive digests, executed steps and private log paths. Reports stay under ignored `.local/verification/`. A mismatch includes the actual bytes, SHA-256 and NEAR code hash alongside the expected values and exits `1`; missing prerequisites or unavailable tooling exit `2`. No wallet credentials, deployment or public funds are used.

Exact reproduction was observed on the original macOS arm64 host on 14 November 2026, including a fresh normalized rebuild. Public CI separately attempts the same strict comparison on `macos-15`, which [GitHub documents as a free public ARM64 standard runner](https://docs.github.com/en/actions/reference/runners/github-hosted-runners#standard-github-hosted-runners-for-public-repositories), and asserts the architecture before compiling. Each CI run compares its own output. Archives for other platforms are pinned too, but those hosts have not reproduced the deployment. To check current chain state, use the separate [online evidence verifier](VERIFY.md) for RPC-based deployment, receipt and accounting checks. Offline evidence verification checks committed file integrity only.

For the actual production-interface lifecycle on valueless local tokens, run:

```sh
# Qualified macOS host: rebuild and require source/deployment equality first
node scripts/verify-sandbox.mjs --json

# Linux: compile current source, then explicitly execute the pinned deployed binary
node scripts/verify-sandbox.mjs --hub-artifact deployed --json
```

The default `--hub-artifact rebuild` requires the exact-build check above. The explicit `--hub-artifact deployed` mode separately compiles source, verifies the committed deployment artifact against its byte count, SHA-256 and both manifests' code hashes, then copies those checked committed bytes into the local harness. The report records which binary ran and that source equality was not established. Linux CI combines this deployed-binary lifecycle with current/historical source unit tests; the separate macOS job requires exact source/deployment equality.

This prepares the pinned Intents binary and local contracts, then runs the existing NEAR Sandbox qualification. It may download public dependencies during setup. The scenario itself uses only a fresh loopback chain, generated test identities and isolated fixture state. See [verification coverage](VERIFY.md) for what it proves and its provider/physical-installation limits.
