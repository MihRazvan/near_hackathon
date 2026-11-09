use near_sdk::{
    env, ext_contract,
    json_types::{Base64VecU8, U128, U64},
    near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseError,
};
use std::collections::BTreeMap;

const FACTORY_RESERVE: u128 = 10_000_000_000_000_000_000_000; // 0.01 NEAR per record
const MAX_STOREFRONTS: usize = 32;

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Status {
    Creating,
    Registering,
    Verifying,
    Ready,
    CreationFailed,
    RegistrationFailed,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct Storefront {
    pub account_id: AccountId,
    pub seller_id: AccountId,
    pub status: Status,
}

#[near(serializers = [json])]
pub struct Config {
    pub marketplace_code_hash: Base64VecU8,
    pub ft_contract_id: AccountId,
    pub intents_contract_id: AccountId,
    pub arbiter_id: AccountId,
    pub child_funding: U128,
    pub ft_storage_deposit: U128,
    pub creation_deposit: U128,
}

#[ext_contract(ext_self)]
#[allow(dead_code)]
trait Callbacks {
    fn on_created(&mut self, name: String);
    fn on_registered(&mut self, name: String);
    fn on_verified(&mut self, name: String);
}

/// Bounded native-FT storefront factory. Global code is referenced by immutable
/// hash, never a publisher account. No key creation or arbitrary child calls.
#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Factory {
    code_hash: [u8; 32],
    ft_contract_id: AccountId,
    intents_contract_id: AccountId,
    arbiter_id: AccountId,
    child_funding: u128,
    ft_storage_deposit: u128,
    storefronts: BTreeMap<String, Storefront>,
}

#[near]
impl Factory {
    #[init]
    pub fn new(
        marketplace_code_hash: Base64VecU8,
        ft_contract_id: AccountId,
        intents_contract_id: AccountId,
        arbiter_id: AccountId,
        child_funding: U128,
        ft_storage_deposit: U128,
    ) -> Self {
        require!(marketplace_code_hash.0.len() == 32, "hash must be 32 bytes");
        require!(
            child_funding.0 >= NearToken::from_millinear(100).as_yoctonear(),
            "child funding at least 0.1 NEAR"
        );
        require!(ft_storage_deposit.0 > 0, "storage deposit must be positive");
        child_funding
            .0
            .checked_add(ft_storage_deposit.0)
            .and_then(|v| v.checked_add(FACTORY_RESERVE))
            .expect("deposit overflow");
        Self {
            code_hash: marketplace_code_hash.0.try_into().unwrap(),
            ft_contract_id,
            intents_contract_id,
            arbiter_id,
            child_funding: child_funding.0,
            ft_storage_deposit: ft_storage_deposit.0,
            storefronts: BTreeMap::new(),
        }
    }

    pub fn get_config(&self) -> Config {
        Config {
            marketplace_code_hash: Base64VecU8(self.code_hash.to_vec()),
            ft_contract_id: self.ft_contract_id.clone(),
            intents_contract_id: self.intents_contract_id.clone(),
            arbiter_id: self.arbiter_id.clone(),
            child_funding: U128(self.child_funding),
            ft_storage_deposit: U128(self.ft_storage_deposit),
            creation_deposit: U128(self.creation_deposit()),
        }
    }

    pub fn get_storefront(&self, name: String) -> Option<Storefront> {
        self.storefronts.get(&name).cloned()
    }

    #[payable]
    pub fn create_storefront(
        &mut self,
        name: String,
        initial_price_cents: U128,
        cutoff_ns: U64,
        refund_end_ns: U64,
    ) -> AccountId {
        require!(valid_name(&name), "invalid child name");
        require!(
            !self.storefronts.contains_key(&name),
            "name already reserved"
        );
        require!(
            self.storefronts.len() < MAX_STOREFRONTS,
            "proof factory capacity reached"
        );
        require!(
            env::attached_deposit().as_yoctonear() == self.creation_deposit(),
            "exact creation deposit required"
        );
        require!(
            initial_price_cents.0 > 0 && initial_price_cents.0 <= u128::MAX / 30_000,
            "invalid initial price"
        );
        require!(
            cutoff_ns.0 > env::block_timestamp() && refund_end_ns.0 >= cutoff_ns.0,
            "invalid campaign dates"
        );
        let child: AccountId = format!("{name}.{}", env::current_account_id())
            .parse()
            .expect("child account too long");
        let seller = env::predecessor_account_id();
        self.storefronts.insert(
            name.clone(),
            Storefront {
                account_id: child.clone(),
                seller_id: seller.clone(),
                status: Status::Creating,
            },
        );
        let args = near_sdk::serde_json::to_vec(&near_sdk::serde_json::json!({
            "seller_id":seller,"arbiter_id":self.arbiter_id,"ft_contract_id":self.ft_contract_id,
            "intents_contract_id":self.intents_contract_id,"settlement":"native",
            "initial_price_cents":initial_price_cents,"cutoff_ns":cutoff_ns,"refund_end_ns":refund_end_ns
        })).expect("serialize");
        Promise::new(child.clone())
            .create_account()
            .transfer(NearToken::from_yoctonear(self.child_funding))
            .use_global_contract(self.code_hash)
            .function_call(
                "new",
                args,
                NearToken::from_yoctonear(0),
                Gas::from_tgas(40),
            )
            .then(
                ext_self::ext(env::current_account_id())
                    .with_static_gas(Gas::from_tgas(110))
                    .on_created(name),
            )
            .detach();
        child
    }

