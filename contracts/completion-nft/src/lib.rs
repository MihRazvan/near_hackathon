//! End-of-campaign records. The configured marketplace attests software completion;
//! NFT ownership is independent of active advertising permissions and money.

use near_contract_standards::non_fungible_token::{
    NonFungibleToken, Token, TokenId,
    core::{NonFungibleTokenCore, NonFungibleTokenResolver},
    enumeration::NonFungibleTokenEnumeration,
    metadata::{
        NFT_METADATA_SPEC, NFTContractMetadata, NonFungibleTokenMetadataProvider, TokenMetadata,
    },
};
use near_sdk::{
    AccountId, BorshStorageKey, PanicOnDefault, PromiseOrValue, env,
    json_types::{Base64VecU8, U128},
    near, require, serde_json,
};
use std::collections::HashMap;

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct CompletionNft {
    marketplace_id: AccountId,
    tokens: NonFungibleToken,
}

#[near]
#[derive(BorshStorageKey)]
enum StorageKey {
    Owners,
    Metadata,
    Enumeration,
}

#[near]
impl CompletionNft {
    #[init]
    pub fn new(marketplace_id: AccountId) -> Self {
        Self {
            tokens: NonFungibleToken::new(
                StorageKey::Owners,
                marketplace_id.clone(),
                Some(StorageKey::Metadata),
                Some(StorageKey::Enumeration),
                None::<StorageKey>,
            ),
            marketplace_id,
        }
    }

    pub fn marketplace_id(&self) -> AccountId {
        self.marketplace_id.clone()
    }

    /// Stable lookup key for a campaign's original holder, including after transfer.
    pub fn completion_token_id(campaign_id: String, holder_id: AccountId) -> TokenId {
        let identity =
            serde_json::to_vec(&(campaign_id, holder_id)).expect("Identity serialization");
        let digest = env::sha256(&identity);
        let hex: String = digest.iter().map(|byte| format!("{byte:02x}")).collect();
        format!("completion:{hex}")
    }

    /// Only the marketplace may attest that its campaign has reached completion.
    /// It must call this from its completed state, never from a user-provided flag.
    /// Attached NEAR funds NFT storage; the standards implementation refunds excess
    /// to the marketplace. This method neither receives USDC nor changes any escrow.
    #[payable]
    pub fn mint_completion(
        &mut self,
        campaign_id: String,
        holder_id: AccountId,
        artifact_uri: String,
        artifact_sha256: Base64VecU8,
    ) -> Token {
        require!(
            env::predecessor_account_id() == self.marketplace_id,
            "Marketplace only"
        );
        require!(
            !campaign_id.is_empty() && campaign_id.len() <= 128,
            "Invalid campaign ID"
        );
        require!(
            !artifact_uri.is_empty() && artifact_uri.len() <= 2048,
            "Invalid artifact URI length"
        );
        require!(
            artifact_uri.starts_with("https://") || artifact_uri.starts_with("ipfs://"),
            "Artifact must use https or ipfs"
        );
        require!(
            artifact_sha256.0.len() == 32,
            "Artifact SHA256 must contain 32 bytes"
        );

        let token_id = Self::completion_token_id(campaign_id.clone(), holder_id.clone());
        require!(
            self.tokens.nft_token(token_id.clone()).is_none(),
            "Completion already minted"
        );
        let extra = serde_json::json!({
            "record_type": "completed_campaign_position",
            "campaign_id": campaign_id,
            "original_holder_id": holder_id,
            "issuer_marketplace_id": self.marketplace_id,
            "attested_at_ns": env::block_timestamp().to_string(),
            "active_advertising_rights": false,
            "financial_rights": false,
            "physical_truth_verified_by_nft": false
        });
        let metadata = TokenMetadata {
            title: Some("Advertise on Everything: completed campaign".to_owned()),
            description: Some(
                "Transferable completed-position record issued by the configured marketplace. \
                 Original participant is recorded separately from current token owner. \
                 This record grants no active ad or financial rights and does not prove physical delivery."
                    .to_owned(),
            ),
            copies: Some(1),
            issued_at: Some(env::block_timestamp_ms().to_string()),
            extra: Some(extra.to_string()),
            reference: Some(artifact_uri),
            reference_hash: Some(artifact_sha256),
            ..TokenMetadata::default()
        };
        metadata.assert_valid();
        // Internal mint emits the standard nft_mint event and charges actual storage.
        self.tokens
            .internal_mint(token_id, holder_id, Some(metadata))
    }
}

