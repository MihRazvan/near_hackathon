#!/usr/bin/env node
/** Offline canonical SDK signing for a LOCAL Sandbox harness. Never broadcasts.
 * Input JSON on stdin: {rpcUrl:"http://127.0.0.1:PORT", standard:"nep413"|"erc191",
 *   accountId:"buyer.test.near", verifyingContract:"intents.test.near", intents:[...],
 *   followupIntents?: [[...], [...]], deadline?: "ISO8601"}
 * Creates an ephemeral fresh signing key in memory; output has no private key.
 * Named NEAR signer: register output publicKey on the LOCAL verifier before executing.
 * EVM signer: deposit to output signerId on LOCAL verifier; implicit key needs no registration.
 */
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { KeyPair } from "near-api-js";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

// SDK 0.95.0's ESM build has an extensionless near-api-js import that Node rejects.
// Its published CJS entry resolves that same dependency correctly; no source patch.
const require = createRequire(import.meta.url);
const { createIntentSignerNearKeyPair, createIntentSignerViem } = require("@defuse-protocol/intents-sdk");

let input = "";
for await (const chunk of process.stdin) input += chunk;
const config = JSON.parse(input);
const local = new URL(config.rpcUrl);
if (!["127.0.0.1", "localhost", "[::1]"].includes(local.hostname)
    || !["http:", "https:"].includes(local.protocol)) throw Error("Local Sandbox rpcUrl required");
if (!config.verifyingContract || ["intents.near", "intents.testnet"].includes(config.verifyingContract))
  throw Error("A fresh LOCAL verifier account is required");
if (!Array.isArray(config.intents)) throw Error("intents array required");
const followupIntents = config.followupIntents ?? [];
if (!Array.isArray(followupIntents) || !followupIntents.every(Array.isArray))
  throw Error("followupIntents must be an array of intent arrays");
const standard = config.standard ?? "nep413";
let signer;
let publicKey;
if (standard === "nep413") {
  if (!config.accountId) throw Error("Named local accountId required for NEP413");
  const key = KeyPair.fromRandom("ed25519");
  publicKey = key.getPublicKey().toString();
  signer = createIntentSignerNearKeyPair({ signer: key, accountId: config.accountId });
} else if (standard === "erc191") {
  const account = privateKeyToAccount(generatePrivateKey());
  publicKey = account.address; // Public EVM identity, not a private key.
  signer = createIntentSignerViem({ signer: account });
} else throw Error("Only nep413 and erc191 supported by this proof");
const deadline = config.deadline ?? new Date(Date.now() + 60 * 60 * 1000).toISOString();
const usedNonces = new Set();
function freshNonce() {
  let bytes;
  let nonce;
  do {
    bytes = randomBytes(32);
    nonce = bytes.toString("base64");
    // Explicitly use the currently supported legacy nonce format, avoiding the
    // reserved versioned prefix; every batch gets a distinct nonce.
  } while (bytes.subarray(0, 4).equals(Buffer.from("5628f6c6", "hex")) || usedNonces.has(nonce));
  usedNonces.add(nonce);
  return nonce;
}
async function signBatch(intents) {
  return signer.signIntent({
    verifying_contract: config.verifyingContract,
    deadline,
    nonce: freshNonce(),
    intents,
  });
}
const signed = await signBatch(config.intents);
const followupExecuteArgs = [];
for (const intents of followupIntents)
  followupExecuteArgs.push({ signed: [await signBatch(intents)] });
const signerId = signed.standard === "nep413"
  ? JSON.parse(signed.payload.message).signer_id
  : JSON.parse(signed.payload).signer_id;
process.stdout.write(JSON.stringify({
  sdkVersion: "0.95.0", standard, rpcUrl: local.href, signerId, publicKey,
  ephemeralKeyOnly: true, networkRequestsMade: false, transactionsBroadcast: false,
  executeArgs: { signed: [signed] },
  followupExecuteArgs,
}, null, 2) + "\n");
