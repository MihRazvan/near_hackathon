# Integration qualification — 9 November 2026

These results distinguish funded mainnet execution from local fixtures. The hosted prototype remains unchanged and disconnected from the backend.

## Funded mainnet flow

Two dedicated Base wallets were funded into NEAR Intents once, with 0.25 USDC each. Their balances were reused through both scenarios.

| Check | Result |
| --- | --- |
| Failure scenario | 0.01/0.02 USDC purchase/takeover; principal claims released to original payers, conditional reward cancelled, zero escrow, remaining NEAR recovered. |
| Success scenario | 0.10/0.15 USDC purchase/takeover; displaced principal returned, 0.01 USDC reward and 0.14 USDC seller earnings released after review. |
| Final placement | Buyer nomination signed through the HTTP API; native nominee signed in and accepted; NFT minted, transferred and used by its new owner to submit artwork. |
| Fulfillment | Seller locked the exact revision and committed a synthetic public proof. A separate arbiter opened/closed an issue before post-review settlement. No physical installation is claimed. |
| Native redemption | 0.01 USDC withdrawn from Intents into native NEAR USDC; exact token event and balance verified; deposited back to the original buyer. |
| Base return | Both buyers' full remaining Intents balances routed to their original Base wallets; canonical finalized native-USDC receipts verified. |
| Final liabilities | Success escrow balance and pending withdrawals are zero. Financial claims did not follow NFT ownership. |

The retained [mainnet campaign](https://nearblocks.io/address/0647a78dc76d21513c5ec4efa9aa42dedc49a7c30445f72a6192fb7f76bf884c) uses the current dated-campaign Wasm. Artifact SHA-256: `16339940619797b8ab19333489ea7961575e584bd3e7a818aeb7cd91310aeedf`.

Selected public evidence:

- [Ten-cent purchase](https://nearblocks.io/txns/EBQQkNxEqgHnBftbRMizQSj7tNNLiNNoe2fh5dgDcezB) and [fifteen-cent takeover](https://nearblocks.io/txns/BEEvYut1Z3B8yoteCFoXjRzm3e8rANAx62SAkskQyXUA).
- [NFT mint](https://nearblocks.io/txns/3XUvSN7QUPpPHpFEmmxMVnHnRqMA8mTDe1eRqFKpU5YT), [transfer](https://nearblocks.io/txns/3WNuiSAi269SGPCzLRscNNALjdXHNuNHcLUBCjU4b8ZM), and [artwork submission](https://nearblocks.io/txns/4uZHxcdN1bDtr4EQCUb9GepShaXxbb4G37u5bNRf5ymg).
- [Post-review settlement](https://nearblocks.io/txns/DJStgS6DHVf9Au9UgDWnNACqrxwzhtuD6jSTAYBxf9HN), [seller claim](https://nearblocks.io/txns/5VbH9QQUgdoZcfbwfuYgpRDi7MMb53fMUjPV6DGrgBFJ), and [reward claim](https://nearblocks.io/txns/7sqNngkM7Yx9uHyY3CBU6zqKTecnUEG22QEeifvmevxH).
- [Native USDC redemption](https://nearblocks.io/txns/3hfAAk7Z9LxHG4xo4JkxkMRLPiv65ec4CrGvuX5U1Eta).
- Final Base payouts: [0.397518 USDC](https://basescan.org/tx/0xd32e54265d011dfa6182914f3906bcff6247dfc9312bcb31e66ae93817587c1d), [0.097578 USDC](https://basescan.org/tx/0x0cd1096f1394a79e2bd2449cf42c06a0917b9be687f625ccac6b75753a3875d1).

Across the two funded wallets, 25 USDC became **24.990190 USDC** after the complete round trip: **0.009810 USDC net routing cost**, including source refunds. Base gas was **0.000000748662359710 ETH**. Gross source transfers remain counted in the persistent budget; returned funds do not reset it. NEAR code/storage allocations are separate from gas, and the retained proof account keeps its recovery key.

## Reproducible local checks

- **44 backend tests:** authentication, persistence/restart, shared budgets, receipt binding, exact signatures, ownership isolation, multi-owner application composition, HTTP flows, OAuth/stream handling, artifact verification and return finality.
- **80 Rust unit tests:** current campaign (43), frozen financial proof (32), factory (5).
- Actual Sandbox executes the compiled current campaign and pinned Intents verifier. Updated bounded-gas suites cover cent-level settlement, exact transfer balances, native redemption/return, fixed spots, NFT authority, stale artwork revisions, proof, review deadlines and case-gated payout.
- Live provider checks cover ChatGPT text and synthetic-image drafts, renewable scoped plan access, Pinata publication and retrieved-byte hash verification.

Run the [backend instructions](README.md), `bash scripts/test-contracts.sh` and the [Sandbox suites](../proofs/sandbox/README.md). No funded wallet is required for local tests. Operational records and recovery keys remain local and are not published.

## Limits

Multi-owner campaign composition uses controlled chain adapters in application tests; the funded scenarios use the dedicated qualification seller. The global-code factory is a separate Sandbox proof. No mainnet global-code publication, production keyless factory, physical verification oracle or paid image-generation service is claimed. Development accounts retain full-access recovery keys. Frontend wallet connection and integration remain separate work.
