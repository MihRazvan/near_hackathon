#!/usr/bin/env node
import { runtime } from '../src/runtime.mjs';
import { ChainService } from '../src/chain-service.mjs';
import { Auth } from '../src/auth.mjs';
import { Marketplace } from '../src/marketplace.mjs';
import { NativeActions } from '../src/native-actions.mjs';
import { ChatGPT } from '../src/chatgpt.mjs';
import { AssetAI } from '../src/asset-ai.mjs';
import { Media } from '../src/media.mjs';
import { httpApp } from '../src/http.mjs';
import { reconciliationWorker } from '../src/worker.mjs';
import { ReturnVerifier } from '../src/returns.mjs';

const r=await runtime(),chain=new ChainService(r);
const auth=new Auth(r.store,{origin:r.config.origin,readKeys:account=>r.reads.keys(account)});
const marketplace=new Marketplace({store:r.store,chain}),nativeActions=new NativeActions({store:r.store,chain:{snapshot:chain.snapshot.bind(chain)},reads:r.reads});
const assetAI=new AssetAI(new ChatGPT({credentialsFile:r.config.chatgptCredentials})),media=new Media({store:r.store,token:r.config.keys.pinata});
const returnVerifier=new ReturnVerifier(r);
const server=httpApp({...r,auth,chain,marketplace,nativeActions,assetAI,media,returnVerifier});
const worker=reconciliationWorker({...r,marketplace,nativeActions,intentOutcomes:chain.updateIntentOutcome.bind(chain)});
server.listen(r.config.port,r.config.host,()=>console.log('Local integration API: '+r.config.origin+'/api/health'));
function stop(){worker.stop();server.close(()=>{if(!worker.isRunning())r.store.close();process.exit(0);});}
process.once('SIGINT',stop);process.once('SIGTERM',stop);
