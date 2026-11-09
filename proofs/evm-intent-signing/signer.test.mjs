import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import test from 'node:test';
import { base58 } from '@scure/base';
import { recoverMessageAddress, toHex } from 'viem';
import { createSignedBundle, validateOptions } from './signer.mjs';

const { VersionedNonceBuilder } = createRequire(import.meta.url)('@defuse-protocol/intents-sdk');

const options = {
  intents: 'local-intents.test.near',
  storefront: 'storefront.test.near',
  token: 'nep141:mock-usdc.test.near',
  invoice: 'evm-first-purchase',
  amount: '100000000',
  round: '0',
  deadline: '2027-01-01T00:00:00.000Z',
};

async function recover(signed) {
  assert.equal(signed.standard, 'erc191');
  const bytes = base58.decode(signed.signature.replace(/^secp256k1:/, ''));
  assert.equal(bytes.length, 65);
  assert.ok(bytes[64] === 0 || bytes[64] === 1);
  // Viem accepts the recovery-byte form produced by the SDK.
  return (await recoverMessageAddress({ message: signed.payload, signature: toHex(bytes) })).toLowerCase();
}

test('official ERC191 signer binds identity, amount, destination, invoice and round without RPC', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Unexpected network request'); };
  try {
    const result = await createSignedBundle(options);
    const signed = result.valid.signed[0];
    assert.equal(await recover(signed), result.signer_id);
    const payload = JSON.parse(signed.payload);
    assert.equal(payload.signer_id, result.signer_id);
    assert.equal(payload.verifying_contract, options.intents);
    assert.equal(payload.deadline, options.deadline);
    assert.equal(Buffer.from(payload.nonce, 'base64').length, 32);
    assert.deepEqual(payload.intents[0], {
      intent: 'transfer', receiver_id: options.storefront,
      tokens: { [options.token]: options.amount },
      msg: JSON.stringify({ invoice_id: options.invoice, expected_round: '0' }),
      min_gas: '100000000000000',
    });
    assert.deepEqual(result.replay, result.valid);
    assert.equal(await recover(result.expired.signed[0]), result.signer_id);
    assert.equal(await recover(result.wrong_verifier.signed[0]), result.signer_id);
    assert.notEqual(await recover(result.tampered.signed[0]), result.signer_id);
    assert.equal(JSON.parse(result.expired.signed[0].payload).deadline, '1970-01-01T00:00:00.000Z');
  } finally { globalThis.fetch = originalFetch; }
});

test('versioned SDK nonce binds supplied four-byte salt and deadline', async () => {
  const result = await createSignedBundle({ ...options, salt: '12345678' });
  assert.equal(result.nonce_kind, 'versioned_salted');
  const signed = result.valid.signed[0];
  assert.equal(await recover(signed), result.signer_id);
  const decoded = VersionedNonceBuilder.decodeNonce(JSON.parse(signed.payload).nonce);
  assert.deepEqual(decoded.value.salt, [0x12, 0x34, 0x56, 0x78]);
  assert.equal(decoded.value.inner.deadline, BigInt(Date.parse(options.deadline)) * 1000000n);
});

test('each run creates an independent disposable public identity', async () => {
  const a = await createSignedBundle(options);
  const b = await createSignedBundle(options);
  assert.notEqual(a.signer_id, b.signer_id);
  assert.notEqual(JSON.parse(a.valid.signed[0].payload).nonce, JSON.parse(b.valid.signed[0].payload).nonce);
  assert.deepEqual(Object.keys(a).sort(), ['schema_version', 'local_only', 'signer_id', 'evm_address', 'nonce_kind', 'notification', 'valid', 'replay', 'expired', 'tampered', 'wrong_verifier'].sort());
});

test('CLI emits only the public bundle and rejects malformed commercial inputs', () => {
  const args = ['--intents', options.intents, '--storefront', options.storefront, '--token', options.token,
    '--invoice', options.invoice, '--amount', options.amount, '--round', options.round, '--deadline', options.deadline];
  const output = execFileSync(process.execPath, [new URL('./sign.mjs', import.meta.url).pathname, ...args], { encoding: 'utf8' });
  const bundle = JSON.parse(output);
  assert.match(bundle.signer_id, /^0x[a-f0-9]{40}$/);
  assert.doesNotMatch(output, /private.?key|mnemonic|secret/i);
  assert.throws(() => validateOptions({ ...options, amount: '1.5' }), /unsigned/);
  assert.throws(() => validateOptions({ ...options, amount: '0' }), /range/);
  assert.throws(() => validateOptions({ ...options, round: '-1' }), /unsigned/);
  assert.throws(() => validateOptions({ ...options, amount: (1n << 128n).toString() }), /range/);
  assert.throws(() => validateOptions({ ...options, token: 'mock-usdc.test.near' }), /nep141/);
  assert.throws(() => validateOptions({ ...options, salt: '1234' }), /four hex bytes/);
  assert.throws(() => validateOptions({ ...options, invoice: 'x'.repeat(65) }), /UTF-8/);
});
