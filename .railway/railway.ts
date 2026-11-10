import { defineRailway, project, service, volume } from "railway/iac";

export default defineRailway(() => {
  const state = volume("state", {region:"europe-west4",sizeMB:1024});
  const web = service("web", {
    build: {builder:"DOCKERFILE",dockerfilePath:"Dockerfile"},
    deploy: {
      numReplicas:1,region:"europe-west4",sleepApplication:false,
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
