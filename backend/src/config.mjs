import { readFile, lstat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { assert, units, walletId } from "./core.mjs";

export const ROOT = fileURLToPath(new URL("../..", import.meta.url));
export const MAINNET = Object.freeze({
  chainId: 8453,
  intentsId: "intents.near",
  intentsCodeHash: "BtA1BEFNS619KkvXFsgcpQ21Tb5yMm32aaUkn7xNothk",
  usdcCodeHash: "DVJx7F3dHEHJYwpYPwXHu8K9Uo7h4kXFcALucY5oNX8q",
  nearUsdc: "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1",
  baseUsdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  baseAsset: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near",
  nearAsset:
    "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1",
  oneClick: "https://1click.chaindefuser.com/v0",
});

export function parseEnv(contents) {
  const result = {};
  for (const line of contents.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    assert(
      match && !Object.hasOwn(result, match[1]),
      "INVALID_ENV",
      "Invalid or duplicate environment setting",
    );
    let value = match[2].trim();
    if (value.startsWith('"') || value.startsWith("'")) {
      assert(
        value.endsWith(value[0]) && value.length >= 2,
        "INVALID_ENV",
        "Unterminated environment quote",
      );
      value = value.slice(1, -1);
    }
    assert(
      !/[\x00-\x1f]/.test(value),
      "INVALID_ENV",
      "Control character in environment value",
    );
    result[match[1]] = value;
  }
  return result;
}
export async function readPrivateFile(path) {
  const stat = await lstat(path);
  assert(
    stat.isFile() &&
      !stat.isSymbolicLink() &&
      (stat.mode & 0o077) === 0 &&
      (!process.getuid || stat.uid === process.getuid()),
    "PRIVATE_FILE_REQUIRED",
    "Credential file must be an owner-only regular file",
  );
  return readFile(path, "utf8");
}
export function configFromEnv(env = {}) {
  const config = {
    network: "mainnet",
    host: "127.0.0.1",
    port: 4318,
    origin: "http://127.0.0.1:4318",
    stateDir: resolve(ROOT, ".local/backend"),
    enabled: env.INTEGRATION_ALLOW_MAINNET === "true",
    allowRecoverablePublication:env.INTEGRATION_ALLOW_RECOVERABLE_PUBLICATION==='true',
    allowFundedWallets:env.INTEGRATION_ALLOW_FUNDED_BROWSER_WALLETS==='true',
    defaultArbiter:env.INTEGRATION_DEFAULT_ARBITER_ID||null,
    treasury: env.INTEGRATION_NEAR_ACCOUNT_ID
      ? walletId(env.INTEGRATION_NEAR_ACCOUNT_ID)
      : null,
    assets: MAINNET,
    limits: {
      sourceUsdc: units(env.INTEGRATION_MAX_BASE_USDC_OUTFLOW || "1", 6),
      baseGas: units(env.INTEGRATION_MAX_BASE_ETH_GAS || "0.0001", 18),
      nearFees: units(env.INTEGRATION_MAX_NEAR_FEES || "0.15", 24),
      nearAllocationGross: units(env.INTEGRATION_MAX_NEAR_OUTFLOW || "16", 24),
      nearAllocation: units(
        env.INTEGRATION_MAX_CONCURRENT_NEAR_ALLOCATION || "7.5",
        24,
      ),
    },
    treasuryFloor: units(env.INTEGRATION_MIN_TREASURY_NEAR || "12", 24),
    nearRpc: env.INTEGRATION_NEAR_RPC_URL || "https://near.drpc.org",
    baseRpc: env.INTEGRATION_BASE_RPC_URL || "https://mainnet.base.org",
    artifact: resolve(ROOT, "target/proof-artifacts/campaign-marketplace.wasm"),
    chatgptCredentials: resolve(
      ROOT,
      env.INTEGRATION_CHATGPT_CREDENTIALS_PATH ||
        ".local/chatgpt-auth/credentials.json",
    ),
  };
  for (const endpoint of [config.nearRpc, config.baseRpc])
    assert(
      new URL(endpoint).protocol === "https:",
      "INVALID_RPC",
      "Mainnet RPC must use HTTPS",
    );
  const keys = {};
  for (const [name, value] of Object.entries({
    near: env.INTEGRATION_NEAR_PRIVATE_KEY,
    buyerA: env.INTEGRATION_BUYER_A_PRIVATE_KEY,
    buyerB: env.INTEGRATION_BUYER_B_PRIVATE_KEY,
    oneClick: env.INTEGRATION_ONECLICK_API_KEY,
    pinata: env.INTEGRATION_IPFS_PINNING_TOKEN,
  }))
    Object.defineProperty(keys, name, {
      value: value || null,
      enumerable: false,
    });
  Object.defineProperty(config, "keys", { value: keys, enumerable: false });
  return config;
}
export async function loadConfig(
  path = resolve(ROOT, ".local/integration.env"),
) {
  try{return configFromEnv(parseEnv(await readPrivateFile(path)));}
  catch(error){if(error.code==='ENOENT')return configFromEnv({});throw error;}
}
