import test from "node:test";
import assert from "node:assert/strict";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { KeyPair } from "near-api-js";
import { Auth, nep413Digest } from "../src/auth.mjs";
import { Store } from "../src/store.mjs";

const origin = "http://127.0.0.1:4318";
test("EVM sign-in binds the exact wallet, origin, expiry and one-use challenge without a transfer", async () => {
  const store = new Store();
  let now = 1_000_000;
  const auth = new Auth(store, { origin, now: () => now });
  const a = privateKeyToAccount(generatePrivateKey()),
    b = privateKeyToAccount(generatePrivateKey());
  const challenge = auth.challenge(a.address);
  await assert.rejects(
    auth.verify({
      challengeId: challenge.id,
      signature: await b.signMessage({ message: challenge.message }),
    }),
  );
  const signature = await a.signMessage({ message: challenge.message });
  const [first, second] = await Promise.allSettled([
    auth.verify({ challengeId: challenge.id, signature }),
    auth.verify({ challengeId: challenge.id, signature }),
  ]);
  assert.equal(
    [first, second].filter((x) => x.status === "fulfilled").length,
    1,
  );
  const session = [first, second].find((x) => x.status === "fulfilled").value;
  assert.equal(auth.authenticate(session.token), a.address.toLowerCase());
  assert.equal(
    store.db.prepare("SELECT count(*) AS n FROM operations").get().n,
    0,
  );
  assert.equal(
    JSON.stringify(store.db.prepare("SELECT * FROM sessions").all()).includes(
      session.token,
    ),
    false,
  );
  auth.revoke(session.token);
  assert.throws(() => auth.authenticate(session.token));
  const expired = auth.challenge(a.address);
  now += 300001;
  await assert.rejects(
    auth.verify({
      challengeId: expired.id,
      signature: await a.signMessage({ message: expired.message }),
    }),
  );
  store.close();
});

test("NEP-413 requires exact nonce/recipient and current FullAccess ownership", async () => {
  const store = new Store();
  const key = KeyPair.fromRandom("ed25519"),
    publicKey = key.getPublicKey().toString();
  let owned = true;
  const auth = new Auth(store, {
    origin,
    readKeys: async () => [
      {
        public_key: publicKey,
        access_key: { permission: owned ? "FullAccess" : { FunctionCall: {} } },
      },
    ],
  });
  const challenge = auth.challenge("owner.test.near");
  const signature = Buffer.from(
    key.sign(nep413Digest(challenge)).signature,
  ).toString("base64");
  owned = false;
  await assert.rejects(
    auth.verify({
      challengeId: challenge.id,
      signature,
      publicKey,
      accountId: "owner.test.near",
    }),
  );
  owned = true;
  const bad = Buffer.from(
    key.sign(nep413Digest({ ...challenge, recipient: "attacker.example" }))
      .signature,
  ).toString("base64");
  await assert.rejects(
    auth.verify({
      challengeId: challenge.id,
      signature: bad,
      publicKey,
      accountId: "owner.test.near",
    }),
  );
  const session = await auth.verify({
    challengeId: challenge.id,
    signature,
    publicKey,
    accountId: "owner.test.near",
  });
  assert.equal(auth.authenticate(session.token), "owner.test.near");
  store.close();
});

test("an issued challenge cannot be verified by a differently configured origin", async () => {
  const store = new Store();
  const wallet = privateKeyToAccount(generatePrivateKey());
  const challenge = new Auth(store, { origin }).challenge(wallet.address);
  const other = new Auth(store, { origin: "http://127.0.0.1:9999" });
  await assert.rejects(
    other.verify({
      challengeId: challenge.id,
      signature: await wallet.signMessage({ message: challenge.message }),
    }),
  );
  store.close();
});
