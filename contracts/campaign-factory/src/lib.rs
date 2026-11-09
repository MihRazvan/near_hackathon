use near_sdk::{env, ext_contract, json_types::{Base64VecU8, U128, U64}, near, require,
    AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseError};
use std::collections::BTreeMap;

const RESERVE: u128 = 10_000_000_000_000_000_000_000;

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Terms {
    pub sale_id: String, pub asset_id: String, pub spot_id: String,
    pub published_terms_sha256: Base64VecU8, pub takeover_enabled: bool,
    pub bidding_close_ns: U64, pub artwork_due_ns: U64, pub installation_due_ns: U64,
    pub service_start_ns: U64, pub service_end_ns: U64, pub review_end_ns: U64,
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::{test_utils::VMContextBuilder, testing_env};
    fn context(owner: &str) {
        let mut b = VMContextBuilder::new();
        b.current_account_id("factory.sandbox".parse().unwrap()).predecessor_account_id(owner.parse().unwrap())
            .block_timestamp(1).prepaid_gas(Gas::from_tgas(100))
            .attached_deposit(NearToken::from_millinear(510));
        testing_env!(b.build());
    }
    fn factory() -> Factory { Factory::new(Base64VecU8(vec![7;32]), "usdc.sandbox".parse().unwrap(),
        "verifier.sandbox".parse().unwrap(), "arbiter.sandbox".parse().unwrap(), U128(NearToken::from_millinear(500).as_yoctonear())) }
    fn terms() -> Terms { Terms { sale_id:"sale".into(), asset_id:"asset".into(), spot_id:"spot".into(),
        published_terms_sha256:Base64VecU8(vec![9;32]), takeover_enabled:true, bidding_close_ns:U64(10),artwork_due_ns:U64(20),
        installation_due_ns:U64(30),service_start_ns:U64(30),service_end_ns:U64(40),review_end_ns:U64(50) } }
    #[test]
    fn owner_binding_and_callback_status_are_independent() {
        context("seller.sandbox");let mut f=factory();
        assert_eq!(f.create_campaign("first".into(),U128(1),terms()).as_str(),"first.factory.sandbox");
        assert_eq!(f.get_creation("first".into()).unwrap().status,Status::Creating);
        f.on_created("first".into(),Ok(()));
        context("another.sandbox");f.create_campaign("second".into(),U128(2),terms());f.on_created("second".into(),Err(PromiseError::Failed));
        let a=f.get_creation("first".into()).unwrap();let b=f.get_creation("second".into()).unwrap();
        assert_eq!(a.seller_id.as_str(),"seller.sandbox");assert_eq!(a.status,Status::Ready);
        assert_eq!(b.seller_id.as_str(),"another.sandbox");assert_eq!(b.status,Status::Failed);
    }
    #[test] #[should_panic(expected="name reserved")]
    fn duplicate_creation_cannot_charge_twice() { context("seller.sandbox");let mut f=factory();f.create_campaign("first".into(),U128(1),terms());f.create_campaign("first".into(),U128(1),terms()); }
    #[test] #[should_panic(expected="seller and arbiter")]
    fn arbiter_cannot_publish_as_seller() { context("arbiter.sandbox");factory().create_campaign("first".into(),U128(1),terms()); }
    #[test] #[should_panic(expected="invalid schedule")]
    fn invalid_terms_never_reserve_a_child() { context("seller.sandbox");let mut t=terms();t.review_end_ns=U64(30);factory().create_campaign("first".into(),U128(1),t); }
}
#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Status { Creating, Ready, Failed }
#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Creation { pub account_id: AccountId, pub seller_id: AccountId, pub status: Status }
#[near(serializers = [json])]
pub struct Config {
    pub campaign_code_hash: Base64VecU8, pub ft_contract_id: AccountId,
    pub intents_contract_id: AccountId, pub arbiter_id: AccountId,
    pub child_funding: U128, pub creation_deposit: U128,
}
#[ext_contract(ext_self)]
#[allow(dead_code)]
trait Callbacks { fn on_created(&mut self, name: String); }

