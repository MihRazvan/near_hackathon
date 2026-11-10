import { randomBytes, createHash } from "node:crypto";
import { recoverMessageAddress } from "viem";
import { PublicKey } from "near-api-js";
import { assert, walletId, randomToken, sha256 } from "./core.mjs";

const u32 = (value) => {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value);
  return bytes;
};
const borshString = (value) => {
  const bytes = Buffer.from(value);
  return Buffer.concat([u32(bytes.length), bytes]);
};

export function nep413Digest({ message, nonce, recipient, callbackUrl }) {
  const bytes = Buffer.from(nonce, "base64");
  assert(
    bytes.length === 32 && bytes.toString("base64") === nonce,
    "INVALID_NONCE",
    "Canonical 32-byte nonce required",
    400,
  );
  assert(
    typeof message === "string" && typeof recipient === "string",
    "INVALID_MESSAGE",
    "Message and recipient required",
    400,
  );
  const payload = Buffer.concat([
    u32(2 ** 31 + 413),
    borshString(message),
    bytes,
    borshString(recipient),
    callbackUrl === undefined
      ? Buffer.from([0])
      : Buffer.concat([Buffer.from([1]), borshString(callbackUrl)]),
  ]);
  return createHash("sha256").update(payload).digest();
}

export class Auth {
  constructor(
    store,
    {
      origin,
      network = "mainnet",
      readKeys,
      now = Date.now,
      sessionMs = 8 * 60 * 60 * 1000,
    } = {},
  ) {
    this.store = store;
    this.origin = origin;
    this.network = network;
    this.readKeys = readKeys;
    this.now = now;
    this.sessionMs = sessionMs;
  }
  challenge(address) {
    const wallet = walletId(address),
      now = this.now();
    const recent = this.store.db
      .prepare(
        "SELECT count(*) AS count FROM challenges WHERE wallet=? AND consumed=0 AND expires_ms>?",
      )
      .get(wallet, now);
    assert(
      recent.count < 5,
      "CHALLENGE_LIMIT",
      "Too many pending sign-in challenges",
      429,
    );
    const id = randomToken(),
      nonce = randomBytes(32).toString("base64"),
      expiry = now + 300000;
    const message = `Sign in to Everywhere\nOrigin: ${this.origin}\nNetwork: ${this.network}\nWallet: ${wallet}\nNonce: ${nonce}\nIssued: ${new Date(now).toISOString()}\nExpires: ${new Date(expiry).toISOString()}\nThis signs you in to your account. It does not authorize token transfers, Intents or blockchain transactions.`;
    this.store.db
      .prepare(
        "INSERT INTO challenges(id,wallet,origin,nonce,message,expires_ms) VALUES(?,?,?,?,?,?)",
      )
      .run(id, wallet, this.origin, nonce, message, expiry);
    return {
      id,
      wallet,
      standard: wallet.startsWith("0x") ? "erc191" : "nep413",
      message,
      nonce,
      recipient: new URL(this.origin).host,
      expiresAt: new Date(expiry).toISOString(),
    };
  }
  async verify({
    challengeId,
    signature,
    publicKey,
    accountId,
    callbackUrl,
  } = {}) {
    assert(
      typeof challengeId === "string" && typeof signature === "string",
      "INVALID_SIGNATURE",
      "Challenge and signature required",
      400,
    );
    const challenge = this.store.db
      .prepare("SELECT * FROM challenges WHERE id=?")
      .get(challengeId);
    assert(
      challenge &&
        !challenge.consumed &&
        challenge.expires_ms > this.now() &&
        challenge.origin === this.origin,
      "EXPIRED_CHALLENGE",
      "Sign-in challenge expired or already used",
      401,
    );
    if (challenge.wallet.startsWith("0x")) {
      let recovered;
      try {
        recovered = await recoverMessageAddress({
          message: challenge.message,
          signature,
        });
      } catch {}
      assert(
        recovered?.toLowerCase() === challenge.wallet,
        "INVALID_SIGNATURE",
        "Signature did not match the selected wallet",
        401,
      );
    } else {
      assert(
        accountId === challenge.wallet &&
          typeof publicKey === "string" &&
          publicKey.startsWith("ed25519:"),
        "INVALID_SIGNATURE",
        "NEAR account and Ed25519 public key required",
        401,
      );
      assert(
        callbackUrl === undefined ||
          callbackUrl === this.origin + "/auth/callback",
        "INVALID_CALLBACK",
        "Unexpected NEAR callback",
        400,
      );
      let key,
        valid = false;
      try {
        key = PublicKey.fromString(publicKey);
        const bytes = Buffer.from(signature, "base64");
        valid =
          bytes.length === 64 &&
          bytes.toString("base64") === signature &&
          key.verify(
            nep413Digest({
              message: challenge.message,
              nonce: challenge.nonce,
              recipient: new URL(this.origin).host,
              callbackUrl,
            }),
            bytes,
          );
      } catch {}
      assert(
        valid,
        "INVALID_SIGNATURE",
        "NEAR message signature did not verify",
        401,
      );
      assert(
        typeof this.readKeys === "function",
        "KEY_VERIFICATION_UNAVAILABLE",
        "NEAR key ownership verifier unavailable",
        503,
      );
      const keys = await this.readKeys(challenge.wallet);
      assert(
        keys.some(
          (entry) =>
            entry.public_key === publicKey &&
            entry.access_key?.permission === "FullAccess",
        ),
        "KEY_NOT_OWNED",
        "NEAR signature key is not a current full-access account key",
        401,
      );
    }
    const token = randomToken();
    this.store.transaction(() => {
      const claimed = this.store.db
        .prepare(
          "UPDATE challenges SET consumed=1 WHERE id=? AND consumed=0 AND expires_ms>?",
        )
        .run(challengeId, this.now());
      assert(
        claimed.changes === 1,
        "EXPIRED_CHALLENGE",
        "Challenge already used or expired",
        401,
      );
      this.store.db
        .prepare(
          "INSERT INTO sessions(token_hash,wallet,expires_ms) VALUES(?,?,?)",
        )
        .run(sha256(token), challenge.wallet, this.now() + this.sessionMs);
      if (!this.store.get("profile", challenge.wallet))
        this.store.insert("profile", challenge.wallet, challenge.wallet, {
          displayName: challenge.wallet,
          notifications: true,
        });
      this.store.event("session.created", challenge.wallet, challenge.wallet, {
        standard: challenge.wallet.startsWith("0x") ? "erc191" : "nep413",
      });
    });
    return {
      token,
      wallet: challenge.wallet,
      expiresAt: new Date(this.now() + this.sessionMs).toISOString(),
    };
  }
  session(token) {
    assert(typeof token==='string'&&token.length>=32,'AUTH_REQUIRED','Wallet sign-in required',401);
    const session=this.store.db.prepare('SELECT wallet,expires_ms FROM sessions WHERE token_hash=?').get(sha256(token));
    assert(session&&session.expires_ms>this.now(),'AUTH_REQUIRED','Session expired or signed out',401);
    return {wallet:session.wallet,expiresAt:new Date(session.expires_ms).toISOString()};
  }
  authenticate(token) {return this.session(token).wallet;}
  revoke(token) {
    this.store.db
      .prepare("DELETE FROM sessions WHERE token_hash=?")
      .run(sha256(token));
  }
}
