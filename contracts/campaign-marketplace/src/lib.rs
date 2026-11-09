use near_contract_standards::non_fungible_token::{
    metadata::NFTContractMetadata, NonFungibleToken,
};
use std::collections::{BTreeMap, BTreeSet};

use near_sdk::{
    collections::LazyOption,
    env, ext_contract,
    json_types::{U128, U64},
    near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseError,
    PromiseOrValue,
};

const CENT: u128 = 10_000;
const MAX_PURCHASES: u64 = 32;
const TRANSFER_GAS: Gas = Gas::from_tgas(25);
const CALLBACK_GAS: Gas = Gas::from_tgas(15);

mod campaign;
mod placement_nft;
pub use campaign::{CampaignTerms, CampaignView, DeliveryProof, IssueDecision};
pub use placement_nft::{Artwork, PlacementRights};

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Settlement {
    Native,
    Intents,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Outcome {
    Open,
    Success,
    Failure,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Default, Debug)]
pub struct Credit {
    pub available: U128,
    pub conditional_bonus: U128,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct Holder {
    pub account_id: AccountId,
    pub principal: U128,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WithdrawalStatus {
    Pending,
    Succeeded,
    Failed,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct Withdrawal {
    pub owner_id: AccountId,
    pub amount: U128,
    pub settlement: Settlement,
    pub status: WithdrawalStatus,
}

#[near(serializers = [json])]
pub struct PurchaseMessage {
    pub invoice_id: String,
    pub expected_round: U64,
}

#[near(serializers = [json])]
#[serde(tag = "action", rename_all = "snake_case", deny_unknown_fields)]
enum AuthAction {
    NominateNftRecipient { recipient_id: AccountId },
}

#[near(serializers = [json])]
pub struct StateView {
    pub seller_id: AccountId,
    pub arbiter_id: AccountId,
    pub ft_contract_id: AccountId,
    pub intents_contract_id: AccountId,
    pub intents_token_id: String,
    pub settlement: Settlement,
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
}

#[ext_contract(ext_self)]
#[allow(dead_code)]
trait Callbacks {
    fn on_withdrawal(&mut self, withdrawal_id: U64) -> bool;
}

/// One finite campaign per storefront. Native and Intents are alternative,
/// immutable settlement adapters: a storefront never pools the two assets.
#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Marketplace {
    seller_id: AccountId,
    arbiter_id: AccountId,
    ft_contract_id: AccountId,
    intents_contract_id: AccountId,
    settlement: Settlement,
    cutoff_ns: u64,
    refund_end_ns: u64,
    outcome: Outcome,
    round: u64,
    next_price: u128,
    holder: Option<Holder>,
    potential_seller_revenue: u128,
    credits: BTreeMap<AccountId, Credit>,
    invoices: BTreeSet<String>,
    withdrawals: BTreeMap<u64, Withdrawal>,
    next_withdrawal_id: u64,
    total_received: u128,
    total_withdrawn: u128,
    total_pending: u128,
    pub(crate) nft: NonFungibleToken,
    pub(crate) nft_metadata: LazyOption<NFTContractMetadata>,
    pub(crate) artwork_locked: bool,
    pub(crate) nft_minted: bool,
    pub(crate) nominated_recipient: Option<AccountId>,
    pub(crate) nomination_accepted: bool,
    pub(crate) artwork: Option<Artwork>,
    campaign: Option<CampaignTerms>,
    delivery_proof: Option<DeliveryProof>,
    issues: BTreeMap<String, IssueDecision>,
}

impl Marketplace {
    /// Internal legacy constructor retained for shared financial unit tests.
    /// Public initialization uses new_campaign and requires committed terms.
    pub fn new(
        seller_id: AccountId,
        arbiter_id: AccountId,
        ft_contract_id: AccountId,
        intents_contract_id: AccountId,
        settlement: Settlement,
        initial_price_cents: U128,
        cutoff_ns: U64,
        refund_end_ns: U64,
    ) -> Self {
        require!(initial_price_cents.0 > 0, "zero price");
        require!(
            cutoff_ns.0 > env::block_timestamp(),
            "cutoff must be future"
        );
        require!(refund_end_ns.0 >= cutoff_ns.0, "refund end before cutoff");
        let next_price = initial_price_cents
            .0
            .checked_mul(CENT)
            .expect("price overflow");
        // Make the first accepted round capable of quoting its successor.
        next_price_cents(next_price);
        Self {
            seller_id,
            arbiter_id,
            ft_contract_id,
            intents_contract_id,
            settlement,
            cutoff_ns: cutoff_ns.0,
            refund_end_ns: refund_end_ns.0,
            outcome: Outcome::Open,
            round: 0,
            next_price,
            holder: None,
            potential_seller_revenue: 0,
            credits: BTreeMap::new(),
            invoices: BTreeSet::new(),
            withdrawals: BTreeMap::new(),
            next_withdrawal_id: 0,
            total_received: 0,
            total_withdrawn: 0,
            total_pending: 0,
            nft: placement_nft::new_placement_nft(),
            nft_metadata: LazyOption::new(
                b"pm".to_vec(),
                Some(&placement_nft::placement_metadata()),
            ),
            artwork_locked: false,
            nft_minted: false,
            nominated_recipient: None,
            nomination_accepted: false,
            artwork: None,
            campaign: None,
            delivery_proof: None,
            issues: BTreeMap::new(),
        }
    }
}

#[near]
impl Marketplace {
    pub fn get_state(&self) -> StateView {
        StateView {
            seller_id: self.seller_id.clone(),
            arbiter_id: self.arbiter_id.clone(),
            ft_contract_id: self.ft_contract_id.clone(),
            intents_contract_id: self.intents_contract_id.clone(),
            intents_token_id: self.intents_token_id(),
            settlement: self.settlement,
            outcome: self.outcome,
            cutoff_ns: U64(self.cutoff_ns),
            refund_end_ns: U64(self.refund_end_ns),
            round: U64(self.round),
            next_price: U128(self.next_price),
            holder: self.holder.clone(),
            potential_seller_revenue: U128(self.potential_seller_revenue),
            total_received: U128(self.total_received),
            total_withdrawn: U128(self.total_withdrawn),
            total_pending: U128(self.total_pending),
            nft_minted: self.nft_minted,
            nominated_recipient: self.nominated_recipient.clone(),
            nomination_accepted: self.nomination_accepted,
            artwork_locked: self.artwork_locked,
        }
    }

    pub fn get_credit(&self, account_id: AccountId) -> Credit {
        self.credits.get(&account_id).cloned().unwrap_or_default()
    }

    pub fn get_withdrawal(&self, withdrawal_id: U64) -> Option<Withdrawal> {
        self.withdrawals.get(&withdrawal_id.0).cloned()
    }

    pub fn is_invoice_used(&self, invoice_id: String) -> bool {
        self.invoices.contains(&invoice_id)
    }

    /// Unexpected assets are returned unused, never recorded as money received.
    pub fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        if self.settlement != Settlement::Native
            || env::predecessor_account_id() != self.ft_contract_id
        {
            return PromiseOrValue::Value(amount);
        }
        let accepted = self.accept_purchase(sender_id, amount.0, &msg);
        PromiseOrValue::Value(U128(if accepted { 0 } else { amount.0 }))
    }

    pub fn mt_on_transfer(
        &mut self,
        sender_id: AccountId,
        previous_owner_ids: Vec<AccountId>,
        token_ids: Vec<String>,
        amounts: Vec<U128>,
        msg: String,
    ) -> PromiseOrValue<Vec<U128>> {
        if self.settlement != Settlement::Intents
            || env::predecessor_account_id() != self.intents_contract_id
            || amounts.len() != 1
            || token_ids.len() != 1
            || previous_owner_ids.len() != 1
            || token_ids[0] != self.intents_token_id()
            || previous_owner_ids[0] != sender_id
        {
            return PromiseOrValue::Value(amounts);
        }
        let accepted = self.accept_purchase(sender_id, amounts[0].0, &msg);
        PromiseOrValue::Value(if accepted { vec![U128(0)] } else { amounts })
    }

    /// Trusted physical-fulfillment decision. No release before refund exposure ends.
    pub fn finalize_success(&mut self) {
        self.assert_arbiter();
        require!(self.outcome == Outcome::Open, "already finalized");
        require!(
            env::block_timestamp() >= self.refund_end_ns,
            "refund window open"
        );
        self.assert_campaign_settleable();
        for credit in self.credits.values_mut() {
            credit.available.0 = credit
                .available
                .0
                .checked_add(credit.conditional_bonus.0)
                .expect("credit overflow");
            credit.conditional_bonus = U128(0);
        }
        self.credits
            .entry(self.seller_id.clone())
            .or_default()
            .available
            .0 = self
            .credits
            .get(&self.seller_id)
            .map_or(0, |c| c.available.0)
            .checked_add(self.potential_seller_revenue)
            .expect("credit overflow");
        self.outcome = Outcome::Success;
        self.emit(
            "finalized",
            near_sdk::serde_json::json!({"outcome":"success"}),
        );
    }

    pub fn finalize_failure(&mut self) {
        self.assert_arbiter();
        require!(self.outcome == Outcome::Open, "already finalized");
        require!(
            env::block_timestamp() >= self.cutoff_ns,
            "contest still open"
        );
        for credit in self.credits.values_mut() {
            credit.conditional_bonus = U128(0);
        }
        if let Some(holder) = &self.holder {
            let credit = self.credits.entry(holder.account_id.clone()).or_default();
            credit.available.0 = credit
                .available
                .0
                .checked_add(holder.principal.0)
                .expect("credit overflow");
        }
        self.potential_seller_revenue = 0;
        self.outcome = Outcome::Failure;
        self.emit(
            "finalized",
            near_sdk::serde_json::json!({"outcome":"failure"}),
        );
    }

    /// Claims always pay the stored creditor. No caller-supplied redirect.
    pub fn withdraw(&mut self) -> U64 {
        self.start_withdrawal(env::predecessor_account_id())
    }

    /// Allows a keeper to release an Intents user's claim without assuming that
    /// their EVM/Solana identity can send an ordinary NEAR transaction.
    pub fn release_credit(&mut self, account_id: AccountId) -> U64 {
        require!(
            self.settlement == Settlement::Intents,
            "Intents settlement only"
        );
        self.start_withdrawal(account_id)
    }

    /// Native buyers can nominate an independently controlled NEAR account.
    /// Nomination never changes the booked payer or any financial claim.
    pub fn nominate_nft_recipient(&mut self, recipient_id: AccountId) {
        require!(
            self.settlement == Settlement::Native,
            "native nomination only"
        );
        let payer = self.holder.as_ref().expect("no holder").account_id.clone();
        require!(env::predecessor_account_id() == payer, "final payer only");
        self.nominate_recipient(recipient_id);
    }

    /// Narrow signed-Intents adapter. Only the final payer may nominate, and
    /// this endpoint cannot redirect withdrawals, release funds or set roles.
    pub fn on_auth(&mut self, signer_id: AccountId, msg: String) {
        require!(
            self.settlement == Settlement::Intents,
            "Intents settlement only"
        );
        require!(
            env::predecessor_account_id() == self.intents_contract_id,
            "Intents verifier only"
        );
        require!(
            self.holder
                .as_ref()
                .is_some_and(|holder| holder.account_id == signer_id),
            "final payer only"
        );
        require!(msg.len() <= 512, "auth message too long");
        let action: AuthAction =
            near_sdk::serde_json::from_str(&msg).expect("unsupported auth action");
        match action {
            AuthAction::NominateNftRecipient { recipient_id } => {
                self.nominate_recipient(recipient_id)
            }
        }
    }

    /// A nomination alone does not prove that a wallet can operate the target
    /// NEAR account. The nominated account accepts using its own authority.
    pub fn accept_nft_nomination(&mut self) {
        self.assert_nomination_open();
        require!(
            self.nominated_recipient.as_ref() == Some(&env::predecessor_account_id()),
            "nominated recipient only"
        );
        self.nomination_accepted = true;
    }

    #[private]
    pub fn on_withdrawal(&mut self, withdrawal_id: U64) -> bool {
        #[cfg(feature = "callback-fault")]
        env::panic_str("LOCAL TEST ARTIFACT: injected callback failure");
        require!(env::promise_results_count() == 1, "one result required");
        let withdrawal = self
            .withdrawals
            .get_mut(&withdrawal_id.0)
            .expect("unknown withdrawal");
        require!(
            withdrawal.status == WithdrawalStatus::Pending,
            "already resolved"
        );
        // TooLong is still a successful transfer receipt. Avoid copying an
        // unbounded result and never restore funds merely for a large return.
        let succeeded = !matches!(
            env::promise_result_checked(0, 4096),
            Err(PromiseError::Failed)
        );
        self.total_pending = self
            .total_pending
            .checked_sub(withdrawal.amount.0)
            .expect("pending underflow");
        if succeeded {
            withdrawal.status = WithdrawalStatus::Succeeded;
            self.total_withdrawn = self
                .total_withdrawn
                .checked_add(withdrawal.amount.0)
                .expect("total overflow");
        } else {
            withdrawal.status = WithdrawalStatus::Failed;
            let credit = self.credits.entry(withdrawal.owner_id.clone()).or_default();
            credit.available.0 = credit
                .available
                .0
                .checked_add(withdrawal.amount.0)
                .expect("credit overflow");
        }
        self.emit(
            "withdrawal_resolved",
            near_sdk::serde_json::json!({"withdrawal_id":withdrawal_id,"succeeded":succeeded}),
        );
        succeeded
    }
}

impl Marketplace {
    fn assert_nomination_open(&self) {
        require!(
            env::block_timestamp() >= self.cutoff_ns,
            "bidding still open"
        );
        require!(self.outcome != Outcome::Failure, "campaign failed");
        require!(!self.nft_minted, "placement already minted");
    }

