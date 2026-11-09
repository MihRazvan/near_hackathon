//! Local NEP-245 notification fixture, NOT a verifier or signature implementation.
use near_sdk::json_types::U128;
use near_sdk::{AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseResult, env, near};
use std::collections::BTreeMap;

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct TestIntents {
    owner_id: AccountId,
    balances: BTreeMap<(AccountId, String), u128>,
    blocked_recipient: Option<AccountId>,
}

#[near]
impl TestIntents {
    #[init]
    pub fn new(owner_id: AccountId) -> Self {
        Self {
            owner_id,
            balances: BTreeMap::new(),
            blocked_recipient: None,
        }
    }

    pub fn mint(&mut self, account_id: AccountId, token_id: String, amount: U128) {
        assert_eq!(env::predecessor_account_id(), self.owner_id, "owner only");
        *self.balances.entry((account_id, token_id)).or_default() += amount.0;
    }

    pub fn block_recipient(&mut self, account_id: Option<AccountId>) {
        assert_eq!(env::predecessor_account_id(), self.owner_id, "owner only");
        self.blocked_recipient = account_id;
    }

    pub fn mt_balance_of(&self, account_id: AccountId, token_id: String) -> U128 {
        U128(*self.balances.get(&(account_id, token_id)).unwrap_or(&0))
    }

    #[payable]
    pub fn mt_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: String,
        amount: U128,
        approval: Option<near_sdk::serde_json::Value>,
        memo: Option<String>,
    ) {
        near_sdk::assert_one_yocto();
        assert!(approval.is_none(), "approvals not implemented by fixture");
        let _ = memo;
        assert_ne!(
            self.blocked_recipient.as_ref(),
            Some(&receiver_id),
            "fixture blocked recipient"
        );
        self.move_balance(
            &env::predecessor_account_id(),
            &receiver_id,
            &token_id,
            amount.0,
        );
    }

    #[payable]
    pub fn mt_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_id: String,
        amount: U128,
        msg: String,
    ) -> Promise {
        near_sdk::assert_one_yocto();
        let sender_id = env::predecessor_account_id();
        self.move_balance(&sender_id, &receiver_id, &token_id, amount.0);
        Promise::new(receiver_id.clone()).function_call(
            "mt_on_transfer",
            near_sdk::serde_json::to_vec(&near_sdk::serde_json::json!({
                "sender_id":sender_id,"previous_owner_ids":[sender_id],
                "token_ids":[token_id],"amounts":[amount],"msg":msg
            })).unwrap(), NearToken::from_yoctonear(0), Gas::from_tgas(65),
        ).then(Promise::new(env::current_account_id()).function_call(
            "resolve",
            near_sdk::serde_json::to_vec(&near_sdk::serde_json::json!({
                "sender_id":sender_id,"receiver_id":receiver_id,"token_id":token_id,"amount":amount
            })).unwrap(), NearToken::from_yoctonear(0), Gas::from_tgas(20),
        ))
    }

    #[private]
    pub fn resolve(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        token_id: String,
        amount: U128,
    ) -> U128 {
        let unused = match env::promise_result(0) {
            PromiseResult::Successful(bytes) => {
                near_sdk::serde_json::from_slice::<Vec<U128>>(&bytes)
                    .ok()
                    .filter(|v| v.len() == 1)
                    .map(|v| v[0].0)
                    .unwrap_or(amount.0)
            }
            PromiseResult::Failed => amount.0,
        };
        let balance = self.mt_balance_of(receiver_id.clone(), token_id.clone()).0;
        let refund = unused.min(amount.0).min(balance);
        if refund > 0 {
            self.move_balance(&receiver_id, &sender_id, &token_id, refund);
        }
        U128(amount.0 - refund)
    }
}

impl TestIntents {
    fn move_balance(
        &mut self,
        sender_id: &AccountId,
        receiver_id: &AccountId,
        token_id: &str,
        amount: u128,
    ) {
        assert!(amount > 0, "zero transfer");
        let from = (sender_id.clone(), token_id.to_owned());
        let to = (receiver_id.clone(), token_id.to_owned());
        let balance = self.balances.get_mut(&from).expect("no balance");
        *balance = balance.checked_sub(amount).expect("insufficient balance");
        *self.balances.entry(to).or_default() += amount;
    }
}