    /// Only a known failed registration can be retried. Unknown callbacks remain
    /// pending; elapsed time is never interpreted as proof of failure.
    #[payable]
    pub fn retry_registration(&mut self, name: String) {
        let row = self.storefronts.get(&name).expect("unknown storefront");
        require!(
            env::predecessor_account_id() == row.seller_id,
            "seller only"
        );
        require!(
            row.status == Status::RegistrationFailed,
            "registration not known failed"
        );
        require!(
            env::attached_deposit().as_yoctonear() == self.ft_storage_deposit,
            "exact storage deposit required"
        );
        self.register(name);
    }

    #[private]
    pub fn on_created(&mut self, name: String) {
        require!(
            self.storefronts
                .get(&name)
                .expect("unknown storefront")
                .status
                == Status::Creating,
            "unexpected creation callback"
        );
        if result_succeeded() {
            self.register(name);
        } else {
            self.storefronts.get_mut(&name).unwrap().status = Status::CreationFailed;
        }
    }

    #[private]
    pub fn on_registered(&mut self, name: String) {
        let row = self.storefronts.get_mut(&name).expect("unknown storefront");
        require!(
            row.status == Status::Registering,
            "unexpected registration callback"
        );
        if !result_succeeded() {
            row.status = Status::RegistrationFailed;
            return;
        }
        row.status = Status::Verifying;
        let account = row.account_id.clone();
        Promise::new(self.ft_contract_id.clone())
            .function_call(
                "storage_balance_of",
                near_sdk::serde_json::to_vec(&near_sdk::serde_json::json!({"account_id":account}))
                    .unwrap(),
                NearToken::from_yoctonear(0),
                Gas::from_tgas(5),
            )
            .then(
                ext_self::ext(env::current_account_id())
                    .with_static_gas(Gas::from_tgas(10))
                    .on_verified(name),
            )
            .detach();
    }

    #[private]
    pub fn on_verified(&mut self, name: String) {
        let row = self.storefronts.get_mut(&name).expect("unknown storefront");
        require!(
            row.status == Status::Verifying,
            "unexpected verification callback"
        );
        require!(env::promise_results_count() == 1, "one result required");
        // A valid positive storage balance on the exact allowlisted token is
        // required. Null, malformed, oversized, and failed results stay unready.
        let ready = env::promise_result_checked(0, 1024)
            .ok()
            .and_then(|bytes| {
                near_sdk::serde_json::from_slice::<near_sdk::serde_json::Value>(&bytes).ok()
            })
            .and_then(|v| {
                v.get("total")
                    .and_then(|x| x.as_str())
                    .and_then(|x| x.parse::<u128>().ok())
            })
            .is_some_and(|total| total > 0);
        row.status = if ready {
            Status::Ready
        } else {
            Status::RegistrationFailed
        };
        env::log_str(&format!(
            "EVENT_JSON:{}",
            near_sdk::serde_json::json!({"standard":"pitboard_factory","version":"1.0.0","event":"readiness","data":[{"name":name,"ready":ready}]})
        ));
    }
}

impl Factory {
    fn creation_deposit(&self) -> u128 {
        self.child_funding + self.ft_storage_deposit + FACTORY_RESERVE
    }
    fn register(&mut self, name: String) {
        let row = self.storefronts.get_mut(&name).expect("unknown storefront");
        row.status = Status::Registering;
        let account = row.account_id.clone();
        Promise::new(self.ft_contract_id.clone())
            .function_call(
                "storage_deposit",
                near_sdk::serde_json::to_vec(
                    &near_sdk::serde_json::json!({"account_id":account,"registration_only":true}),
                )
                .unwrap(),
                NearToken::from_yoctonear(self.ft_storage_deposit),
                Gas::from_tgas(20),
            )
            .then(
                ext_self::ext(env::current_account_id())
                    .with_static_gas(Gas::from_tgas(45))
                    .on_registered(name),
            )
            .detach();
    }
}

fn result_succeeded() -> bool {
    require!(env::promise_results_count() == 1, "one result required");
    !matches!(
        env::promise_result_checked(0, 1024),
        Err(PromiseError::Failed)
    )
}