#[near]
impl NonFungibleTokenCore for CompletionNft {
    #[payable]
    fn nft_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
    ) {
        self.tokens
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
        self.tokens
            .nft_transfer_call(receiver_id, token_id, approval_id, memo, msg)
    }

    fn nft_token(&self, token_id: TokenId) -> Option<Token> {
        self.tokens.nft_token(token_id)
    }
}

#[near]
impl NonFungibleTokenResolver for CompletionNft {
    #[private]
    fn nft_resolve_transfer(
        &mut self,
        previous_owner_id: AccountId,
        receiver_id: AccountId,
        token_id: TokenId,
        approved_account_ids: Option<HashMap<AccountId, u64>>,
    ) -> bool {
        self.tokens.nft_resolve_transfer(
            previous_owner_id,
            receiver_id,
            token_id,
            approved_account_ids,
        )
    }
}

#[near]
impl NonFungibleTokenEnumeration for CompletionNft {
    fn nft_total_supply(&self) -> U128 {
        self.tokens.nft_total_supply()
    }

    fn nft_tokens(&self, from_index: Option<U128>, limit: Option<u64>) -> Vec<Token> {
        self.tokens.nft_tokens(from_index, limit)
    }

    fn nft_supply_for_owner(&self, account_id: AccountId) -> U128 {
        self.tokens.nft_supply_for_owner(account_id)
    }

    fn nft_tokens_for_owner(
        &self,
        account_id: AccountId,
        from_index: Option<U128>,
        limit: Option<u64>,
    ) -> Vec<Token> {
        self.tokens
            .nft_tokens_for_owner(account_id, from_index, limit)
    }
}

