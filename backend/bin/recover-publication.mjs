#!/usr/bin/env node
import {runtime} from '../src/runtime.mjs';
import {ChainService} from '../src/chain-service.mjs';
import {ProvisionRecovery} from '../src/provision-recovery.mjs';
import {assert} from '../src/core.mjs';
const [planId,spotId,...flags]=process.argv.slice(2);
assert(planId&&spotId&&flags.every(f=>['--execute','--retire-nft'].includes(f)),'USAGE','Use: node backend/bin/recover-publication.mjs PLAN_ID SPOT_ID [--execute] [--retire-nft]');
const r=await runtime();try{
 const recovery=new ProvisionRecovery({...r,chain:new ChainService(r)});
 console.log(JSON.stringify(flags.includes('--execute')?await recovery.execute(planId,spotId,{retireNft:flags.includes('--retire-nft')}):await recovery.quote(planId,spotId),null,2));
}catch(error){console.error(error.code??'RECOVERY_FAILED',error.message);process.exitCode=1;}finally{r.store.close();}