fn valid_name(name: &str) -> bool {
    (2..=24).contains(&name.len())
        && name
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit())
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::{test_utils::VMContextBuilder, testing_env, PromiseResult};
    fn aid(s: &str) -> AccountId {
        s.parse().unwrap()
    }
    fn setup(caller: &str, deposit: u128, result: Option<PromiseResult>) {
        let c = VMContextBuilder::new()
            .current_account_id(aid("factory.test.near"))
            .predecessor_account_id(aid(caller))
            .attached_deposit(NearToken::from_yoctonear(deposit))
            .block_timestamp(1)
            .build();
        testing_env!(
            c,
            near_sdk::test_vm_config(),
            near_sdk::RuntimeFeesConfig::test(),
            std::collections::HashMap::default(),
            result.into_iter().collect()
        );
    }
    fn factory() -> Factory {
        setup("deployer.test.near", 0, None);
        Factory::new(
            Base64VecU8(vec![7; 32]),
            aid("usdc.test.near"),
            aid("intents.test.near"),
            aid("arbiter.test.near"),
            U128(NearToken::from_near(1).as_yoctonear()),
            U128(1_250_000_000_000_000_000_000),
        )
    }
    #[test]
    fn child_name_is_single_safe_component() {
        for good in ["car1", "bike", "12"] {
            assert!(valid_name(good));
        }
        for bad in ["a", "a.b", "CAR", "-car", "car-bike", "", "car_bike"] {
            assert!(!valid_name(bad));
        }
    }
    #[test]
    fn creation_binds_predecessor_and_has_no_key_action() {
        let mut f = factory();
        setup("seller.test.near", f.creation_deposit(), None);
        f.create_storefront("car1".into(), U128(100), U64(1_000), U64(2_000));
        let row = f.get_storefront("car1".into()).unwrap();
        assert_eq!(row.seller_id, aid("seller.test.near"));
        assert_eq!(row.status, Status::Creating);
        let receipts = near_sdk::test_utils::get_created_receipts();
        assert!(receipts[0].actions.iter().all(|a| !matches!(
            a,
            near_sdk::mock::MockAction::AddKeyWithFullAccess { .. }
                | near_sdk::mock::MockAction::AddKeyWithFunctionCall { .. }
        )));
    }
    #[test]
    fn failed_registration_and_missing_balance_never_ready() {
        let mut f = factory();
        setup("seller.test.near", f.creation_deposit(), None);
        f.create_storefront("car1".into(), U128(100), U64(1_000), U64(2_000));
        setup(
            "factory.test.near",
            0,
            Some(PromiseResult::Successful(vec![])),
        );
        f.on_created("car1".into());
        setup("factory.test.near", 0, Some(PromiseResult::Failed));
        f.on_registered("car1".into());
        assert_eq!(
            f.get_storefront("car1".into()).unwrap().status,
            Status::RegistrationFailed
        );
        setup("seller.test.near", f.ft_storage_deposit, None);
        f.retry_registration("car1".into());
        setup(
            "factory.test.near",
            0,
            Some(PromiseResult::Successful(vec![])),
        );
        f.on_registered("car1".into());
        setup(
            "factory.test.near",
            0,
            Some(PromiseResult::Successful(b"null".to_vec())),
        );
        f.on_verified("car1".into());
        assert_eq!(
            f.get_storefront("car1".into()).unwrap().status,
            Status::RegistrationFailed
        );
    }
    #[test]
    fn only_positive_confirmed_balance_sets_ready() {
        let mut f = factory();
        setup("seller.test.near", f.creation_deposit(), None);
        f.create_storefront("car1".into(), U128(100), U64(1_000), U64(2_000));
        setup(
            "factory.test.near",
            0,
            Some(PromiseResult::Successful(vec![])),
        );
        f.on_created("car1".into());
        setup(
            "factory.test.near",
            0,
            Some(PromiseResult::Successful(vec![])),
        );
        f.on_registered("car1".into());
        assert_eq!(
            f.get_storefront("car1".into()).unwrap().status,
            Status::Verifying
        );
        setup(
            "factory.test.near",
            0,
            Some(PromiseResult::Successful(
                br#"{"total":"1250000000000000000000","available":"0"}"#.to_vec(),
            )),
        );
        f.on_verified("car1".into());
        assert_eq!(
            f.get_storefront("car1".into()).unwrap().status,
            Status::Ready
        );
    }
    #[test]
    #[should_panic(expected = "seller only")]
    fn unrelated_user_cannot_retry_registration() {
        let mut f = factory();
        setup("seller.test.near", f.creation_deposit(), None);
        f.create_storefront("car1".into(), U128(100), U64(1_000), U64(2_000));
        f.storefronts.get_mut("car1").unwrap().status = Status::RegistrationFailed;
        setup("intruder.test.near", f.ft_storage_deposit, None);
        f.retry_registration("car1".into());
    }
}
