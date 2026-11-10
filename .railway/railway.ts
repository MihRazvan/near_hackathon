import { defineRailway, preserve, project, service, volume } from "railway/iac";

// Values are configured privately on Railway. Preserve their ownership during
// infrastructure updates without putting secrets in this authoring file.
const runtimeVariables = [
  "APP_ENV", "NODE_ENV", "APP_BIND_HOST", "APP_ORIGIN", "PORT", "APP_STATE_DIR",
  "APP_STATE_IMPORT_PATH", "APP_STATE_IMPORT_SHA256",
  "INTEGRATION_ALLOW_MAINNET", "INTEGRATION_NEAR_ACCOUNT_ID", "INTEGRATION_NEAR_PRIVATE_KEY",
  "INTEGRATION_MIN_TREASURY_NEAR", "INTEGRATION_MAX_NEAR_FEES", "INTEGRATION_MAX_NEAR_OUTFLOW",
  "INTEGRATION_MAX_CONCURRENT_NEAR_ALLOCATION", "INTEGRATION_MAX_BASE_USDC_OUTFLOW",
  "INTEGRATION_MAX_BASE_ETH_GAS", "INTEGRATION_HUB_ACCOUNT_ID", "INTEGRATION_HUB_CODE_HASH",
  "INTEGRATION_DEFAULT_ARBITER_ID", "INTEGRATION_NEAR_RPC_URL", "INTEGRATION_BASE_RPC_URL",
  "INTEGRATION_ONECLICK_API_KEY", "INTEGRATION_IPFS_PINNING_TOKEN", "APP_KEEPER_ENABLED",
  "APP_MEDIA_MAX_BYTES", "APP_MEDIA_MAX_TOTAL_BYTES", "APP_PERSONAL_AI_TOKEN",
  "APP_PERSONAL_AI_WALLETS", "APP_AI_GLOBAL_DAILY_LIMIT", "APP_NEAR_RPC_INTERVAL_MS",
];

export default defineRailway(() => {
  const state = volume("state", {region:"iad",sizeMB:1024});
  const web = service("web", {
    env:Object.fromEntries(runtimeVariables.map(key=>[key,preserve()])),
    build: {builder:"DOCKERFILE",dockerfilePath:"Dockerfile"},
    deploy: {
      multiRegionConfig:{iad:{numReplicas:1}},sleepApplication:false,
      healthcheckPath:"/api/health",healthcheckTimeout:60,
      restartPolicyType:"ON_FAILURE",restartPolicyMaxRetries:5,
      requiredMountPath:"/data",drainingSeconds:25,
      limitOverride:{containers:{cpu:0.125,memoryBytes:536870912}},
    },
    volumeMounts:{"/data":state},
  });

  return project("everywhere", {
    resources: [web,state],
  });
});
