# Wallet integration lab

This interface is separate from `prototype/` and is not deployed to Vercel. It exercises the actual backend, current campaign Wasm, immutable campaign factory, NFT, fulfillment decisions and escrow transfers on NEAR Sandbox 2.14.0. The verifier is the same hash-pinned Intents binary used for the mainnet qualification.

## Run locally

```sh
npm ci --prefix backend
bash scripts/build-lab.sh
npm run build:lab --prefix backend
npm run lab --prefix backend
```

Open **http://127.0.0.1:4320/lab**. Node 24.12+ and the repository's pinned Rust toolchain are required. The first build downloads the reviewed verifier with read-only RPC and verifies its hash. Each launch starts a fresh local chain, private SQLite journal and fresh EVM test identities under the ignored `.local/lab/` directory. Stopping the lab stops its chain. The Recovery page can restart the API while preserving the running chain, identity keys, sessions and request journal.

The explicit **Sandbox** banner and wallet approval dialog identify the local test wallet harness. Its accounts hold valueless tokens; approvals produce real cryptographic signatures and real NEAR transactions. The harness signs only reviewed, stored plans on its own loopback `test-chain-*` network. It never exports signing keys to the browser. The faucet deposits 0.25 test USDC once per test buyer, using the actual token and Intents receiver contracts. It does not simulate a Base bridge.

Public IPFS uploads use the optional Pinata token already configured in the private local integration environment. AI drafting uses the separately consented ChatGPT connection. Neither is replaced with a successful stub. These optional provider credentials are necessary for their respective controls. Only publish synthetic artifacts intended to be public when running the supplied tests.

The [latest sanitized qualification](qualification.json) records 26 passing browser checks across successful, cancelled and fixed-price campaigns, plus a live AI draft through the interface. All three test escrows ended at zero. The backend suite has 53 passing tests; the contract suite has 84. Real extension approvals and a browser-based Base bridge are explicitly outside this recorded local run.

## Exercise the process

1. Owner: describe the asset, edit spots, set cents, takeover overrides, fixed dates and rules; save and publish. Each spot gets a distinct keyless campaign account. Native collateral retained by the factory/child is separate from advertising earnings.
2. Buyer A: connect, fund the test Intents balance, prepare, review and sign. Buyer B: switch wallets and take over at the newly verified price.
3. Owner: advance the local chain past bidding. Final buyer: nominate a NEAR recipient. Recipient: accept, mint and optionally transfer the placement NFT.
4. Current NFT owner: upload verified public artwork and submit it. Seller: lock the exact revision and submit installation proof. Buyer/seller can request an issue review; a separate arbiter signs its on-chain disposition.
5. Advance past service/review; open issues must be resolved before successful settlement. Original wallets claim their own credits. Native owners can register USDC storage, withdraw earnings into their own NEAR wallet, and redeposit them. EVM buyers can sign a native withdrawal to a registered NEAR recipient.
6. Reject a review request, switch wallets, or enable the explicit lost-response control. Reload/restart the API and reconcile the original request. Unknown outcomes remain pending and cannot authorize a fresh native send. A wallet-provided hash is checked against its exact original signer, receiver, method, arguments, deposit and gas.

Dates are accelerated defaults in Sandbox and remain editable. Clock advances check finalized timestamps in bounded background batches; passing time in the UI alone never closes a campaign.

## Repeatable browser checks

With the local lab running and `playwright-cli` installed:

```sh
playwright-cli -s=integration-lab open http://127.0.0.1:4320/lab
playwright-cli -s=integration-lab run-code --filename=backend/lab/tests/success.js
playwright-cli -s=integration-lab run-code --filename=backend/lab/tests/failure-and-fixed.js
```

The first script starts with a fresh lab. It uses visible controls for publishing, wallet switching, declined purchase, takeover, original-principal claim, nomination, NFT transfer, permission denial, verified artifacts, issue gating, lost-response/reload/API-restart recovery, original-creditor payouts and spendable native USDC withdrawal/redeposit. The second runs on the same chain and tests one/two-cent cancellation refunds and a fixed-price spot that rejects a takeover without signing.

## External wallets and mainnet limits

`npm start --prefix backend` also serves the separate lab at **http://127.0.0.1:4318/lab**, using the existing mainnet configuration. It has no test wallet, faucet, clock skip, restart or response-loss controls. EVM wallet apps are discovered independently through EIP-6963; account changes invalidate the signed-in session. Meteor connects through the pinned NEAR Connect adapter and uses NEP-413 sign-in plus explicit native transaction approvals.

Automated Sandbox wallet approval is **not** evidence of a Meteor/Rabby extension approval or a mainnet browser transaction. Real extension approvals require a manual pass. Mainnet factory/global-code deployment is not configured or authorized by this lab; published historical campaigns have already ended. Existing mainnet spend/allocation caps remain unchanged. Base funding and return routing retain their separate qualified backend flows; the local faucet is not an end-to-end bridge test.

References: [EIP-6963](https://eips.ethereum.org/EIPS/eip-6963), [NEAR Connect](https://github.com/azbang/near-connect), and the [pinned Intents native withdrawal implementation](https://github.com/near/intents/blob/16d04f6ec4401263f8914638710260da50bb46b0/contracts/defuse/src/contract/tokens/nep141/withdraw.rs).