    fn nominate_recipient(&mut self, recipient_id: AccountId) {
        self.assert_nomination_open();
        require!(
            !recipient_id.as_str().starts_with("0x") && !recipient_id.as_str().starts_with("0u"),
            "native NEAR recipient required"
        );
        self.nominated_recipient = Some(recipient_id);
        self.nomination_accepted = false;
    }

    pub(crate) fn final_nft_owner(&self) -> AccountId {
        if let Some(recipient) = &self.nominated_recipient {
            require!(self.nomination_accepted, "recipient has not accepted");
            return recipient.clone();
        }
        require!(
            self.settlement == Settlement::Native,
            "Intents payer must nominate a NEAR recipient"
        );
        self.holder.as_ref().expect("no holder").account_id.clone()
    }

    fn intents_token_id(&self) -> String {
        format!("nep141:{}", self.ft_contract_id)
    }

    fn assert_arbiter(&self) {
        require!(
            env::predecessor_account_id() == self.arbiter_id,
            "arbiter only"
        );
    }

    fn accept_purchase(&mut self, sender_id: AccountId, amount: u128, msg: &str) -> bool {
        // Bound parsing/storage and all finalization work in this proof.
        if msg.len() > 512
            || self.outcome != Outcome::Open
            || env::block_timestamp() >= self.cutoff_ns
            || self.round >= MAX_PURCHASES
        {
            return false;
        }
        if !self.accepts_campaign_purchase(msg)
            || self
                .holder
                .as_ref()
                .is_some_and(|holder| holder.account_id == sender_id)
        {
            return false;
        }
        let Ok(invoice) = near_sdk::serde_json::from_str::<PurchaseMessage>(msg) else {
            return false;
        };
        if invoice.invoice_id.is_empty()
            || invoice.invoice_id.len() > 64
            || invoice.expected_round.0 != self.round
            || self.invoices.contains(&invoice.invoice_id)
            || amount != self.next_price
        {
            return false;
        }

        // Compute all potentially failing arithmetic before changing state.
        let Some(next_price) = checked_next_price(amount) else {
            return false;
        };
        let Some(total_received) = self.total_received.checked_add(amount) else {
            return false;
        };
        let old_principal = self.holder.as_ref().map_or(0, |h| h.principal.0);
        let Some(displaced_payout) = checked_payout(old_principal) else {
            return false;
        };
        let bonus = displaced_payout - old_principal;
        let Some(revenue) = self
            .potential_seller_revenue
            .checked_add(amount)
            .and_then(|v| v.checked_sub(displaced_payout))
        else {
            return false;
        };
        if let Some(old) = &self.holder {
            let credit = self
                .credits
                .get(&old.account_id)
                .cloned()
                .unwrap_or_default();
            if credit.available.0.checked_add(old_principal).is_none()
                || credit.conditional_bonus.0.checked_add(bonus).is_none()
            {
                return false;
            }
        }
        if let Some(old) = &self.holder {
            let credit = self.credits.entry(old.account_id.clone()).or_default();
            credit.available.0 += old_principal;
            credit.conditional_bonus.0 += bonus;
        }
        self.potential_seller_revenue = revenue;
        self.total_received = total_received;
        self.next_price = next_price;
        self.round += 1;
        self.nominated_recipient = None;
        self.nomination_accepted = false;
        self.holder = Some(Holder {
            account_id: sender_id.clone(),
            principal: U128(amount),
        });
        self.invoices.insert(invoice.invoice_id.clone());
        self.emit("purchase_accepted", near_sdk::serde_json::json!({
            "invoice_id":invoice.invoice_id,"buyer_id":sender_id,"round":U64(self.round),"amount":U128(amount)
        }));
        true
    }

