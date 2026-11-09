#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { createSignedBundle } from './signer.mjs';

// This CLI has no RPC capability. All output is signed public test data.
globalThis.fetch = async () => { throw new Error('Network access is disabled in this local signing proof'); };

try {
  const { values } = parseArgs({ options: {
    intents: { type: 'string' },
    storefront: { type: 'string' },
    token: { type: 'string' },
    invoice: { type: 'string' },
    amount: { type: 'string' },
    round: { type: 'string' },
    deadline: { type: 'string' },
    salt: { type: 'string' },
    'min-gas': { type: 'string' },
    help: { type: 'boolean' },
  } });
  if (values.help) {
    process.stdout.write('Local signing only: --intents ACCOUNT --storefront ACCOUNT --token nep141:FT --invoice ID --amount INTEGER [--round INTEGER] [--deadline ISO] [--salt 8HEX] [--min-gas INTEGER]\n');
  } else {
    const bundle = await createSignedBundle({ ...values, minGas: values['min-gas'] });
    process.stdout.write(`${JSON.stringify(bundle)}\n`);
  }
} catch (error) {
  process.stderr.write(`Local signing failed: ${error.message}\n`);
  process.exitCode = 1;
}
