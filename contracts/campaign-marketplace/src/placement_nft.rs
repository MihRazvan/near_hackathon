//! Final placement NFT: issued only after bidding, with local artwork authority.
//! Financial claims remain with the original marketplace creditors.

use crate::{Marketplace, MarketplaceExt, Outcome};
use near_contract_standards::non_fungible_token::{
    core::{NonFungibleTokenCore, NonFungibleTokenResolver},
    enumeration::NonFungibleTokenEnumeration,
    metadata::{
        NFTContractMetadata, NonFungibleTokenMetadataProvider, TokenMetadata, NFT_METADATA_SPEC,
    },
    refund_deposit_to_account, NonFungibleToken, Token, TokenId,
};
use near_sdk::{
    assert_one_yocto, env,
    json_types::{Base64VecU8, U128, U64},
    near, require, AccountId, PromiseOrValue,
};
use std::collections::HashMap;

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct Artwork {
    pub revision: U64,
    pub submitted_by: AccountId,
    pub artifact_uri: String,
    pub artifact_sha256: Base64VecU8,
    pub submitted_at_ns: U64,
}

#[near(serializers = [json])]
pub struct PlacementRights {
    pub token_id: String,
    pub minted: bool,
    pub current_owner_id: Option<AccountId>,
    pub original_payer_id: Option<AccountId>,
    pub bidding_closed: bool,
    pub active: bool,
    pub locked: bool,
    pub outcome: Outcome,
    pub rights_end_ns: U64,
    pub revision: U64,
    pub proposal: Option<Artwork>,
}

pub(crate) fn new_placement_nft() -> NonFungibleToken {
    NonFungibleToken::new(
        b"po".to_vec(),
        env::current_account_id(),
        Some(b"pt".to_vec()),
        Some(b"pe".to_vec()),
        None::<Vec<u8>>,
    )
}

pub(crate) fn placement_metadata() -> NFTContractMetadata {
    NFTContractMetadata {
        spec: NFT_METADATA_SPEC.to_owned(),
        name: "Advertise on Everything — final placements".to_owned(),
        symbol: "ADPLACE".to_owned(),
        icon: None,
        base_uri: None,
        reference: None,
        reference_hash: None,
    }
}

#[near]
impl Marketplace {
    /// Permissionless keeper action; owner comes only from qualified campaign state.
    /// Attached NEAR pays standard NFT storage; excess returns to this caller.
    #[payable]
    pub fn mint_final_placement(&mut self) -> Token {
        require!(
            env::block_timestamp() >= self.cutoff_ns,
            "bidding still open"
        );
        require!(self.outcome != Outcome::Failure, "campaign failed");
        require!(!self.nft_minted, "placement already minted");
        let owner_id = self.final_nft_owner();
        let payer = self
            .holder
            .as_ref()
            .expect("no final holder")
            .account_id
            .clone();
        let token_id = env::current_account_id().to_string();
        let metadata = TokenMetadata {
            title: Some("Advertise on Everything: final placement".to_owned()),
            description: Some(
                "Final placement after bidding closes. Current token owner may submit artwork \
                 only while this marketplace's rights window is active and the seller has not \
                 locked printing. Refunds and other money claims stay with their original \
                 marketplace creditors. This NFT is not vehicle title or proof of physical delivery."
                    .to_owned(),
            ),
            copies: Some(1),
            issued_at: Some(env::block_timestamp_ms().to_string()),
            starts_at: Some((self.cutoff_ns / 1_000_000).to_string()),
            expires_at: Some((self.campaign.as_ref().map_or(self.refund_end_ns, |terms| terms.service_end_ns.0) / 1_000_000).to_string()),
            extra: Some(near_sdk::serde_json::json!({
                "record_type": "final_placement_right",
                "campaign_id": env::current_account_id(),
                "original_payer_id": payer,
                "financial_rights_follow_token": false,
                "rights_view": "get_placement_rights",
                "physical_truth_verified_by_nft": false
            }).to_string()),
            ..TokenMetadata::default()
        };
        metadata.assert_valid();
        let token = self.nft.internal_mint(token_id, owner_id, Some(metadata));
        self.nft_minted = true;
        token
    }