    fn start_withdrawal(&mut self, owner_id: AccountId) -> U64 {
        let credit = self.credits.get_mut(&owner_id).expect("no credit");
        let amount = credit.available.0;
        require!(amount > 0, "no available credit");
        let id = self.next_withdrawal_id;
        self.next_withdrawal_id = id.checked_add(1).expect("withdrawal id overflow");
        self.total_pending = self
            .total_pending
            .checked_add(amount)
            .expect("pending overflow");
        credit.available = U128(0);
        self.withdrawals.insert(
            id,
            Withdrawal {
                owner_id: owner_id.clone(),
                amount: U128(amount),
                settlement: self.settlement,
                status: WithdrawalStatus::Pending,
            },
        );
        let (contract_id, method, args) = match self.settlement {
            Settlement::Native => (
                self.ft_contract_id.clone(),
                "ft_transfer",
                near_sdk::serde_json::json!({
                    "receiver_id":owner_id,"amount":U128(amount),"memo":format!("withdrawal:{id}")
                }),
            ),
            Settlement::Intents => (
                self.intents_contract_id.clone(),
                "mt_transfer",
                near_sdk::serde_json::json!({
                    "receiver_id":owner_id,"token_id":self.intents_token_id(),"amount":U128(amount),
                    "approval":null,"memo":format!("withdrawal:{id}")
                }),
            ),
        };
        Promise::new(contract_id)
            .function_call(
                method,
                near_sdk::serde_json::to_vec(&args).expect("serialize"),
                NearToken::from_yoctonear(1),
                TRANSFER_GAS,
            )
            .then(
                ext_self::ext(env::current_account_id())
                    .with_static_gas(CALLBACK_GAS)
                    .on_withdrawal(U64(id)),
            )
            .detach();
        self.emit("withdrawal_started", near_sdk::serde_json::json!({"withdrawal_id":U64(id),"owner_id":owner_id,"amount":U128(amount)}));
        U64(id)
    }

    fn emit(&self, event: &str, data: near_sdk::serde_json::Value) {
        env::log_str(&format!(
            "EVENT_JSON:{}",
            near_sdk::serde_json::json!({
                "standard":"pitboard","version":"1.0.0","event":event,"data":[data]
            })
        ));
    }
}

fn checked_next_price(amount: u128) -> Option<u128> {
    (amount / CENT)
        .checked_mul(3)?
        .checked_add(1)?
        .checked_div(2)?
        .checked_mul(CENT)
}

fn next_price_cents(amount: u128) -> u128 {
    checked_next_price(amount).expect("next price overflow")
}

fn checked_payout(amount: u128) -> Option<u128> {
    (amount / CENT)
        .checked_mul(11)?
        .checked_add(9)?
        .checked_div(10)?
        .checked_mul(CENT)
}

#[cfg(test)]
#[path = "../../marketplace/src/tests.rs"]
mod tests;

#[cfg(test)]
#[path = "../../marketplace/src/low_cost_tests.rs"]
mod low_cost_tests;
