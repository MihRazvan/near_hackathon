//! Shared Intents escrow for bounded advertising campaigns. Each offer owns its
//! accounting, storage budget, invoice namespace, artwork and withdrawal journal.
//! The single pooled token balance has no discretionary transfer/admin escape.
use near_contract_standards::non_fungible_token::{
    core::{NonFungibleTokenCore, NonFungibleTokenResolver},
    enumeration::NonFungibleTokenEnumeration,
    events::NftMint,
    metadata::{
        NFTContractMetadata, NonFungibleTokenMetadataProvider, TokenMetadata, NFT_METADATA_SPEC,
    },
    NonFungibleToken, Token, TokenId,
};
use near_sdk::{
    collections::{LazyOption, LookupMap},
    env, ext_contract,
    json_types::{Base64VecU8, U128, U64},
    near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseError,
    PromiseOrValue,
};
use std::collections::{BTreeMap, BTreeSet, HashMap};

const CENT: u128 = 10_000;
const MAX_PURCHASES: u64 = 32;
const MAX_WITHDRAWALS: usize = 128;
const MAX_ISSUES: usize = 32;
const MAX_OFFERS: u64 = 10_000;
const DAY_NS: u64 = 86_400_000_000_000;
// Entire bounded lifetime (credits, invoices, withdrawals, evidence and NFT)
// must fit this prepaid budget. Every write charges measured bytes to its offer.
const OFFER_STORAGE_BYTES: u128 = 60_000;
const NFT_ARCHIVE_HEADROOM_BYTES: u128 = 1_024;
const TRANSFER_GAS: Gas = Gas::from_tgas(25);
const CALLBACK_GAS: Gas = Gas::from_tgas(20);