    /// Replace the current proposal. Token ownership is read locally in this same
    /// receipt; no asynchronous registry lookup or server authorization is involved.
    #[payable]
    pub fn submit_artwork(
        &mut self,
        token_id: String,
        artifact_uri: String,
        artifact_sha256: Base64VecU8,
    ) {
        self.assert_artwork_active();
        require!(
            token_id == env::current_account_id().as_str(),
            "unknown placement token"
        );
        let mut token = self
            .nft
            .nft_token(token_id.clone())
            .expect("placement not minted");
        require!(
            env::predecessor_account_id() == token.owner_id,
            "placement owner only"
        );
        require!(
            !artifact_uri.is_empty() && artifact_uri.len() <= 2048,
            "invalid artwork URI length"
        );
        require!(
            artifact_uri.starts_with("https://") || artifact_uri.starts_with("ipfs://"),
            "artwork URI must use https or ipfs"
        );
        require!(
            artifact_sha256.0.len() == 32,
            "artwork hash must contain 32 bytes"
        );

        // Both persistent NFT collections and the contract state's new Artwork
        // value can grow. Charge their combined byte growth, rather than silently
        // spending escrow's operating-storage reserve. This method moves no USDC.
        let before_storage = env::storage_usage();
        let before_state = near_sdk::borsh::to_vec(self)
            .expect("state serialization")
            .len();
        let revision = self.artwork.as_ref().map_or(1, |artwork| {
            artwork
                .revision
                .0
                .checked_add(1)
                .expect("artwork revision overflow")
        });
        self.artwork = Some(Artwork {
            revision: U64(revision),
            submitted_by: env::predecessor_account_id(),
            artifact_uri: artifact_uri.clone(),
            artifact_sha256: artifact_sha256.clone(),
            submitted_at_ns: U64(env::block_timestamp()),
        });
        let metadata = token.metadata.as_mut().expect("placement metadata missing");
        metadata.reference = Some(artifact_uri);
        metadata.reference_hash = Some(artifact_sha256);
        metadata.updated_at = Some(env::block_timestamp_ms().to_string());
        metadata.assert_valid();
        self.nft
            .token_metadata_by_id
            .as_mut()
            .expect("metadata disabled")
            .insert(&token_id, metadata);
        let after_state = near_sdk::borsh::to_vec(self)
            .expect("state serialization")
            .len();
        let byte_growth = i128::from(env::storage_usage()) - i128::from(before_storage)
            + after_state as i128
            - before_state as i128;
        refund_deposit_to_account(byte_growth.max(0) as u64, env::predecessor_account_id());
        self.emit(
            "artwork_submitted",
            near_sdk::serde_json::json!({
                "token_id": token_id, "revision": U64(revision), "owner_id": token.owner_id
            }),
        );
    }

    /// The seller approves an exact proposal revision; a concurrent replacement
    /// makes that approval stale instead of silently approving different artwork.
    #[payable]
    pub fn lock_artwork(&mut self, expected_revision: U64) {
        assert_one_yocto();
        require!(
            env::predecessor_account_id() == self.seller_id,
            "seller only"
        );
        self.assert_artwork_lockable();
        let artwork = self.artwork.as_ref().expect("no artwork submitted");
        require!(
            artwork.revision == expected_revision,
            "stale artwork revision"
        );
        self.artwork_locked = true;
        self.emit(
            "artwork_locked",
            near_sdk::serde_json::json!({"revision": expected_revision}),
        );
    }

    pub fn get_artwork(&self) -> PlacementRights {
        self.get_placement_rights()
    }

    pub fn get_placement_rights(&self) -> PlacementRights {
        PlacementRights {
            token_id: env::current_account_id().to_string(),
            minted: self.nft_minted,
            current_owner_id: self
                .nft
                .nft_token(env::current_account_id().to_string())
                .map(|token| token.owner_id),
            original_payer_id: self.holder.as_ref().map(|holder| holder.account_id.clone()),
            bidding_closed: env::block_timestamp() >= self.cutoff_ns,
            active: self.artwork_active(),
            locked: self.artwork_locked,
            outcome: self.outcome,
            rights_end_ns: U64(self.artwork_deadline()),
            revision: self
                .artwork
                .as_ref()
                .map_or(U64(0), |artwork| artwork.revision),
            proposal: self.artwork.clone(),
        }
    }
}

impl Marketplace {
    fn artwork_active(&self) -> bool {
        self.nft_minted
            && !self.artwork_locked
            && self.outcome != Outcome::Failure
            && env::block_timestamp() >= self.cutoff_ns
            && env::block_timestamp() < self.artwork_deadline()
    }