#[near]
impl NonFungibleTokenMetadataProvider for CompletionNft {
    fn nft_metadata(&self) -> NFTContractMetadata {
        NFTContractMetadata {
            spec: NFT_METADATA_SPEC.to_owned(),
            name: "Advertise on Everything — completed campaigns".to_owned(),
            symbol: "ADCOMP".to_owned(),
            icon: None,
            base_uri: None,
            reference: None,
            reference_hash: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::{
        NearToken,
        test_utils::{VMContextBuilder, get_logs},
        testing_env,
    };

    fn account(name: &str) -> AccountId {
        name.parse().unwrap()
    }

    fn context(predecessor: &str, deposit: NearToken) {
        let mut builder = VMContextBuilder::new();
        builder
            .current_account_id(account("completion.test.near"))
            .signer_account_id(account("market.test.near"))
            .predecessor_account_id(account(predecessor))
            .attached_deposit(deposit)
            .block_timestamp(1_800_000_000_123_000_000);
        testing_env!(builder.build());
    }

    fn setup() -> CompletionNft {
        context("market.test.near", NearToken::from_near(0));
        CompletionNft::new(account("market.test.near"))
    }

    fn mint(contract: &mut CompletionNft, campaign: &str, holder: &str) -> Token {
        context("market.test.near", NearToken::from_near(1));
        contract.mint_completion(
            campaign.to_owned(),
            account(holder),
            "ipfs://completed-campaign-manifest".to_owned(),
            Base64VecU8(vec![7; 32]),
        )
    }

    #[test]
    fn authorized_completion_has_committed_artifact_and_standard_event() {
        let mut contract = setup();
        let token = mint(
            &mut contract,
            "vehicle-1/campaign-7",
            "advertiser.test.near",
        );
        let metadata = token.metadata.unwrap();
        assert_eq!(contract.marketplace_id(), account("market.test.near"));
        assert_eq!(
            metadata.reference,
            Some("ipfs://completed-campaign-manifest".to_owned())
        );
        assert_eq!(metadata.reference_hash, Some(Base64VecU8(vec![7; 32])));
        let extra: serde_json::Value = serde_json::from_str(&metadata.extra.unwrap()).unwrap();
        assert_eq!(extra["campaign_id"], "vehicle-1/campaign-7");
        assert_eq!(extra["original_holder_id"], "advertiser.test.near");
        assert_eq!(extra["active_advertising_rights"], false);
        assert_eq!(extra["financial_rights"], false);
        assert_eq!(extra["physical_truth_verified_by_nft"], false);
        let event: serde_json::Value =
            serde_json::from_str(get_logs()[0].strip_prefix("EVENT_JSON:").unwrap()).unwrap();
        assert_eq!(event["standard"], "nep171");
        assert_eq!(event["event"], "nft_mint");
        assert_eq!(contract.nft_metadata().spec, NFT_METADATA_SPEC);
    }

    #[test]
    #[should_panic(expected = "Marketplace only")]
    fn signer_cannot_spoof_marketplace_predecessor() {
        let mut contract = setup();
        context("attacker.test.near", NearToken::from_near(1));
        contract.mint_completion(
            "campaign".into(),
            account("holder.test.near"),
            "ipfs://manifest".into(),
            Base64VecU8(vec![7; 32]),
        );
    }

    #[test]
    fn transferred_record_preserves_original_participant_and_updates_enumeration() {
        let mut contract = setup();
        let token = mint(&mut contract, "campaign", "advertiser.test.near");
        context("advertiser.test.near", NearToken::from_yoctonear(1));
        contract.nft_transfer(
            account("archive.test.near"),
            token.token_id.clone(),
            None,
            None,
        );
        let transferred = contract.nft_token(token.token_id.clone()).unwrap();
        assert_eq!(transferred.owner_id, account("archive.test.near"));
        assert_eq!(transferred.metadata, token.metadata);
        assert_eq!(contract.nft_total_supply(), U128(1));
        assert_eq!(
            contract.nft_supply_for_owner(account("advertiser.test.near")),
            U128(0)
        );
        assert_eq!(
            contract.nft_supply_for_owner(account("archive.test.near")),
            U128(1)
        );
        assert_eq!(
            contract.nft_tokens_for_owner(account("archive.test.near"), Some(U128(0)), Some(1))[0]
                .token_id,
            token.token_id
        );
        assert_eq!(contract.nft_tokens(Some(U128(1)), Some(1)).len(), 0);
    }

    #[test]
    #[should_panic(expected = "Completion already minted")]
    fn original_position_cannot_be_reminted_after_transfer() {
        let mut contract = setup();
        let token = mint(&mut contract, "campaign", "advertiser.test.near");
        context("advertiser.test.near", NearToken::from_yoctonear(1));
        contract.nft_transfer(account("archive.test.near"), token.token_id, None, None);
        mint(&mut contract, "campaign", "advertiser.test.near");
    }

    #[test]
    fn campaign_holder_pair_is_distinct_and_paginated() {
        let mut contract = setup();
        let a = mint(&mut contract, "campaign-1", "advertiser.test.near");
        let b = mint(&mut contract, "campaign-2", "advertiser.test.near");
        let c = mint(&mut contract, "campaign-1", "other.test.near");
        assert_ne!(a.token_id, b.token_id);
        assert_ne!(a.token_id, c.token_id);
        assert_eq!(contract.nft_total_supply(), U128(3));
        assert_eq!(contract.nft_tokens(None, Some(2)).len(), 2);
        assert_eq!(
            contract
                .nft_tokens_for_owner(account("advertiser.test.near"), Some(U128(1)), Some(1))
                .len(),
            1
        );
    }

    #[test]
    #[should_panic(expected = "Approval extension is disabled")]
    fn minter_does_not_control_another_accounts_record() {
        let mut contract = setup();
        let token = mint(&mut contract, "campaign", "advertiser.test.near");
        context("market.test.near", NearToken::from_yoctonear(1));
        contract.nft_transfer(account("market.test.near"), token.token_id, None, None);
    }

    #[test]
    #[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
    fn transfer_requires_standard_one_yocto() {
        let mut contract = setup();
        let token = mint(&mut contract, "campaign", "advertiser.test.near");
        context("advertiser.test.near", NearToken::from_near(0));
        contract.nft_transfer(account("archive.test.near"), token.token_id, None, None);
    }

    #[test]
    #[should_panic(expected = "Artifact SHA256 must contain 32 bytes")]
    fn rejects_invalid_artifact_commitment() {
        let mut contract = setup();
        context("market.test.near", NearToken::from_near(1));
        contract.mint_completion(
            "campaign".into(),
            account("holder.test.near"),
            "https://example.com/manifest.json".into(),
            Base64VecU8(vec![7; 31]),
        );
    }

    #[test]
    #[should_panic(expected = "Must attach")]
    fn mint_requires_storage_funding() {
        let mut contract = setup();
        context("market.test.near", NearToken::from_near(0));
        contract.mint_completion(
            "campaign".into(),
            account("holder.test.near"),
            "ipfs://manifest".into(),
            Base64VecU8(vec![7; 32]),
        );
    }
}
