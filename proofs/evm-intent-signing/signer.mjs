import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

// 0.95.0's ESM nonce module has an extensionless near-api-js subpath import.
// Its official CommonJS export resolves correctly without patching dependencies.
const { createIntentSignerViem, VersionedNonceBuilder } = createRequire(import.meta.url)('@defuse-protocol/intents-sdk');

const U128_MAX = (1n << 128n) - 1n;
const U64_MAX = (1n << 64n) - 1n;
const VERSIONED_PREFIX = Buffer.from([86, 40, 246, 198]);

function unsigned(value, name, max, minimum = 0n) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${name} must be a canonical unsigned decimal string`);
  }
  const integer = BigInt(value);
  if (integer < minimum || integer > max) throw new Error(`${name} is out of range`);
  return value;
}

function accountId(value, name) {
  if (typeof value !== 'string' || value.length < 2 || value.length > 64
      || !/^[a-z0-9]+(?:[-_.][a-z0-9]+)*$/.test(value)) {
    throw new Error(`${name} must be a valid lowercase NEAR account ID`);
  }
  return value;
}

export function validateOptions(options) {
  const intents = accountId(options.intents, 'intents');
  const storefront = accountId(options.storefront, 'storefront');
  if (typeof options.token !== 'string' || !options.token.startsWith('nep141:')) {
    throw new Error('token must identify the mock FT as nep141:<account>');
  }
  accountId(options.token.slice(7), 'token account');
  if (typeof options.invoice !== 'string' || Buffer.byteLength(options.invoice) < 1
      || Buffer.byteLength(options.invoice) > 64) throw new Error('invoice must contain 1–64 UTF-8 bytes');
  const amount = unsigned(options.amount, 'amount', U128_MAX, 1n);
  const round = unsigned(options.round ?? '0', 'round', U64_MAX);
  const minGas = unsigned(options.minGas ?? '100000000000000', 'minGas', U64_MAX, 1n);
  const deadline = new Date(options.deadline ?? Date.now() + 60 * 60 * 1000);
  if (!Number.isFinite(deadline.getTime()) || deadline.getTime() < 0) throw new Error('Invalid deadline');
  let salt;
  if (options.salt !== undefined) {
    if (!/^[a-fA-F0-9]{8}$/.test(options.salt)) throw new Error('salt must contain exactly four hex bytes');
    salt = Buffer.from(options.salt, 'hex');
  }
  return { intents, storefront, token: options.token, invoice: options.invoice, amount, round, minGas, deadline, salt };
}

function nonce(deadline, salt) {
  if (salt) return VersionedNonceBuilder.encodeNonce(salt, deadline);
  // The downloaded verifier accepts legacy random 32-byte nonces as well as
  // versioned nonces. Avoid accidentally generating the versioned magic prefix.
  let bytes;
  do { bytes = randomBytes(32); } while (bytes.subarray(0, 4).equals(VERSIONED_PREFIX));
  return bytes.toString('base64');
}

/** Generates an in-memory identity and signed public requests; never returns its key. */
export async function createSignedBundle(options) {
  const config = validateOptions(options);
  const account = privateKeyToAccount(generatePrivateKey());
  const signer = createIntentSignerViem({ signer: account });
  const signerId = account.address.toLowerCase();
  const notification = JSON.stringify({ invoice_id: config.invoice, expected_round: config.round });
  const intent = {
    intent: 'transfer',
    receiver_id: config.storefront,
    tokens: { [config.token]: config.amount },
    msg: notification,
    min_gas: config.minGas,
  };
  const payload = (deadline, verifyingContract = config.intents) => ({
    signer_id: signerId,
    verifying_contract: verifyingContract,
    deadline: deadline.toISOString(),
    nonce: nonce(deadline, config.salt),
    intents: [intent],
  });
  const valid = await signer.signIntent(payload(config.deadline));
  const expired = await signer.signIntent(payload(new Date(0)));
  const wrongVerifierId = config.intents === 'wrong-verifier.near' ? 'other-verifier.near' : 'wrong-verifier.near';
  const wrongVerifier = await signer.signIntent(payload(config.deadline, wrongVerifierId));
  // Keep the genuine signature while changing the signed amount, rather than
  // creating a fresh valid signature for the changed request.
  const changed = JSON.parse(valid.payload);
  changed.intents[0].tokens[config.token] = (BigInt(config.amount) === U128_MAX ? 1n : BigInt(config.amount) + 1n).toString();
  const tampered = { ...valid, payload: JSON.stringify(changed) };

  return {
    schema_version: 1,
    local_only: true,
    signer_id: signerId,
    evm_address: account.address,
    nonce_kind: config.salt ? 'versioned_salted' : 'legacy_random_32_bytes',
    notification,
    valid: { signed: [valid] },
    replay: { signed: [valid] },
    expired: { signed: [expired] },
    tampered: { signed: [tampered] },
    wrong_verifier: { signed: [wrongVerifier] },
  };
}