/// Immutable global code, authenticated seller, fixed settlement parties, no child keys.
/// Collateral remains in each keyless campaign; it is not a withdrawable user balance.
#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Factory {
    code_hash: [u8; 32], ft_contract_id: AccountId, intents_contract_id: AccountId,
    arbiter_id: AccountId, child_funding: u128, creations: BTreeMap<String, Creation>,
}
#[near]
impl Factory {
    #[init]
    pub fn new(campaign_code_hash: Base64VecU8, ft_contract_id: AccountId,
        intents_contract_id: AccountId, arbiter_id: AccountId, child_funding: U128) -> Self {
        require!(campaign_code_hash.0.len() == 32, "32 byte hash required");
        require!(child_funding.0 >= NearToken::from_millinear(100).as_yoctonear(), "child collateral too low");
        child_funding.0.checked_add(RESERVE).expect("deposit overflow");
        Self { code_hash: campaign_code_hash.0.try_into().unwrap(), ft_contract_id,
            intents_contract_id, arbiter_id, child_funding: child_funding.0, creations: BTreeMap::new() }
    }
    pub fn get_config(&self) -> Config {
        Config { campaign_code_hash: Base64VecU8(self.code_hash.to_vec()), ft_contract_id: self.ft_contract_id.clone(),
            intents_contract_id: self.intents_contract_id.clone(), arbiter_id: self.arbiter_id.clone(),
            child_funding: U128(self.child_funding), creation_deposit: U128(self.child_funding + RESERVE) }
    }
    pub fn get_creation(&self, name: String) -> Option<Creation> { self.creations.get(&name).cloned() }
    #[payable]
    pub fn create_campaign(&mut self, name: String, initial_price_cents: U128, terms: Terms) -> AccountId {
        require!(!name.is_empty() && name.len() <= 32 && name.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit()), "invalid name");
        require!(!self.creations.contains_key(&name), "name reserved; reconcile original creation");
        require!(self.creations.len() < 128, "factory capacity reached");
        require!(env::attached_deposit().as_yoctonear() == self.child_funding + RESERVE, "exact deposit required");
        require!(env::prepaid_gas() >= Gas::from_tgas(60), "at least 60 Tgas required");
        require!(initial_price_cents.0 > 0 && initial_price_cents.0 <= 1_000_000_000, "invalid price");
        let seller = env::predecessor_account_id();
        require!(seller != self.arbiter_id, "seller and arbiter must differ");
        for value in [&terms.sale_id, &terms.asset_id, &terms.spot_id] {
            require!(!value.is_empty() && value.len() <= 128, "invalid inventory reference");
        }
        require!(terms.published_terms_sha256.0.len() == 32, "invalid terms hash");
        require!(env::block_timestamp() < terms.bidding_close_ns.0 && terms.bidding_close_ns.0 < terms.artwork_due_ns.0
            && terms.artwork_due_ns.0 <= terms.installation_due_ns.0 && terms.installation_due_ns.0 <= terms.service_start_ns.0
            && terms.service_start_ns.0 < terms.service_end_ns.0 && terms.service_end_ns.0 < terms.review_end_ns.0, "invalid schedule");
        let child: AccountId = format!("{name}.{}", env::current_account_id()).parse().expect("child name too long");
        self.creations.insert(name.clone(), Creation { account_id: child.clone(), seller_id: seller.clone(), status: Status::Creating });
        let args = near_sdk::serde_json::to_vec(&near_sdk::serde_json::json!({
            "seller_id":seller, "arbiter_id":self.arbiter_id, "ft_contract_id":self.ft_contract_id,
            "intents_contract_id":self.intents_contract_id, "settlement":"intents", "initial_price_cents":initial_price_cents, "terms":terms
        })).unwrap();
        Promise::new(child.clone()).create_account().transfer(NearToken::from_yoctonear(self.child_funding))
            .use_global_contract(self.code_hash)
            .function_call("new_campaign", args, NearToken::from_yoctonear(0), Gas::from_tgas(20))
            .then(ext_self::ext(env::current_account_id()).with_static_gas(Gas::from_tgas(10)).on_created(name)).detach();
        child
    }
    #[private]
    pub fn on_created(&mut self, name: String, #[callback_result] result: Result<(), PromiseError>) {
        let creation = self.creations.get_mut(&name).expect("unknown creation");
        require!(creation.status == Status::Creating, "creation already resolved");
        creation.status = if result.is_ok() { Status::Ready } else { Status::Failed };
        // Creation is atomic: failure refunds the child transfer to this factory.
        // Keep the failed record permanently to prevent ambiguous retries.
        if result.is_err() { Promise::new(creation.seller_id.clone()).transfer(NearToken::from_yoctonear(self.child_funding)).detach(); }
    }
}