#[near(serializers=[json,borsh])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Outcome {
    Open,
    Success,
    Failure,
}
#[near(serializers=[json,borsh])]
#[derive(Clone, Default, Debug)]
pub struct Credit {
    pub available: U128,
    pub conditional_bonus: U128,
}
#[near(serializers=[json,borsh])]
#[derive(Clone, Debug)]
pub struct Holder {
    pub account_id: AccountId,
    pub principal: U128,
}
#[near(serializers=[json,borsh])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WithdrawalStatus {
    Pending,
    Succeeded,
    Failed,
}
#[near(serializers=[json,borsh])]
#[derive(Clone, Debug)]
pub struct Withdrawal {
    pub owner_id: AccountId,
    pub amount: U128,
    pub settlement: String,
    pub status: WithdrawalStatus,
}
#[near(serializers=[json,borsh])]
#[derive(Clone, Debug)]
pub struct CampaignTerms {
    pub sale_id: String,
    pub asset_id: String,
    pub spot_id: String,
    pub published_terms_sha256: Base64VecU8,
    pub takeover_enabled: bool,
    pub bidding_close_ns: U64,
    pub artwork_due_ns: U64,
    pub installation_due_ns: U64,
    pub service_start_ns: U64,
    pub service_end_ns: U64,
    pub review_end_ns: U64,
}
#[near(serializers=[json,borsh])]
#[derive(Clone, Debug)]
pub struct Artwork {
    pub revision: U64,
    pub submitted_by: AccountId,
    pub artifact_uri: String,
    pub artifact_sha256: Base64VecU8,
    pub submitted_at_ns: U64,
}
#[near(serializers=[json,borsh])]
#[derive(Clone, Debug)]
pub struct DeliveryProof {
    pub artifact_uri: String,
    pub artifact_sha256: Base64VecU8,
    pub artwork_revision: U64,
    pub submitted_at_ns: U64,
}
#[near(serializers=[json,borsh])]
#[derive(Clone, Debug)]
pub struct IssueDecision {
    pub open: bool,
    pub evidence_sha256: Base64VecU8,
    pub recorded_at_ns: U64,
    pub opened_by: AccountId,
}
#[near(serializers=[borsh])]
#[derive(Clone)]
pub struct Offer {
    seller_id: AccountId,
    terms: CampaignTerms,
    outcome: Outcome,
    round: u64,
    next_price: u128,
    holder: Option<Holder>,
    potential_seller_revenue: u128,
    credits: BTreeMap<AccountId, Credit>,
    participants: BTreeSet<AccountId>,
    invoices: BTreeSet<String>,
    withdrawals: BTreeMap<u64, Withdrawal>,
    next_withdrawal_id: u64,
    total_received: u128,
    total_withdrawn: u128,
    total_pending: u128,
    nft_minted: bool,
    artwork_locked: bool,
    artwork: Option<Artwork>,
    delivery_proof: Option<DeliveryProof>,
    issues: BTreeMap<String, IssueDecision>,
    storage_remaining: u128,
    storage_funder: AccountId,
    storage_reclaimed: bool,
    sponsored: bool,
}
#[near(serializers=[json])]
pub struct StateView {
    pub offer_id: String,
    pub receiver_id: AccountId,
    pub seller_id: AccountId,
    pub arbiter_id: AccountId,
    pub ft_contract_id: AccountId,
    pub intents_contract_id: AccountId,
    pub intents_token_id: String,
    pub settlement: String,
    pub outcome: Outcome,
    pub cutoff_ns: U64,
    pub refund_end_ns: U64,
    pub round: U64,
    pub next_price: U128,
    pub holder: Option<Holder>,
    pub potential_seller_revenue: U128,
    pub total_received: U128,
    pub total_withdrawn: U128,
    pub total_pending: U128,
    pub nft_minted: bool,
    pub nominated_recipient: Option<AccountId>,
    pub nomination_accepted: bool,
    pub artwork_locked: bool,
    pub storage_remaining: U128,
    pub storage_funder: AccountId,
    pub storage_reclaimed: bool,
    pub sponsored: bool,
}
#[near(serializers=[json])]
pub struct CampaignView {
    pub terms: Option<CampaignTerms>,
    pub delivery_proof: Option<DeliveryProof>,
    pub open_issues: u32,
    pub issues: BTreeMap<String, IssueDecision>,
}
#[near(serializers=[json])]
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
#[near(serializers=[json])]
pub struct ConfigView {
    pub owner_id: AccountId,
    pub arbiter_id: AccountId,
    pub ft_contract_id: AccountId,
    pub intents_contract_id: AccountId,
    pub offer_storage_deposit: U128,
    pub sponsor_pool: U128,
    pub sponsor_available: U128,
    pub sponsored_offer_limit: U64,
    pub sponsored_per_owner_limit: U64,
    pub sponsored_offers: U64,
    pub offer_count: U64,
}
#[near(serializers=[json])]
pub struct TotalsView {
    pub total_received: U128,
    pub total_withdrawn: U128,
    pub total_pending: U128,
    pub accounted_balance: U128,
    pub outstanding_liability: U128,
}
#[near(serializers=[json])]
#[serde(deny_unknown_fields)]
struct PurchaseMessage {
    offer_id: String,
    invoice_id: String,
    expected_round: U64,
    published_terms_sha256: Base64VecU8,
}
#[near(serializers=[json])]
#[serde(tag = "action", rename_all = "snake_case", deny_unknown_fields)]
enum AuthAction {
    CreateOffer {
        offer_id: String,
        initial_price_cents: U128,
        terms: CampaignTerms,
    },
    SubmitArtwork {
        offer_id: String,
        token_id: Option<String>,
        artifact_uri: String,
        artifact_sha256: Base64VecU8,
    },
    LockArtwork {
        offer_id: String,
        expected_revision: U64,
    },
    SubmitDeliveryProof {
        offer_id: String,
        artifact_uri: String,
        artifact_sha256: Base64VecU8,
    },
    OpenIssue {
        offer_id: String,
        case_id: String,
        evidence_sha256: Base64VecU8,
    },
    TransferPlacement {
        offer_id: String,
        receiver_id: AccountId,
    },
    MintFinalPlacement {
        offer_id: String,
    },
    RecordIssueDecision {
        offer_id: String,
        case_id: String,
        open: bool,
        evidence_sha256: Base64VecU8,
    },
    FinalizeSuccess {
        offer_id: String,
    },
    FinalizeFailure {
        offer_id: String,
    },
    CancelEmptyOffer {
        offer_id: String,
    },
}
#[ext_contract(ext_self)]
#[allow(dead_code)]
trait Callbacks {
    fn on_withdrawal(&mut self, offer_id: String, withdrawal_id: U64) -> bool;
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct MarketplaceHub {
    owner_id: AccountId,
    arbiter_id: AccountId,
    ft_contract_id: AccountId,
    intents_contract_id: AccountId,
    offers: LookupMap<String, Offer>,
    offer_count: u64,
    sponsor_pool: u128,
    sponsored_offer_limit: u64,
    sponsored_per_owner_limit: u64,
    sponsored_offers: u64,
    sponsored_owners: LookupMap<AccountId, u64>,
    total_received: u128,
    total_withdrawn: u128,
    total_pending: u128,
    nft: NonFungibleToken,
    nft_metadata: LazyOption<NFTContractMetadata>,
}

#[near]
impl MarketplaceHub {
    #[init]
    pub fn new(
        owner_id: AccountId,
        arbiter_id: AccountId,
        ft_contract_id: AccountId,
        intents_contract_id: AccountId,
    ) -> Self {
        Self {
            owner_id,
            arbiter_id,
            ft_contract_id,
            intents_contract_id,
            offers: LookupMap::new(b"offers".to_vec()),
            offer_count: 0,
            sponsor_pool: 0,
            sponsored_offer_limit: 0,
            sponsored_per_owner_limit: 8,
            sponsored_offers: 0,
            sponsored_owners: LookupMap::new(b"sponsors".to_vec()),
            total_received: 0,
            total_withdrawn: 0,
            total_pending: 0,
            nft: NonFungibleToken::new(
                b"nft-owner".to_vec(),
                env::current_account_id(),
                Some(b"nft-meta".to_vec()),
                Some(b"nft-enum".to_vec()),
                None::<Vec<u8>>,
            ),
            nft_metadata: LazyOption::new(
                b"meta".to_vec(),
                Some(&NFTContractMetadata {
                    spec: NFT_METADATA_SPEC.into(),
                    name: "Advertise on Everything — final placements".into(),
                    symbol: "ADPLACE".into(),
                    icon: None,
                    base_uri: None,
                    reference: None,
                    reference_hash: None,
                }),
            ),
        }
    }
    pub fn get_config(&self) -> ConfigView {
        ConfigView {
            owner_id: self.owner_id.clone(),
            arbiter_id: self.arbiter_id.clone(),
            ft_contract_id: self.ft_contract_id.clone(),
            intents_contract_id: self.intents_contract_id.clone(),
            offer_storage_deposit: U128(storage_reserve()),
            sponsor_pool: U128(self.sponsor_pool),
            sponsor_available: U128(self.sponsor_pool),
            sponsored_offer_limit: U64(self.sponsored_offer_limit),
            sponsored_per_owner_limit: U64(self.sponsored_per_owner_limit),
            sponsored_offers: U64(self.sponsored_offers),
            offer_count: U64(self.offer_count),
        }
    }
    pub fn get_totals(&self) -> TotalsView {
        TotalsView {
            total_received: U128(self.total_received),
            total_withdrawn: U128(self.total_withdrawn),
            total_pending: U128(self.total_pending),
            accounted_balance: U128(self.available_pool()),
            outstanding_liability: U128(self.total_received - self.total_withdrawn),
        }
    }
    pub fn get_sponsor_usage(&self, account_id: AccountId) -> U64 {
        U64(self.sponsored_owners.get(&account_id).unwrap_or(0))
    }
    pub fn get_offer_exists(&self, offer_id: String) -> bool {
        self.offers.get(&offer_id).is_some()
    }
    pub fn get_state(&self, offer_id: String) -> StateView {
        let o = self.offer(&offer_id);
        StateView {
            offer_id,
            receiver_id: env::current_account_id(),
            seller_id: o.seller_id,
            arbiter_id: self.arbiter_id.clone(),
            ft_contract_id: self.ft_contract_id.clone(),
            intents_contract_id: self.intents_contract_id.clone(),
            intents_token_id: self.token_id(),
            settlement: "intents".into(),
            outcome: o.outcome,
            cutoff_ns: o.terms.bidding_close_ns,
            refund_end_ns: o.terms.review_end_ns,
            round: U64(o.round),
            next_price: U128(o.next_price),
            holder: o.holder,
            potential_seller_revenue: U128(o.potential_seller_revenue),
            total_received: U128(o.total_received),
            total_withdrawn: U128(o.total_withdrawn),
            total_pending: U128(o.total_pending),
            nft_minted: o.nft_minted,
            nominated_recipient: None,
            nomination_accepted: false,
            artwork_locked: o.artwork_locked,
            storage_remaining: U128(o.storage_remaining),
            storage_funder: o.storage_funder,
            storage_reclaimed: o.storage_reclaimed,
            sponsored: o.sponsored,
        }
    }
    pub fn get_campaign(&self, offer_id: String) -> CampaignView {
        let o = self.offer(&offer_id);
        CampaignView {
            terms: Some(o.terms),
            delivery_proof: o.delivery_proof,
            open_issues: o.issues.values().filter(|v| v.open).count() as u32,
            issues: o.issues,
        }
    }
    pub fn get_credit(&self, offer_id: String, account_id: AccountId) -> Credit {
        self.offer(&offer_id)
            .credits
            .get(&account_id)
            .cloned()
            .unwrap_or_default()
    }
    pub fn get_withdrawal(&self, offer_id: String, withdrawal_id: U64) -> Option<Withdrawal> {
        self.offer(&offer_id)
            .withdrawals
            .get(&withdrawal_id.0)
            .cloned()
    }
    pub fn is_invoice_used(&self, offer_id: String, invoice_id: String) -> bool {
        self.offer(&offer_id).invoices.contains(&invoice_id)
    }
    pub fn get_placement_rights(&self, offer_id: String) -> PlacementRights {
        let o = self.offer(&offer_id);
        let owner = self.placement_owner(&offer_id, &o);
        PlacementRights {
            token_id: offer_id,
            minted: o.nft_minted,
            current_owner_id: owner,
            original_payer_id: o.holder.as_ref().map(|v| v.account_id.clone()),
            bidding_closed: env::block_timestamp() >= o.terms.bidding_close_ns.0,
            active: artwork_active(&o),
            locked: o.artwork_locked,
            outcome: o.outcome,
            rights_end_ns: o.terms.artwork_due_ns,
            revision: o.artwork.as_ref().map_or(U64(0), |a| a.revision),
            proposal: o.artwork,
        }
    }
    pub fn get_artwork(&self, offer_id: String) -> PlacementRights {
        self.get_placement_rights(offer_id)
    }
    pub fn is_participant(&self, offer_id: String, account_id: AccountId) -> bool {
        let o = self.offer(&offer_id);
        account_id == o.seller_id
            || o.participants.contains(&account_id)
            || self.placement_owner(&offer_id, &o) == Some(account_id)
    }