    fn assert_artwork_active(&self) {
        require!(self.artwork_active(), "artwork rights inactive");
    }
}

#[near]
impl NonFungibleTokenCore for Marketplace {
    #[payable]
    fn nft_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
    ) {
        self.nft
            .nft_transfer(receiver_id, token_id, approval_id, memo);
    }

    #[payable]
    fn nft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<bool> {
        // A provisional receiver must not change artwork then reject the token.
        // Ordinary transfer is available while active; transfer-call is archival.
        require!(
            !self.artwork_active(),
            "transfer-call disabled while artwork rights active"
        );
        self.nft
            .nft_transfer_call(receiver_id, token_id, approval_id, memo, msg)
    }

    fn nft_token(&self, token_id: TokenId) -> Option<Token> {
        self.nft.nft_token(token_id)
    }
}

#[near]
impl NonFungibleTokenResolver for Marketplace {
    #[private]
    fn nft_resolve_transfer(
        &mut self,
        previous_owner_id: AccountId,
        receiver_id: AccountId,
        token_id: TokenId,
        approved_account_ids: Option<HashMap<AccountId, u64>>,
    ) -> bool {
        self.nft.nft_resolve_transfer(
            previous_owner_id,
            receiver_id,
            token_id,
            approved_account_ids,
        )
    }
}

#[near]
impl NonFungibleTokenEnumeration for Marketplace {
    fn nft_total_supply(&self) -> U128 {
        self.nft.nft_total_supply()
    }
    fn nft_tokens(&self, from_index: Option<U128>, limit: Option<u64>) -> Vec<Token> {
        self.nft.nft_tokens(from_index, limit)
    }
    fn nft_supply_for_owner(&self, account_id: AccountId) -> U128 {
        self.nft.nft_supply_for_owner(account_id)
    }
    fn nft_tokens_for_owner(
        &self,
        account_id: AccountId,
        from_index: Option<U128>,
        limit: Option<u64>,
    ) -> Vec<Token> {
        self.nft.nft_tokens_for_owner(account_id, from_index, limit)
    }
}

#[near]
impl NonFungibleTokenMetadataProvider for Marketplace {
    fn nft_metadata(&self) -> NFTContractMetadata {
        self.nft_metadata
            .get()
            .expect("collection metadata missing")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Credit, Holder, Settlement};
    use near_sdk::{test_utils::VMContextBuilder, testing_env, NearToken};

    fn id(value: &str) -> AccountId {
        value.parse().unwrap()
    }
    fn context(caller: &str, time: u64, deposit: NearToken) {
        let mut builder = VMContextBuilder::new();
        builder
            .current_account_id(id("market.test.near"))
            .predecessor_account_id(id(caller))
            .signer_account_id(id(caller))
            .block_timestamp(time)
            .attached_deposit(deposit);
        testing_env!(builder.build());
    }
    fn ready() -> Marketplace {
        context("seller.test.near", 1, NearToken::from_near(0));
        let mut market = Marketplace::new(
            id("seller.test.near"),
            id("arbiter.test.near"),
            id("ft.test.near"),
            id("intents.test.near"),
            Settlement::Native,
            U128(100),
            U64(10),
            U64(100),
        );
        market.holder = Some(Holder {
            account_id: id("buyer.test.near"),
            principal: U128(1_000_000),
        });
        market
    }
    fn mint(market: &mut Marketplace) -> Token {
        context("keeper.test.near", 10, NearToken::from_near(1));
        market.mint_final_placement()
    }
    fn submit(market: &mut Marketplace, caller: &str) {
        context(caller, 11, NearToken::from_near(1));
        market.submit_artwork(
            "market.test.near".into(),
            "ipfs://manifest".into(),
            Base64VecU8(vec![7; 32]),
        );
    }

    #[test]
    fn native_near_payer_on_intents_mints_to_its_own_account() {
        let mut market = ready();
        market.settlement = Settlement::Intents;
        let token = mint(&mut market);
        assert_eq!(token.owner_id, id("buyer.test.near"));
    }

    #[test]
    #[should_panic(expected = "Intents payer must nominate a NEAR recipient")]
    fn encoded_intents_payer_still_requires_native_nomination() {
        let mut market = ready();
        market.settlement = Settlement::Intents;
        market.holder.as_mut().unwrap().account_id = id("0x1111111111111111111111111111111111111111");
        mint(&mut market);
    }

