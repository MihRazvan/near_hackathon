# Advertising campaign hub

One ordinary NEAR contract serves multiple advertising spots. It receives native
USDC represented in NEAR Intents as `nep141:<ft_contract_id>`. Each offer keeps
its own invoices, credits, withdrawal journal, final placement NFT, artwork,
fulfillment evidence, issues and prepaid NEAR storage reserve.

The hub has no administrator method that transfers escrow to an arbitrary
address. Claims pay the original stored creditor. NFT transfers move artwork
authority and never move financial claims. The independent arbiter can resolve
issues or finalize failure; success becomes permissionless after review ends,
with locked artwork, installation evidence and no unresolved on-chain issue.
Evidence is a commitment; the NFT does not prove physical installation.

## Wallets and actions

Native NEAR wallets call methods normally. External wallets authorize actions
through the configured Intents verifier's `on_auth(signer_id, msg)` callback.
The contract checks the callback predecessor and uses the verified signer for
every role check. A relayer cannot choose a seller, artwork owner or creditor.

Offer IDs have the format `offer-` followed by 32 lowercase hexadecimal digits.
The same identifier is the NEP-171 token ID. The NFT is minted directly to the
final payer after bidding; it can mint automatically with artwork submission.
Standard NFT transfers and bounded enumeration are supported. Transfer-call is
disabled during the artwork window to prevent provisional owners editing work
and returning the token.

Purchase messages bind `offer_id`, `invoice_id`, `expected_round` and
`published_terms_sha256`. Notifications accept exactly one configured Intents
token and amount. Rejected purchases return the full amount unused. Events
include the real hub account and offer ID so receipts cannot be attributed to a
different campaign.

## Storage and settlement

Each offer prepays 60,000 storage bytes, currently 0.6 NEAR at the protocol byte
price. Every persistent mutation charges its measured byte growth to that
offer. A worst-size unit fixture with 32 purchases, maximum-size evidence,
32 issues and 128 retained withdrawals fits within the reserve.

An owner may attach this reserve or use an explicitly funded sponsor pool.
External-wallet publication uses the sponsor pool. Sponsorship has global and
per-owner active limits; its default global limit is zero. Only the configured
operator can fund or withdraw the unallocated pool. Completed offers return
unused prepaid storage to their original funder or sponsor pool, keeping the
bytes needed for existing state and archival NFT transfers. Empty unbooked
offers can be cancelled by the seller, operator or arbiter and reclaim unused
reserve immediately.

Bidding must close within 30 days. Review must finish within 366 days, or
30 days when sponsored. These limits bound capital exposure. Each offer permits
32 purchases, 32 issues and 128 retained withdrawal records. Resolved withdrawal
records are pruned before adding new ones; pending records are never pruned and
withdrawal IDs never repeat. Callback arguments include the offer ID.

Global and per-offer accounting reserve outgoing withdrawals separately from
available balances. A pending withdrawal in one offer does not block another.
Failed transfers restore only the original offer's creditor. Successful
receipts with oversized return data remain successful to prevent double claims.

## Build and test

Run `bash scripts/build-hub.sh` for a standalone artifact and manifest. Legacy
campaign contracts and artifacts are independent. For an optimized build, set
`HUB_WASM_OPT` to an official Binaryen `wasm-opt` executable and
`HUB_WASM_OPT_SHA256` to its independently verified binary checksum. The build
checks that digest before running `-Oz --enable-bulk-memory`; its manifest records
the tool version, checksum, flags, and both artifact hashes.

Run `bash scripts/test-contracts.sh` for contract unit tests. After building the
hub and local token/Intents fixture artifacts, run
`cargo test --locked -p technical-proof --test hub -- --nocapture` for the real
local-chain lifecycle. That test's Intents fixture models balances and callbacks;
it is not an EVM signature verifier. Production uses the independently configured
and pinned Intents contract.
