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
import { Publication } from '../src/publication.mjs';
import { WalletRequests } from '../src/wallet-requests.mjs';
import { IntegrationLab } from '../src/lab.mjs';
import { Product } from '../src/product.mjs';
import { BrowserFunding } from '../src/browser-funding.mjs';
import { Capture } from '../src/capture.mjs';
import { FundedWallets } from '../src/funded-wallets.mjs';
import { Provisioning } from '../src/provisioning.mjs';

const r=await runtime(),chain=new ChainService(r);
const auth=new Auth(r.store,{origin:r.config.origin,sessionMs:r.config.authSessionMs,readKeys:account=>r.reads.keys(account)});
const marketplace=new Marketplace({store:r.store,chain}),nativeActions=new NativeActions({store:r.store,chain,reads:r.reads,config:r.config});
const assetAI=new AssetAI(new ChatGPT({credentialsFile:r.config.chatgptCredentials})),media=new Media({store:r.store,token:r.config.keys.pinata,maxFiles:r.config.mediaMaxFiles});
const returnVerifier=new ReturnVerifier(r);
const publication=new Publication({...r,marketplace}),walletRequests=new WalletRequests({...r,chain,nativeActions,publication});
const lab=r.config.production?null:new IntegrationLab({...r,chain,auth,marketplace,walletRequests});
const product=new Product({...r,chain,marketplace,walletRequests});
const funding=new BrowserFunding(r);
const capture=new Capture(r);
const provisioning=new Provisioning({...r,chain,marketplace});
const fundedWallets=await new FundedWallets({...r,chain,walletRequests,funding}).load();
const server=httpApp({...r,auth,chain,marketplace,nativeActions,publication,walletRequests,assetAI,media,returnVerifier,lab,product,funding,capture,provisioning,fundedWallets});
const worker=reconciliationWorker({...r,marketplace,nativeActions,walletRequests,intentOutcomes:chain.updateIntentOutcome.bind(chain)});
server.listen(r.config.port,r.config.host,()=>console.log('Everywhere API listening on port '+r.config.port));
function stop(){worker.stop();server.close(()=>{if(!worker.isRunning())r.store.close();process.exit(0);});}
process.once('SIGINT',stop);process.once('SIGTERM',stop);
