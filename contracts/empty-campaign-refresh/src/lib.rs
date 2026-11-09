//! A temporary, self-call-only helper. It has no constructor or stored state.
//! Deployment must be bundled with refresh and restoration of the exact reviewed
//! original marketplace Wasm. The raw STATE hash is the approval commitment.
use near_sdk::{env, json_types::U64, require, AccountId};

const HOUR: u64 = 3_600_000_000_000;
const REFUND_INTERVAL: u64 = 900_000_000_000;

#[derive(near_sdk::serde::Deserialize)]
#[serde(crate = "near_sdk::serde", deny_unknown_fields)]
pub struct Args {
    expected_state_sha256: String,
    expected_old_cutoff_ns: U64,
    expected_old_refund_end_ns: U64,
    new_cutoff_ns: U64,
    new_refund_end_ns: U64,
}

/// Deliberately bypasses near-sdk contract-state deserialization: this temporary
/// Wasm must preserve every original Borsh field it does not understand.
#[no_mangle]
pub extern "C" fn refresh() {
    env::setup_panic_hook();
    require!(env::predecessor_account_id() == env::current_account_id(), "self call only");
    require!(env::attached_deposit().as_yoctonear() == 0, "no attached funds");
    let input = env::input().expect("arguments required");
    require!(input.len() <= 1024, "arguments too long");
    let args: Args = near_sdk::serde_json::from_slice(&input).expect("invalid refresh arguments");
    let original = env::storage_read(b"STATE").expect("existing marketplace STATE required");
    let digest: String = env::sha256(&original).iter().map(|b| format!("{b:02x}")).collect();
    require!(args.expected_state_sha256.len() == 64 && digest == args.expected_state_sha256, "approved STATE hash mismatch");
    let offset = timestamp_offset(&original);
    let old_cutoff = u64::from_le_bytes(original[offset..offset + 8].try_into().unwrap());
    let old_refund = u64::from_le_bytes(original[offset + 8..offset + 16].try_into().unwrap());
    require!(old_cutoff == args.expected_old_cutoff_ns.0 && old_refund == args.expected_old_refund_end_ns.0, "old campaign timestamps mismatch");
    let now = env::block_timestamp();
    require!(args.new_cutoff_ns.0 >= now.checked_add(HOUR).expect("clock overflow")
        && args.new_cutoff_ns.0 <= now.checked_add(3 * HOUR).expect("clock overflow"), "new cutoff must be one to three hours ahead");
    require!(args.new_refund_end_ns.0 == args.new_cutoff_ns.0.checked_add(REFUND_INTERVAL).expect("refund overflow"), "refund interval must be exactly fifteen minutes");
    let mut updated = original;
    updated[offset..offset + 8].copy_from_slice(&args.new_cutoff_ns.0.to_le_bytes());
    updated[offset + 8..offset + 16].copy_from_slice(&args.new_refund_end_ns.0.to_le_bytes());
    env::storage_write(b"STATE", &updated);
    env::value_return(b"true");
}

/// Exact prefix of the pinned marketplace artifact: four AccountId strings,
/// Intents settlement enum byte, then two consecutive little-endian u64 values.
fn timestamp_offset(state: &[u8]) -> usize {
    let mut offset: usize = 0;
    for _ in 0..4 {
        let end = offset.checked_add(4).expect("prefix overflow");
        let length = u32::from_le_bytes(state.get(offset..end).expect("truncated account length").try_into().unwrap()) as usize;
        require!((2..=64).contains(&length), "invalid account length");
        offset = end;
        let end = offset.checked_add(length).expect("prefix overflow");
        let text = std::str::from_utf8(state.get(offset..end).expect("truncated account")).expect("invalid account UTF8");
        let _: AccountId = text.parse().expect("invalid account ID");
        offset = end;
    }
    require!(state.get(offset) == Some(&1), "Intents settlement required");
    offset += 1;
    require!(state.len() >= offset + 16, "missing timestamps");
    offset
}

#[cfg(test)]
mod tests {
    use super::*;
    fn state() -> Vec<u8> {
        let mut bytes = Vec::new();
        for account in ["seller.near", "market.near", "usdc.near", "intents.near"] {
            bytes.extend_from_slice(&(account.len() as u32).to_le_bytes());bytes.extend_from_slice(account.as_bytes());
        }
        bytes.push(1);bytes.extend_from_slice(&100u64.to_le_bytes());bytes.extend_from_slice(&200u64.to_le_bytes());bytes.extend_from_slice(b"preserve all remaining bytes");bytes
    }
    #[test]
    fn offsets_exactly_two_u64_fields() {
        let bytes=state();let offset=timestamp_offset(&bytes);
        assert_eq!(u64::from_le_bytes(bytes[offset..offset+8].try_into().unwrap()),100);
        assert_eq!(u64::from_le_bytes(bytes[offset+8..offset+16].try_into().unwrap()),200);
        assert_eq!(&bytes[offset+16..],b"preserve all remaining bytes");
    }
    #[test]
    #[should_panic(expected="Intents settlement required")]
    fn other_settlement_layout_rejected() {near_sdk::testing_env!(near_sdk::test_utils::VMContextBuilder::new().build());let mut bytes=state();let offset=timestamp_offset(&bytes);bytes[offset-1]=0;timestamp_offset(&bytes);}
}