    /// Only operator deposits can sponsor external-wallet listings. Public users
    /// cannot increase the sponsor limit or withdraw any reserved offer balance.
    #[payable]
    pub fn fund_sponsor_pool(&mut self, sponsored_offer_limit: U64, per_owner_limit: Option<U64>) {
        self.assert_owner();
        require!(
            sponsored_offer_limit.0 >= self.sponsored_offers
                && sponsored_offer_limit.0 <= MAX_OFFERS,
            "invalid sponsor limit"
        );
        self.sponsor_pool = self
            .sponsor_pool
            .checked_add(env::attached_deposit().as_yoctonear())
            .expect("pool overflow");
        self.sponsored_offer_limit = sponsored_offer_limit.0;
        let limit = per_owner_limit.map_or(self.sponsored_per_owner_limit, |v| v.0);
        require!(limit > 0 && limit <= 32, "invalid per-owner sponsor limit");
        self.sponsored_per_owner_limit = limit;
    }
    pub fn withdraw_sponsor_pool(&mut self, amount: U128) {
        self.assert_owner();
        require!(
            amount.0 > 0 && amount.0 <= self.sponsor_pool,
            "insufficient unallocated sponsor pool"
        );
        self.sponsor_pool -= amount.0;
        Promise::new(self.owner_id.clone())
            .transfer(NearToken::from_yoctonear(amount.0))
            .detach();
    }
    #[payable]
    pub fn create_offer(
        &mut self,
        offer_id: String,
        initial_price_cents: U128,
        terms: CampaignTerms,
    ) {
        let seller = env::predecessor_account_id();
        let deposit = env::attached_deposit().as_yoctonear();
        require!(
            deposit == 0 || deposit >= storage_reserve(),
            "offer storage deposit required"
        );
        self.create(
            offer_id,
            seller.clone(),
            initial_price_cents,
            terms,
            deposit == 0,
        );
        if deposit > storage_reserve() {
            Promise::new(seller)
                .transfer(NearToken::from_yoctonear(deposit - storage_reserve()))
                .detach();
        }
    }
    /// The Intents verifier proves signer_id; the relayer has no authority.
    pub fn on_auth(&mut self, signer_id: AccountId, msg: String) {
        require!(
            env::predecessor_account_id() == self.intents_contract_id,
            "Intents verifier only"
        );
        require!(msg.len() <= 8192, "auth message too long");
        let action: AuthAction =
            near_sdk::serde_json::from_str(&msg).expect("unsupported auth action");
        match action {
            AuthAction::CreateOffer {
                offer_id,
                initial_price_cents,
                terms,
            } => self.create(offer_id, signer_id, initial_price_cents, terms, true),
            AuthAction::SubmitArtwork {
                offer_id,
                token_id,
                artifact_uri,
                artifact_sha256,
            } => {
                require!(
                    token_id.as_ref().is_none_or(|id| id == &offer_id),
                    "unknown placement token"
                );
                self.artwork(offer_id, signer_id, artifact_uri, artifact_sha256)
            }
            AuthAction::LockArtwork {
                offer_id,
                expected_revision,
            } => self.lock(offer_id, signer_id, expected_revision),
            AuthAction::SubmitDeliveryProof {
                offer_id,
                artifact_uri,
                artifact_sha256,
            } => self.proof(offer_id, signer_id, artifact_uri, artifact_sha256),
            AuthAction::OpenIssue {
                offer_id,
                case_id,
                evidence_sha256,
            } => self.issue(offer_id, signer_id, case_id, evidence_sha256),
            AuthAction::TransferPlacement {
                offer_id,
                receiver_id,
            } => self.transfer_placement(offer_id, signer_id, receiver_id),
            AuthAction::MintFinalPlacement { offer_id } => {
                self.mint_final_placement(offer_id);
            }
            AuthAction::RecordIssueDecision {
                offer_id,
                case_id,
                open,
                evidence_sha256,
            } => {
                require!(signer_id == self.arbiter_id, "arbiter only");
                self.decide_issue(offer_id, case_id, open, evidence_sha256);
            }
            AuthAction::FinalizeSuccess { offer_id } => self.finalize_success(offer_id),
            AuthAction::FinalizeFailure { offer_id } => {
                require!(signer_id == self.arbiter_id, "arbiter only");
                self.fail(offer_id);
            }
            AuthAction::CancelEmptyOffer { offer_id } => self.cancel_empty(offer_id, signer_id),
        }
    }
    /// Native-token settlement is intentionally not enabled for this shared hub.
    pub fn ft_on_transfer(
        &mut self,
        _sender_id: AccountId,
        amount: U128,
        _msg: String,
    ) -> PromiseOrValue<U128> {
        PromiseOrValue::Value(amount)
    }
    pub fn mt_on_transfer(
        &mut self,
        sender_id: AccountId,
        previous_owner_ids: Vec<AccountId>,
        token_ids: Vec<String>,
        amounts: Vec<U128>,
        msg: String,
    ) -> PromiseOrValue<Vec<U128>> {
        if env::predecessor_account_id() != self.intents_contract_id
            || amounts.len() != 1
            || token_ids.len() != 1
            || previous_owner_ids.len() != 1
            || token_ids[0] != self.token_id()
            || previous_owner_ids[0] != sender_id
            || msg.len() > 1024
        {
            return PromiseOrValue::Value(amounts);
        }
        let Ok(invoice) = near_sdk::serde_json::from_str::<PurchaseMessage>(&msg) else {
            return PromiseOrValue::Value(amounts);
        };
        let accepted = self.purchase(sender_id, amounts[0].0, invoice);
        PromiseOrValue::Value(if accepted { vec![U128(0)] } else { amounts })
    }
    pub fn mint_final_placement(&mut self, offer_id: String) -> Token {
        let before = env::storage_usage();
        let mut o = self.offer(&offer_id);
        require!(!o.nft_minted, "placement already minted");
        let token = self.mint(&offer_id, &mut o);
        self.save(&offer_id, o, before);
        token
    }
    #[payable]
    pub fn submit_artwork(
        &mut self,
        offer_id: String,
        artifact_uri: String,
        artifact_sha256: Base64VecU8,
    ) {
        self.artwork(
            offer_id,
            env::predecessor_account_id(),
            artifact_uri,
            artifact_sha256,
        );
    }
    #[payable]
    pub fn lock_artwork(&mut self, offer_id: String, expected_revision: U64) {
        self.lock(offer_id, env::predecessor_account_id(), expected_revision);
    }
    #[payable]
    pub fn submit_delivery_proof(
        &mut self,
        offer_id: String,
        artifact_uri: String,
        artifact_sha256: Base64VecU8,
    ) {
        self.proof(
            offer_id,
            env::predecessor_account_id(),
            artifact_uri,
            artifact_sha256,
        );
    }
    #[payable]
    pub fn open_issue(&mut self, offer_id: String, case_id: String, evidence_sha256: Base64VecU8) {
        self.issue(
            offer_id,
            env::predecessor_account_id(),
            case_id,
            evidence_sha256,
        );
    }
    pub fn record_issue_decision(
        &mut self,
        offer_id: String,
        case_id: String,
        open: bool,
        evidence_sha256: Base64VecU8,
    ) {
        self.assert_arbiter();
        self.decide_issue(offer_id, case_id, open, evidence_sha256);
    }
    fn decide_issue(
        &mut self,
        offer_id: String,
        case_id: String,
        open: bool,
        evidence_sha256: Base64VecU8,
    ) {
        require!(evidence_sha256.0.len() == 32, "case evidence hash required");
        let before = env::storage_usage();
        let mut o = self.offer(&offer_id);
        require!(o.outcome == Outcome::Open, "campaign finalized");
        let issue = o.issues.get_mut(&case_id).expect("unknown issue");
        issue.open = open;
        issue.evidence_sha256 = evidence_sha256;
        issue.recorded_at_ns = U64(env::block_timestamp());
        self.save(&offer_id, o, before);
        self.emit(
            "issue_decision",
            &offer_id,
            near_sdk::serde_json::json!({"case_id":case_id,"open":open}),
        );
    }
    /// Physical evidence can be disputed by participants before review ends;
    /// unresolved on-chain issues prevent this permissionless success path.
    pub fn finalize_success(&mut self, offer_id: String) {
        let before = env::storage_usage();
        let mut o = self.offer(&offer_id);
        require!(o.outcome == Outcome::Open, "already finalized");
        require!(
            env::block_timestamp() >= o.terms.review_end_ns.0,
            "campaign review period open"
        );
        require!(
            o.holder.is_some() && o.artwork_locked && o.delivery_proof.is_some(),
            "delivery proof and locked artwork required"
        );
        require!(
            !o.issues.values().any(|v| v.open),
            "unresolved campaign issue"
        );
        for c in o.credits.values_mut() {
            c.available.0 = c
                .available
                .0
                .checked_add(c.conditional_bonus.0)
                .expect("credit overflow");
            c.conditional_bonus = U128(0);
        }
        let c = o.credits.entry(o.seller_id.clone()).or_default();
        c.available.0 = c
            .available
            .0
            .checked_add(o.potential_seller_revenue)
            .expect("credit overflow");
        o.outcome = Outcome::Success;
        self.save(&offer_id, o, before);
        self.emit(
            "finalized",
            &offer_id,
            near_sdk::serde_json::json!({"outcome":"success"}),
        );
    }
    pub fn finalize_failure(&mut self, offer_id: String) {
        self.assert_arbiter();
        self.fail(offer_id);
    }
    pub fn cancel_empty_offer(&mut self, offer_id: String) {
        self.cancel_empty(offer_id, env::predecessor_account_id());
    }
    fn fail(&mut self, offer_id: String) {
        let before = env::storage_usage();
        let mut o = self.offer(&offer_id);
        require!(o.outcome == Outcome::Open, "already finalized");
        require!(
            env::block_timestamp() >= o.terms.bidding_close_ns.0,
            "contest still open"
        );
        for c in o.credits.values_mut() {
            c.conditional_bonus = U128(0);
        }
        if let Some(h) = &o.holder {
            let c = o.credits.entry(h.account_id.clone()).or_default();
            c.available.0 = c
                .available
                .0
                .checked_add(h.principal.0)
                .expect("credit overflow");
        }
        o.potential_seller_revenue = 0;
        o.outcome = Outcome::Failure;
        self.save(&offer_id, o, before);
        self.emit(
            "finalized",
            &offer_id,
            near_sdk::serde_json::json!({"outcome":"failure"}),
        );
    }
    pub fn withdraw(&mut self, offer_id: String) -> U64 {
        self.start_withdrawal(offer_id, env::predecessor_account_id())
    }
    /// Permissionless release is always to the stored creditor, never the caller.
    pub fn release_credit(&mut self, offer_id: String, account_id: AccountId) -> U64 {
        self.start_withdrawal(offer_id, account_id)
    }
    #[private]
    pub fn on_withdrawal(&mut self, offer_id: String, withdrawal_id: U64) -> bool {
        #[cfg(feature = "callback-fault")]
        env::panic_str("LOCAL TEST ARTIFACT: injected callback failure");
        require!(env::promise_results_count() == 1, "one result required");
        let succeeded = !matches!(
            env::promise_result_checked(0, 4096),
            Err(PromiseError::Failed)
        );
        let before = env::storage_usage();
        let mut o = self.offer(&offer_id);
        let w = o
            .withdrawals
            .get_mut(&withdrawal_id.0)
            .expect("unknown withdrawal");
        require!(w.status == WithdrawalStatus::Pending, "already resolved");
        o.total_pending = o
            .total_pending
            .checked_sub(w.amount.0)
            .expect("pending underflow");
        self.total_pending = self
            .total_pending
            .checked_sub(w.amount.0)
            .expect("global pending underflow");
        if succeeded {
            w.status = WithdrawalStatus::Succeeded;
            o.total_withdrawn = o
                .total_withdrawn
                .checked_add(w.amount.0)
                .expect("withdraw overflow");
            self.total_withdrawn = self
                .total_withdrawn
                .checked_add(w.amount.0)
                .expect("global withdraw overflow");
        } else {
            w.status = WithdrawalStatus::Failed;
            let c = o.credits.entry(w.owner_id.clone()).or_default();
            c.available.0 = c
                .available
                .0
                .checked_add(w.amount.0)
                .expect("credit overflow");
        }
        self.save(&offer_id, o, before);
        self.emit(
            "withdrawal_resolved",
            &offer_id,
            near_sdk::serde_json::json!({"withdrawal_id":withdrawal_id,"succeeded":succeeded}),
        );
        succeeded
    }
    /// Return unused prepaid NEAR after every token liability has been paid.
    /// Used bytes and a bounded archival NFT transfer allowance remain staked.
    pub fn reclaim_storage_reserve(&mut self, offer_id: String) -> U128 {
        self.reclaim(offer_id)
    }
}

impl MarketplaceHub {
    fn reclaim(&mut self, offer_id: String) -> U128 {
        let before = env::storage_usage();
        let mut o = self.offer(&offer_id);
        require!(
            o.outcome != Outcome::Open
                && o.total_pending == 0
                && o.total_received == o.total_withdrawn,
            "campaign money remains"
        );
        require!(!o.storage_reclaimed, "reserve already reclaimed");
        let headroom = if o.nft_minted {
            env::storage_byte_cost().as_yoctonear() * NFT_ARCHIVE_HEADROOM_BYTES
        } else {
            0
        };
        let refund = o.storage_remaining.saturating_sub(headroom);
        o.storage_remaining -= refund;
        o.storage_reclaimed = true;
        let funder = o.storage_funder.clone();
        let sponsored = o.sponsored;
        if sponsored {
            self.sponsor_pool = self
                .sponsor_pool
                .checked_add(refund)
                .expect("sponsor pool overflow");
            self.sponsored_offers = self
                .sponsored_offers
                .checked_sub(1)
                .expect("sponsor count underflow");
            let count = self
                .sponsored_owners
                .get(&o.seller_id)
                .unwrap_or(0)
                .checked_sub(1)
                .expect("owner sponsor count underflow");
            self.sponsored_owners.insert(&o.seller_id, &count);
        }
        self.save(&offer_id, o, before);
        self.emit("storage_reserve_reclaimed",&offer_id,near_sdk::serde_json::json!({"amount":U128(refund),"funder_id":funder,"sponsored":sponsored}));
        if refund > 0 && !sponsored {
            Promise::new(funder)
                .transfer(NearToken::from_yoctonear(refund))
                .detach();
        }
        U128(refund)
    }
    fn cancel_empty(&mut self, id: String, actor: AccountId) {
        let before = env::storage_usage();
        let mut o = self.offer(&id);
        require!(
            actor == o.seller_id || actor == self.owner_id || actor == self.arbiter_id,
            "seller or operator only"
        );
        require!(
            o.outcome == Outcome::Open
                && o.round == 0
                && o.total_received == 0
                && o.total_pending == 0,
            "offer already has bookings or is finalized"
        );
        o.outcome = Outcome::Failure;
        self.save(&id, o, before);
        self.emit(
            "finalized",
            &id,
            near_sdk::serde_json::json!({"outcome":"failure","reason":"empty_offer_cancelled"}),
        );
        self.reclaim(id);
    }
    fn offer(&self, id: &str) -> Offer {
        self.offers.get(&id.to_owned()).expect("unknown offer")
    }
    fn token_id(&self) -> String {
        format!("nep141:{}", self.ft_contract_id)
    }
    fn assert_owner(&self) {
        require!(env::predecessor_account_id() == self.owner_id, "owner only");
    }
    fn assert_arbiter(&self) {
        require!(
            env::predecessor_account_id() == self.arbiter_id,
            "arbiter only"
        );
    }
    fn available_pool(&self) -> u128 {
        self.total_received
            .checked_sub(self.total_withdrawn)
            .and_then(|v| v.checked_sub(self.total_pending))
            .expect("global insolvency")
    }
    fn save(&mut self, id: &str, mut o: Offer, before: u64) {
        assert_offer_solvent(&o);
        self.offers.insert(&id.to_owned(), &o);
        let after = env::storage_usage();
        let byte_cost = env::storage_byte_cost().as_yoctonear();
        if after > before {
            o.storage_remaining = o
                .storage_remaining
                .checked_sub(u128::from(after - before) * byte_cost)
                .expect("offer storage reserve exhausted");
        } else {
            o.storage_remaining = o
                .storage_remaining
                .checked_add(u128::from(before - after) * byte_cost)
                .expect("reserve overflow");
        }
        self.offers.insert(&id.to_owned(), &o);
        self.available_pool();
    }
    fn create(
        &mut self,
        id: String,
        seller: AccountId,
        price: U128,
        terms: CampaignTerms,
        sponsored: bool,
    ) {
        assert_offer_id(&id);
        require!(!self.get_offer_exists(id.clone()), "offer already exists");
        require!(self.offer_count < MAX_OFFERS, "offer capacity reached");
        require!(seller != self.arbiter_id, "seller and arbiter must differ");
        validate_terms(&terms);
        if sponsored {
            require!(
                terms.review_end_ns.0 <= env::block_timestamp().saturating_add(30 * DAY_NS),
                "sponsored campaign review must finish within 30 days"
            );
        }
        let next_price = price
            .0
            .checked_mul(CENT)
            .filter(|v| *v > 0)
            .expect("invalid price");
        require!(checked_next_price(next_price).is_some(), "price overflow");
        let before = env::storage_usage();
        let funder = if sponsored {
            require!(
                self.sponsored_offers < self.sponsored_offer_limit,
                "sponsored listing limit reached"
            );
            let used = self.sponsored_owners.get(&seller).unwrap_or(0);
            require!(
                used < self.sponsored_per_owner_limit,
                "owner sponsored listing limit reached"
            );
            self.sponsor_pool = self
                .sponsor_pool
                .checked_sub(storage_reserve())
                .expect("sponsor pool insufficient");
            self.sponsored_owners.insert(&seller, &(used + 1));
            self.sponsored_offers += 1;
            self.owner_id.clone()
        } else {
            seller.clone()
        };
        let o = Offer {
            seller_id: seller.clone(),
            terms,
            outcome: Outcome::Open,
            round: 0,
            next_price,
            holder: None,
            potential_seller_revenue: 0,
            credits: BTreeMap::new(),
            participants: BTreeSet::new(),
            invoices: BTreeSet::new(),
            withdrawals: BTreeMap::new(),
            next_withdrawal_id: 0,
            total_received: 0,
            total_withdrawn: 0,
            total_pending: 0,
            nft_minted: false,
            artwork_locked: false,
            artwork: None,
            delivery_proof: None,
            issues: BTreeMap::new(),
            storage_remaining: storage_reserve(),
            storage_funder: funder,
            storage_reclaimed: false,
            sponsored,
        };
        self.offer_count += 1;
        self.save(&id, o, before);
        self.emit(
            "offer_created",
            &id,
            near_sdk::serde_json::json!({"seller_id":seller,"sponsored":sponsored}),
        );
    }
    fn purchase(&mut self, sender: AccountId, amount: u128, invoice: PurchaseMessage) -> bool {
        let Some(mut o) = self.offers.get(&invoice.offer_id) else {
            return false;
        };
        if o.outcome != Outcome::Open
            || env::block_timestamp() >= o.terms.bidding_close_ns.0
            || o.round >= MAX_PURCHASES
            || (!o.terms.takeover_enabled && o.holder.is_some())
            || o.holder.as_ref().is_some_and(|h| h.account_id == sender)
            || invoice.invoice_id.is_empty()
            || invoice.invoice_id.len() > 64
            || invoice.expected_round.0 != o.round
            || invoice.published_terms_sha256.0 != o.terms.published_terms_sha256.0
            || o.invoices.contains(&invoice.invoice_id)
            || amount != o.next_price
        {
            return false;
        }
        let Some(next) = checked_next_price(amount) else {
            return false;
        };
        let Some(received) = o.total_received.checked_add(amount) else {
            return false;
        };
        let Some(global_received) = self.total_received.checked_add(amount) else {
            return false;
        };
        let principal = o.holder.as_ref().map_or(0, |h| h.principal.0);
        let Some(payout) = checked_payout(principal) else {
            return false;
        };
        let Some(revenue) = o
            .potential_seller_revenue
            .checked_add(amount)
            .and_then(|v| v.checked_sub(payout))
        else {
            return false;
        };
        let before = env::storage_usage();
        if let Some(old) = &o.holder {
            let c = o.credits.entry(old.account_id.clone()).or_default();
            c.available.0 = c
                .available
                .0
                .checked_add(principal)
                .expect("credit overflow");
            c.conditional_bonus.0 = c
                .conditional_bonus
                .0
                .checked_add(payout - principal)
                .expect("bonus overflow");
        }
        o.potential_seller_revenue = revenue;
        o.total_received = received;
        o.next_price = next;
        o.round += 1;
        o.participants.insert(sender.clone());
        o.holder = Some(Holder {
            account_id: sender.clone(),
            principal: U128(amount),
        });
        o.invoices.insert(invoice.invoice_id.clone());
        self.total_received = global_received;
        let round = o.round;
        self.save(&invoice.offer_id, o, before);
        self.emit("purchase_accepted",&invoice.offer_id,near_sdk::serde_json::json!({"invoice_id":invoice.invoice_id,"buyer_id":sender,"round":U64(round),"amount":U128(amount)}));
        true
    }
    fn placement_owner(&self, id: &str, o: &Offer) -> Option<AccountId> {
        if o.nft_minted {
            self.nft.nft_token(id.to_owned()).map(|v| v.owner_id)
        } else if env::block_timestamp() >= o.terms.bidding_close_ns.0 {
            o.holder.as_ref().map(|v| v.account_id.clone())
        } else {
            None
        }
    }
    fn mint(&mut self, id: &str, o: &mut Offer) -> Token {
        require!(
            env::block_timestamp() >= o.terms.bidding_close_ns.0,
            "bidding still open"
        );
        require!(o.outcome != Outcome::Failure, "campaign failed");
        let payer = o
            .holder
            .as_ref()
            .expect("no final holder")
            .account_id
            .clone();
        let metadata=TokenMetadata{title:Some("Advertise on Everything: final placement".into()),
            description:Some("Final placement artwork right. Financial claims remain with original creditors. Not vehicle title or proof of installation.".into()),
            copies:Some(1),issued_at:Some(env::block_timestamp_ms().to_string()),starts_at:Some((o.terms.bidding_close_ns.0/1_000_000).to_string()),
            expires_at:Some((o.terms.service_end_ns.0/1_000_000).to_string()),extra:Some(near_sdk::serde_json::json!({"record_type":"final_placement_right","offer_id":id,"hub_id":env::current_account_id(),"original_payer_id":payer,"financial_rights_follow_token":false}).to_string()),..TokenMetadata::default()};
        let token = self
            .nft
            .internal_mint_with_refund(id.to_owned(), payer, Some(metadata), None);
        o.nft_minted = true;
        NftMint {
            owner_id: &token.owner_id,
            token_ids: &[&token.token_id],
            memo: None,
        }
        .emit();
        token
    }
    fn artwork(&mut self, id: String, actor: AccountId, uri: String, hash: Base64VecU8) {
        let before = env::storage_usage();
        let mut o = self.offer(&id);
        require!(artwork_active(&o), "artwork rights inactive");
        assert_artifact(&uri, &hash);
        require!(
            self.placement_owner(&id, &o) == Some(actor.clone()),
            "placement owner only"
        );
        if !o.nft_minted {
            self.mint(&id, &mut o);
        }
        let revision = o.artwork.as_ref().map_or(1, |a| {
            a.revision.0.checked_add(1).expect("revision overflow")
        });
        o.artwork = Some(Artwork {
            revision: U64(revision),
            submitted_by: actor.clone(),
            artifact_uri: uri.clone(),
            artifact_sha256: hash.clone(),
            submitted_at_ns: U64(env::block_timestamp()),
        });
        let mut metadata = self.nft.nft_token(id.clone()).unwrap().metadata.unwrap();
        metadata.reference = Some(uri);
        metadata.reference_hash = Some(hash);
        metadata.updated_at = Some(env::block_timestamp_ms().to_string());
        metadata.assert_valid();
        self.nft
            .token_metadata_by_id
            .as_mut()
            .unwrap()
            .insert(&id, &metadata);
        self.save(&id, o, before);
        self.emit(
            "artwork_submitted",
            &id,
            near_sdk::serde_json::json!({"token_id":id,"revision":U64(revision),"owner_id":actor}),
        );
    }
    fn lock(&mut self, id: String, actor: AccountId, revision: U64) {
        let before = env::storage_usage();
        let mut o = self.offer(&id);
        require!(actor == o.seller_id, "seller only");
        require!(artwork_active(&o), "artwork locking window closed");
        require!(
            o.artwork.as_ref().is_some_and(|a| a.revision == revision),
            "stale artwork revision"
        );
        o.artwork_locked = true;
        self.save(&id, o, before);
        self.emit(
            "artwork_locked",
            &id,
            near_sdk::serde_json::json!({"revision":revision}),
        );
    }
    fn proof(&mut self, id: String, actor: AccountId, uri: String, hash: Base64VecU8) {
        let before = env::storage_usage();
        let mut o = self.offer(&id);
        require!(actor == o.seller_id, "seller only");
        require!(
            o.outcome == Outcome::Open && o.artwork_locked,
            "approved artwork must be locked"
        );
        require!(
            env::block_timestamp() >= o.terms.bidding_close_ns.0
                && env::block_timestamp() <= o.terms.installation_due_ns.0,
            "delivery evidence window closed"
        );
        require!(
            o.delivery_proof.is_none(),
            "delivery proof already committed"
        );
        assert_artifact(&uri, &hash);
        o.delivery_proof = Some(DeliveryProof {
            artifact_uri: uri,
            artifact_sha256: hash,
            artwork_revision: o.artwork.as_ref().unwrap().revision,
            submitted_at_ns: U64(env::block_timestamp()),
        });
        self.save(&id, o, before);
        self.emit(
            "delivery_proof_submitted",
            &id,
            near_sdk::serde_json::json!({"owner_id":actor}),
        );
    }
    fn issue(&mut self, id: String, actor: AccountId, case_id: String, hash: Base64VecU8) {
        let before = env::storage_usage();
        let mut o = self.offer(&id);
        require!(o.outcome == Outcome::Open, "campaign finalized");
        require!(
            env::block_timestamp() >= o.terms.bidding_close_ns.0
                && env::block_timestamp() < o.terms.review_end_ns.0,
            "issue window closed"
        );
        require!(
            actor == o.seller_id
                || o.participants.contains(&actor)
                || self.placement_owner(&id, &o) == Some(actor.clone()),
            "campaign participant only"
        );
        require!(
            !case_id.is_empty() && case_id.len() <= 64,
            "invalid case id"
        );
        require!(hash.0.len() == 32, "case evidence hash required");
        require!(
            !o.issues.contains_key(&case_id) && o.issues.len() < MAX_ISSUES,
            "issue exists or capacity reached"
        );
        o.issues.insert(
            case_id.clone(),
            IssueDecision {
                open: true,
                evidence_sha256: hash,
                recorded_at_ns: U64(env::block_timestamp()),
                opened_by: actor.clone(),
            },
        );
        self.save(&id, o, before);
        self.emit(
            "issue_opened",
            &id,
            near_sdk::serde_json::json!({"case_id":case_id,"opened_by":actor}),
        );
    }
    fn start_withdrawal(&mut self, id: String, owner: AccountId) -> U64 {
        let before = env::storage_usage();
        let mut o = self.offer(&id);
        if o.withdrawals.len() >= MAX_WITHDRAWALS {
            let oldest = o
                .withdrawals
                .iter()
                .find_map(|(wid, w)| (w.status != WithdrawalStatus::Pending).then_some(*wid))
                .expect("too many pending withdrawals");
            o.withdrawals.remove(&oldest);
        }
        let c = o.credits.get_mut(&owner).expect("no credit");
        let amount = c.available.0;
        require!(amount > 0, "no available credit");
        require!(
            amount <= o.total_received - o.total_withdrawn - o.total_pending
                && amount <= self.available_pool(),
            "insufficient allocated balance"
        );
        let wid = o.next_withdrawal_id;
        o.next_withdrawal_id = wid.checked_add(1).expect("withdrawal overflow");
        c.available = U128(0);
        o.total_pending = o
            .total_pending
            .checked_add(amount)
            .expect("pending overflow");
        self.total_pending = self
            .total_pending
            .checked_add(amount)
            .expect("global pending overflow");
        o.storage_remaining = o
            .storage_remaining
            .checked_sub(1)
            .expect("offer operating reserve exhausted");
        o.withdrawals.insert(
            wid,
            Withdrawal {
                owner_id: owner.clone(),
                amount: U128(amount),
                settlement: "intents".into(),
                status: WithdrawalStatus::Pending,
            },
        );
        self.save(&id, o, before);
        Promise::new(self.intents_contract_id.clone()).function_call("mt_transfer",near_sdk::serde_json::to_vec(&near_sdk::serde_json::json!({"receiver_id":owner,"token_id":self.token_id(),"amount":U128(amount),"approval":null,"memo":format!("{id}:withdrawal:{wid}")})).unwrap(),NearToken::from_yoctonear(1),TRANSFER_GAS)
            .then(ext_self::ext(env::current_account_id()).with_static_gas(CALLBACK_GAS).on_withdrawal(id.clone(),U64(wid))).detach();
        self.emit("withdrawal_started",&id,near_sdk::serde_json::json!({"withdrawal_id":U64(wid),"owner_id":owner,"amount":U128(amount)}));
        U64(wid)
    }
    fn transfer_placement(&mut self, id: String, actor: AccountId, receiver: AccountId) {
        let before = env::storage_usage();
        let o = self.offer(&id);
        require!(o.nft_minted, "placement not minted");
        self.nft
            .internal_transfer(&actor, &receiver, &id, None, None);
        self.save(&id, o, before);
    }
    fn emit(&self, event: &str, id: &str, mut data: near_sdk::serde_json::Value) {
        data["offer_id"] = id.into();
        data["hub_id"] = env::current_account_id().as_str().into();
        env::log_str(&format!(
            "EVENT_JSON:{}",
            near_sdk::serde_json::json!({"standard":"pitboard","version":"1.0.0","event":event,"data":[data]})
        ));
    }
}

fn storage_reserve() -> u128 {
    env::storage_byte_cost().as_yoctonear() * OFFER_STORAGE_BYTES
}
fn assert_offer_id(id: &str) {
    require!(
        id.len() == 38
            && id.starts_with("offer-")
            && id.as_bytes()[6..]
                .iter()
                .all(|b| b.is_ascii_digit() || (*b >= b'a' && *b <= b'f')),
        "invalid offer id"
    );
}
fn validate_terms(t: &CampaignTerms) {
    for v in [&t.sale_id, &t.asset_id, &t.spot_id] {
        require!(
            !v.is_empty() && v.len() <= 128,
            "invalid inventory reference"
        );
    }
    require!(
        t.published_terms_sha256.0.len() == 32,
        "terms hash must be SHA256"
    );
    require!(
        env::block_timestamp() < t.bidding_close_ns.0,
        "bidding must close in future"
    );
    require!(
        t.bidding_close_ns.0 <= env::block_timestamp().saturating_add(30 * DAY_NS),
        "bidding must close within 30 days"
    );
    require!(
        t.review_end_ns.0 <= env::block_timestamp().saturating_add(366 * DAY_NS),
        "campaign review must finish within 366 days"
    );
    require!(
        t.bidding_close_ns.0 < t.artwork_due_ns.0
            && t.artwork_due_ns.0 <= t.installation_due_ns.0
            && t.installation_due_ns.0 <= t.service_start_ns.0
            && t.service_start_ns.0 < t.service_end_ns.0
            && t.service_end_ns.0 < t.review_end_ns.0,
        "invalid campaign schedule"
    );
}
fn assert_artifact(uri: &str, hash: &Base64VecU8) {
    require!(
        !uri.is_empty()
            && uri.len() <= 2048
            && (uri.starts_with("https://") || uri.starts_with("ipfs://")),
        "invalid artifact URI"
    );
    require!(hash.0.len() == 32, "artifact SHA256 required");
}
fn artwork_active(o: &Offer) -> bool {
    o.holder.is_some()
        && !o.artwork_locked
        && o.outcome != Outcome::Failure
        && env::block_timestamp() >= o.terms.bidding_close_ns.0
        && env::block_timestamp() < o.terms.artwork_due_ns.0
}
fn checked_next_price(v: u128) -> Option<u128> {
    (v / CENT)
        .checked_mul(3)?
        .checked_add(1)?
        .checked_div(2)?
        .checked_mul(CENT)
}
fn checked_payout(v: u128) -> Option<u128> {
    (v / CENT)
        .checked_mul(11)?
        .checked_add(9)?
        .checked_div(10)?
        .checked_mul(CENT)
}
fn assert_offer_solvent(o: &Offer) {
    let credits = o
        .credits
        .values()
        .try_fold(0u128, |sum, c| {
            sum.checked_add(c.available.0)?
                .checked_add(c.conditional_bonus.0)
        })
        .expect("credit overflow");
    let liability = if o.outcome == Outcome::Open {
        credits
            .checked_add(o.potential_seller_revenue)
            .expect("liability overflow")
    } else {
        credits
    };
    require!(
        liability
            == o.total_received
                .checked_sub(o.total_withdrawn)
                .and_then(|v| v.checked_sub(o.total_pending))
                .expect("offer insolvency"),
        "offer liability mismatch"
    );
}

#[near]
impl NonFungibleTokenCore for MarketplaceHub {
    #[payable]
    fn nft_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
    ) {
        near_sdk::assert_one_yocto();
        let before = env::storage_usage();
        let o = self.offer(&token_id);
        self.nft.internal_transfer(
            &env::predecessor_account_id(),
            &receiver_id,
            &token_id,
            approval_id,
            memo,
        );
        self.save(&token_id, o, before);
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
        let before = env::storage_usage();
        let o = self.offer(&token_id);
        require!(
            !artwork_active(&o),
            "transfer-call disabled while artwork rights active"
        );
        let result =
            self.nft
                .nft_transfer_call(receiver_id, token_id.clone(), approval_id, memo, msg);
        self.save(&token_id, o, before);
        result
    }
    fn nft_token(&self, token_id: TokenId) -> Option<Token> {
        self.nft.nft_token(token_id)
    }
}
#[near]
impl NonFungibleTokenResolver for MarketplaceHub {
    #[private]
    fn nft_resolve_transfer(
        &mut self,
        previous_owner_id: AccountId,
        receiver_id: AccountId,
        token_id: TokenId,
        approved_account_ids: Option<HashMap<AccountId, u64>>,
    ) -> bool {
        let before = env::storage_usage();
        let o = self.offer(&token_id);
        let result = self.nft.nft_resolve_transfer(
            previous_owner_id,
            receiver_id,
            token_id.clone(),
            approved_account_ids,
        );
        self.save(&token_id, o, before);
        result
    }
}
#[near]
impl NonFungibleTokenEnumeration for MarketplaceHub {
    fn nft_total_supply(&self) -> U128 {
        self.nft.nft_total_supply()
    }
    fn nft_tokens(&self, from_index: Option<U128>, limit: Option<u64>) -> Vec<Token> {
        self.nft
            .nft_tokens(from_index, Some(limit.unwrap_or(50).min(100)))
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
        self.nft
            .nft_tokens_for_owner(account_id, from_index, Some(limit.unwrap_or(50).min(100)))
    }
}
#[near]
impl NonFungibleTokenMetadataProvider for MarketplaceHub {
    fn nft_metadata(&self) -> NFTContractMetadata {
        self.nft_metadata.get().unwrap()
    }
}

#[cfg(test)]
mod tests;
