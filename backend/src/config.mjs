import { readFile, lstat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, isAbsolute } from "node:path";
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
  const environment=env.APP_ENV || (env.NODE_ENV==='production'?'production':'development');
  assert(['production','development','test'].includes(environment),'INVALID_ENV','APP_ENV must be production, development or test');
  const production=environment==='production';
  const originOf=value=>{let url;try{url=new URL(value);}catch{}assert(url&&['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&url.pathname==='/'&&!url.search&&!url.hash,'INVALID_ORIGIN','Configure an absolute HTTP(S) origin without a path');assert(!production||url.protocol==='https:','HTTPS_REQUIRED','Production public origins must use HTTPS');return url.origin;};
  assert(!production||env.APP_ORIGIN,'ORIGIN_REQUIRED','APP_ORIGIN is required in production');
  assert(!production||(env.APP_STATE_DIR&&isAbsolute(env.APP_STATE_DIR)),'PERSISTENT_STATE_REQUIRED','Production requires an explicit absolute APP_STATE_DIR on persistent storage');
  const origin=originOf(env.APP_ORIGIN||'http://127.0.0.1:4318'),apiOrigin=originOf(env.APP_API_ORIGIN||origin);
  const port=Number(env.PORT||env.APP_PORT||4318);assert(Number.isInteger(port)&&port>0&&port<=65535,'INVALID_PORT','PORT must be between 1 and 65535');
  const host=env.APP_BIND_HOST||(production?'0.0.0.0':'127.0.0.1');
  assert(['127.0.0.1','localhost','0.0.0.0','::','::1'].includes(host),'INVALID_HOST','Use a local or wildcard bind address');
  const sessionHours=Number(env.APP_SESSION_HOURS||168);assert(Number.isSafeInteger(sessionHours)&&sessionHours>=1&&sessionHours<=720,'INVALID_SESSION','Session duration must be 1 to 720 hours');
  const config = {
    network: "mainnet",
    environment,production,host,port,origin,apiOrigin,
    allowedOrigins:[...new Set([origin,apiOrigin])],
    stateDir: resolve(ROOT, env.APP_STATE_DIR||'.local/backend'),
    authSessionMs:sessionHours*60*60*1000,
    crossSiteSessions:production&&env.APP_CROSS_SITE_SESSIONS==='true',
    customerRouteMax:units(env.APP_CUSTOMER_ROUTE_MAX_USDC||'1000',6),
    customerGasMax:units(env.APP_CUSTOMER_ROUTE_MAX_ETH_GAS||'0.005',18),
    mediaMaxFiles:Number(env.APP_MEDIA_MAX_FILES||(production?'1000':'20')),
    aiDailyLimit:Number(env.APP_AI_DAILY_LIMIT||'5'),
    aiGlobalDailyLimit:Number(env.APP_AI_GLOBAL_DAILY_LIMIT||(production?'100':'25')),
    enabled: env.INTEGRATION_ALLOW_MAINNET === "true",
    allowRecoverablePublication:env.INTEGRATION_ALLOW_RECOVERABLE_PUBLICATION==='true',
    allowFundedWallets:!production&&env.INTEGRATION_ALLOW_FUNDED_BROWSER_WALLETS==='true',
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
    artifact: resolve(ROOT, env.APP_ARTIFACT_PATH||"target/proof-artifacts/campaign-marketplace.wasm"),
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
    buyerA: production?null:env.INTEGRATION_BUYER_A_PRIVATE_KEY,
    buyerB: production?null:env.INTEGRATION_BUYER_B_PRIVATE_KEY,
    oneClick: env.INTEGRATION_ONECLICK_API_KEY,
    pinata: env.INTEGRATION_IPFS_PINNING_TOKEN,
  }))
    Object.defineProperty(keys, name, {
      value: value || null,
      enumerable: false,
    });
  Object.defineProperty(config, "keys", { value: keys, enumerable: false });
  for(const name of ['mediaMaxFiles','aiDailyLimit','aiGlobalDailyLimit'])assert(Number.isSafeInteger(config[name])&&config[name]>0&&config[name]<=100000,'INVALID_LIMIT','Application quotas must be positive bounded integers');
  assert(BigInt(config.customerRouteMax)>0n&&BigInt(config.customerGasMax)>0n,'INVALID_LIMIT','Customer route limits must be positive');
  if(env.INTEGRATION_FACTORY_ACCOUNT_ID||env.INTEGRATION_FACTORY_CODE_HASH||env.INTEGRATION_CAMPAIGN_SHA256){
   assert(env.INTEGRATION_FACTORY_ACCOUNT_ID&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(env.INTEGRATION_FACTORY_CODE_HASH??'')&&/^[0-9a-f]{64}$/.test(env.INTEGRATION_CAMPAIGN_SHA256??''),'INVALID_FACTORY','Factory account, pinned code hash and campaign SHA256 are required together');
   config.factory={accountId:walletId(env.INTEGRATION_FACTORY_ACCOUNT_ID),codeHash:env.INTEGRATION_FACTORY_CODE_HASH,campaignSha256:env.INTEGRATION_CAMPAIGN_SHA256};
  }
  assert(!production||!config.enabled||(config.treasury&&keys.near),'OPERATOR_NOT_CONFIGURED','Mainnet execution requires a dedicated operator account and signing key');
  return config;
}
export async function loadConfig(path,environment=process.env) {
  const production=(environment.APP_ENV||(environment.NODE_ENV==='production'?'production':'development'))==='production';
  const file=path??environment.APP_ENV_FILE??(!production?resolve(ROOT,'.local/integration.env'):null);
  let values={};
  if(file)try{values=parseEnv(await readPrivateFile(file));}catch(error){if(error.code!=='ENOENT')throw error;if(path||environment.APP_ENV_FILE)throw error;}
  // Hosted process secrets override files; production never discovers a developer's local credentials.
  return configFromEnv({...values,...environment});
}