    #[test]
    fn final_mint_transfer_moves_artwork_authority_without_moving_credits() {
        let mut market = ready();
        market.credits.insert(
            id("buyer.test.near"),
            Credit {
                available: U128(77),
                conditional_bonus: U128(0),
            },
        );
        let token = mint(&mut market);
        assert_eq!(token.owner_id, id("buyer.test.near"));
        assert_eq!(token.token_id, "market.test.near");
        submit(&mut market, "buyer.test.near");
        context("buyer.test.near", 12, NearToken::from_yoctonear(1));
        market.nft_transfer(id("new-owner.test.near"), token.token_id, None, None);
        submit(&mut market, "new-owner.test.near");
        let rights = market.get_artwork();
        assert!(rights.active);
        assert_eq!(rights.revision, U64(2));
        assert_eq!(rights.current_owner_id, Some(id("new-owner.test.near")));
        assert_eq!(rights.original_payer_id, Some(id("buyer.test.near")));
        assert_eq!(market.get_credit(id("buyer.test.near")).available, U128(77));
        assert_eq!(
            market.get_credit(id("new-owner.test.near")).available,
            U128(0)
        );
        assert_eq!(market.nft_supply_for_owner(id("buyer.test.near")), U128(0));
        assert_eq!(
            market.nft_supply_for_owner(id("new-owner.test.near")),
            U128(1)
        );
        assert_eq!(market.nft_tokens(None, Some(1)).len(), 1);
        assert_eq!(
            market
                .nft_token("market.test.near".into())
                .unwrap()
                .metadata
                .unwrap()
                .reference,
            Some("ipfs://manifest".into())
        );
    }

    #[test]
    #[should_panic(expected = "bidding still open")]
    fn cannot_mint_during_takeovers() {
        let mut market = ready();
        context("keeper.test.near", 9, NearToken::from_near(1));
        market.mint_final_placement();
    }

    #[test]
    #[should_panic(expected = "placement already minted")]
    fn cannot_mint_twice() {
        let mut market = ready();
        mint(&mut market);
        mint(&mut market);
    }

    #[test]
    #[should_panic(expected = "placement owner only")]
    fn transfer_revokes_previous_artwork_authority() {
        let mut market = ready();
        let token = mint(&mut market);
        context("buyer.test.near", 11, NearToken::from_yoctonear(1));
        market.nft_transfer(id("new-owner.test.near"), token.token_id, None, None);
        submit(&mut market, "buyer.test.near");
    }

    #[test]
    #[should_panic(expected = "stale artwork revision")]
    fn seller_cannot_lock_a_replaced_proposal() {
        let mut market = ready();
        mint(&mut market);
        submit(&mut market, "buyer.test.near");
        submit(&mut market, "buyer.test.near");
        context("seller.test.near", 12, NearToken::from_yoctonear(1));
        market.lock_artwork(U64(1));
    }

    #[test]
    #[should_panic(expected = "artwork rights inactive")]
    fn seller_lock_freezes_the_print_artwork() {
        let mut market = ready();
        mint(&mut market);
        submit(&mut market, "buyer.test.near");
        context("seller.test.near", 12, NearToken::from_yoctonear(1));
        market.lock_artwork(U64(1));
        assert!(market.get_artwork().locked);
        assert!(!market.get_artwork().active);
        submit(&mut market, "buyer.test.near");
    }

    #[test]
    #[should_panic(expected = "artwork rights inactive")]
    fn campaign_failure_revokes_artwork_authority() {
        let mut market = ready();
        mint(&mut market);
        market.outcome = Outcome::Failure;
        submit(&mut market, "buyer.test.near");
    }

    #[test]
    #[should_panic(expected = "artwork rights inactive")]
    fn rights_expire_at_refund_end() {
        let mut market = ready();
        mint(&mut market);
        context("buyer.test.near", 100, NearToken::from_near(1));
        market.submit_artwork(
            "market.test.near".into(),
            "ipfs://manifest".into(),
            Base64VecU8(vec![7; 32]),
        );
    }

    #[test]
    #[should_panic(expected = "transfer-call disabled while artwork rights active")]
    fn provisional_transfer_receiver_cannot_edit_then_return_token() {
        let mut market = ready();
        let token = mint(&mut market);
        context("buyer.test.near", 11, NearToken::from_yoctonear(1));
        let _ = market.nft_transfer_call(
            id("receiver.test.near"),
            token.token_id,
            None,
            None,
            String::new(),
        );
    }
}
