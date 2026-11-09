use super::*;
use near_sdk::json_types::Base64VecU8;

#[near(serializers = [json, borsh])]
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

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct DeliveryProof {
    pub artifact_uri: String,
    pub artifact_sha256: Base64VecU8,
    pub artwork_revision: U64,
    pub submitted_at_ns: U64,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct IssueDecision {
    pub open: bool,
    pub evidence_sha256: Base64VecU8,
    pub recorded_at_ns: U64,
}

#[near(serializers = [json])]
pub struct CampaignView {
    pub terms: Option<CampaignTerms>,
    pub delivery_proof: Option<DeliveryProof>,
    pub open_issues: u32,
    pub issues: BTreeMap<String, IssueDecision>,
}

#[derive(near_sdk::serde::Deserialize)]
#[serde(crate = "near_sdk::serde", deny_unknown_fields)]
struct BoundInvoice {
    invoice_id: String,
    expected_round: U64,
    published_terms_sha256: Base64VecU8,
}

impl CampaignTerms {
    fn validate(&self) {
        for value in [&self.sale_id, &self.asset_id, &self.spot_id] {
            require!(
                !value.is_empty() && value.len() <= 128,
                "invalid inventory reference"
            );
        }
        require!(
            self.published_terms_sha256.0.len() == 32,
            "terms hash must be SHA256"
        );
        require!(
            env::block_timestamp() < self.bidding_close_ns.0,
            "bidding must close in future"
        );
        require!(
            self.bidding_close_ns.0 < self.artwork_due_ns.0
                && self.artwork_due_ns.0 <= self.installation_due_ns.0
                && self.installation_due_ns.0 <= self.service_start_ns.0
                && self.service_start_ns.0 < self.service_end_ns.0
                && self.service_end_ns.0 < self.review_end_ns.0,
            "invalid campaign schedule"
        );
    }
}

#[near]
impl Marketplace {
    #[init]
    pub fn new_campaign(
        seller_id: AccountId,
        arbiter_id: AccountId,
        ft_contract_id: AccountId,
        intents_contract_id: AccountId,
        settlement: Settlement,
        initial_price_cents: U128,
        terms: CampaignTerms,
    ) -> Self {
        terms.validate();
        require!(seller_id != arbiter_id, "seller and arbiter must differ");
        let mut market = Self::new(
            seller_id,
            arbiter_id,
            ft_contract_id,
            intents_contract_id,
            settlement,
            initial_price_cents,
            terms.bidding_close_ns,
            terms.review_end_ns,
        );
        market.campaign = Some(terms);
        market
    }

    pub fn get_campaign(&self) -> CampaignView {
        CampaignView {
            terms: self.campaign.clone(),
            delivery_proof: self.delivery_proof.clone(),
            open_issues: self.issues.values().filter(|issue| issue.open).count() as u32,
            issues: self.issues.clone(),
        }
    }

    /// Seller commits evidence; only the separate arbiter decides its truth.
    /// Attached NEAR pays persistent byte growth, never USDC escrow.
    #[payable]
    pub fn submit_delivery_proof(&mut self, artifact_uri: String, artifact_sha256: Base64VecU8) {
        require!(
            env::predecessor_account_id() == self.seller_id,
            "seller only"
        );
        require!(
            self.outcome == Outcome::Open && self.artwork_locked,
            "approved artwork must be locked"
        );
        let terms = self.campaign.as_ref().expect("campaign terms required");
        require!(
            env::block_timestamp() >= terms.bidding_close_ns.0
                && env::block_timestamp() <= terms.service_end_ns.0,
            "delivery evidence window closed"
        );
        require!(
            self.delivery_proof.is_none(),
            "delivery proof already committed"
        );
        assert_artifact(&artifact_uri, &artifact_sha256);
        let before = serialized_len(self);
        self.delivery_proof = Some(DeliveryProof {
            artifact_uri,
            artifact_sha256,
            artwork_revision: self.artwork.as_ref().expect("artwork required").revision,
            submitted_at_ns: U64(env::block_timestamp()),
        });
        pay_state_growth(before, self);
        self.emit("delivery_proof_submitted", near_sdk::serde_json::json!({"revision":self.delivery_proof.as_ref().unwrap().artwork_revision}));
    }

    /// Case state changes are on-chain settlement gates, with a committed reason.
    #[payable]
    pub fn record_issue_decision(
        &mut self,
        case_id: String,
        open: bool,
        evidence_sha256: Base64VecU8,
    ) {
        self.assert_arbiter();
        require!(
            self.campaign.is_some() && self.outcome == Outcome::Open,
            "campaign is finalized"
        );
        require!(
            !case_id.is_empty() && case_id.len() <= 64,
            "invalid case id"
        );
        require!(evidence_sha256.0.len() == 32, "case evidence hash required");
        require!(
            self.issues.contains_key(&case_id) || self.issues.len() < 32,
            "case capacity reached"
        );
        let before = serialized_len(self);
        self.issues.insert(
            case_id.clone(),
            IssueDecision {
                open,
                evidence_sha256,
                recorded_at_ns: U64(env::block_timestamp()),
            },
        );
        pay_state_growth(before, self);
        self.emit(
            "issue_decision",
            near_sdk::serde_json::json!({"case_id":case_id,"open":open}),
        );
    }
}

impl Marketplace {
    pub(crate) fn artwork_deadline(&self) -> u64 {
        self.campaign
            .as_ref()
            .map_or(self.refund_end_ns, |terms| terms.artwork_due_ns.0)
    }

    pub(crate) fn accepts_campaign_purchase(&self, message: &str) -> bool {
        let Some(terms) = &self.campaign else {
            return true;
        };
        if !terms.takeover_enabled && self.holder.is_some() {
            return false;
        }
        let Ok(invoice) = near_sdk::serde_json::from_str::<BoundInvoice>(message) else {
            return false;
        };
        !invoice.invoice_id.is_empty()
            && invoice.expected_round.0 == self.round
            && invoice.published_terms_sha256.0 == terms.published_terms_sha256.0
    }

    pub(crate) fn assert_campaign_settleable(&self) {
        if let Some(terms) = &self.campaign {
            require!(
                env::block_timestamp() >= terms.review_end_ns.0,
                "campaign review period open"
            );
            require!(
                self.artwork_locked && self.delivery_proof.is_some(),
                "delivery proof and locked artwork required"
            );
            require!(
                !self.issues.values().any(|issue| issue.open),
                "unresolved campaign issue"
            );
        }
    }

    pub(crate) fn assert_artwork_lockable(&self) {
        let deadline = self
            .campaign
            .as_ref()
            .map_or(self.refund_end_ns, |terms| terms.installation_due_ns.0);
        require!(
            self.nft_minted
                && !self.artwork_locked
                && self.outcome != Outcome::Failure
                && env::block_timestamp() >= self.cutoff_ns
                && env::block_timestamp() < deadline,
            "artwork locking window closed"
        );
    }
}

fn assert_artifact(uri: &str, hash: &Base64VecU8) {
    require!(
        !uri.is_empty()
            && uri.len() <= 2048
            && (uri.starts_with("https://") || uri.starts_with("ipfs://")),
        "invalid proof artifact URI"
    );
    require!(hash.0.len() == 32, "proof SHA256 required");
}
fn serialized_len(market: &Marketplace) -> usize {
    near_sdk::borsh::to_vec(market)
        .expect("serialize campaign")
        .len()
}
fn pay_state_growth(before: usize, market: &Marketplace) {
    let bytes = serialized_len(market).saturating_sub(before) as u64;
    let needed = env::storage_byte_cost().saturating_mul(u128::from(bytes));
    require!(
        env::attached_deposit() >= needed,
        "insufficient campaign storage deposit"
    );
    let refund = env::attached_deposit().saturating_sub(needed);
    if !refund.is_zero() {
        Promise::new(env::predecessor_account_id())
            .transfer(refund)
            .detach();
    }
}

#[cfg(test)]
mod tests;
