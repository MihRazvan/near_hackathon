# Historical campaign factory

This local factory experiment predates the current [shared marketplace hub](../marketplace-hub/README.md). The live product publishes offers inside that existing hub and does not create these child accounts.

Creates one V2 campaign per spot using immutable global code. The seller is the transaction predecessor; token, Intents verifier, arbiter, code hash and child funding are fixed at initialization. Children have no keys, admin calls or upgrade path. Commercial terms and the whole-cent starting price are supplied in the owner-signed creation transaction.

Creation is asynchronous: `creating` becomes `ready` only after account creation and initialization succeed. Failed names remain reserved, and the child funding is refunded to the original seller. The backend additionally verifies the finalized wallet transaction, creation record, child keys, campaign code, roles, terms and price before listing the sale. An unknown response requires reconciliation, never a second creation.

This factory is qualified on local NEAR Sandbox. No global code publication or factory deployment on mainnet is included. Publishing global code has a separate network cost. Each creation also retains native collateral in its keyless child and a 0.01 NEAR factory storage reserve; these are not withdrawable campaign earnings. USDC advertising credits are separate.

Run `bash scripts/test-contracts.sh` for unit checks. The integration lab exercises creation and subsequent settlement on a real local node.
