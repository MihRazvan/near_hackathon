#!/usr/bin/env node
import { privateKeyToAccount } from 'viem/accounts';
import { runtime } from '../src/runtime.mjs';
import { ChainService } from '../src/chain-service.mjs';
import { nep413Digest } from '../src/auth.mjs';
import { assert, AppError, uint } from '../src/core.mjs';

// Drives the local HTTP API with dedicated qualification wallets. Never accepts a private key argument.
async function run([kind,role]){
 const r=await runtime(),chain=new ChainService(r);
 try{
  const campaign=r.store.get('qualification','success');assert(campaign?.deploymentId,'NO_CAMPAIGN','Success scenario must be deployed');
  const contractId=campaign.deploymentId;
  async function api(path,{method='POST',body,token}={}){
   const response=await fetch(r.config.origin+'/api/'+path,{method,headers:{Origin:r.config.origin,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
   const value=await response.json();if(!response.ok)throw new AppError(value.error?.code??'API_ERROR',value.error?.message??'Local API request failed',response.status);return value;
  }
  const id='api-qualification-'+kind+'-'+(role??'buyerB'),existing=r.store.get('api-step',id);
  if(kind==='nominate'){
   const account=privateKeyToAccount(r.config.keys.buyerB),wallet=account.address.toLowerCase(),challenge=await api('auth/challenge',{body:{wallet}});
   const {token}=await api('auth/verify',{body:{challengeId:challenge.id,signature:await account.signMessage({message:challenge.message})}});
   try{
    let plan;if(existing)plan=r.store.get('intent',existing.planId).plan;else{
     const recipient=await chain.vault.identity('placement-owner');plan=await api('nomination',{token,body:{contractId,recipientId:recipient.accountId}});
     r.store.insert('api-step',id,wallet,{planId:plan.planId});
    }
    return await api('intents/'+plan.planId+'/relay',{token,body:{signature:await account.signMessage({message:plan.message})}});
   }finally{await api('auth/logout',{token});}
  }
  assert(['treasury','placement-owner','placement-transferee','arbiter'].includes(role),'INVALID_ROLE','Choose a dedicated native qualification role');
  const identity=role==='treasury'?{accountId:r.config.treasury,signer:await chain.treasurySigner()}:await chain.vault.identity(role),wallet=identity.accountId;
  const challenge=await api('auth/challenge',{body:{wallet}}),signature=await identity.signer.signBytes(nep413Digest(challenge));
  const {token}=await api('auth/verify',{body:{challengeId:challenge.id,signature:Buffer.from(signature).toString('base64'),accountId:wallet,publicKey:(await identity.signer.getPublicKey()).toString()}});
  try{
   let plan;
   if(existing)plan=r.store.get('native-plan',existing.planId).plan;
   else{
    const body={contractId,kind};
    if(['artwork','delivery-proof'].includes(kind)){
     const artifact=await api('media',{token,body:{base64:Buffer.from('Synthetic Everywhere integration evidence. No physical installation is claimed.\n').toString('base64'),mime:'text/plain',publicContentAcknowledged:true}});body.mediaId=artifact.id;
    }
    if(kind==='lock-artwork')body.expectedRevision=(await chain.snapshot(contractId)).rights.revision;
    if(kind==='transfer')body.receiverId=(await chain.vault.identity('placement-transferee')).accountId;
    plan=await api('native-actions',{token,body});r.store.insert('api-step',id,wallet,{planId:plan.planId});
   }
   const p=plan.transaction.actions[0].params,opId='api-native-'+plan.planId;
   const operation=await r.near.execute({id:opId,signer:identity.signer,plan:{network:r.config.network,signerId:wallet,receiverId:contractId,expectedReceiverCodeHash:plan.codeHash,
    ...(wallet===r.config.treasury&&uint(p.deposit)>0n?{allocationAccount:contractId}:{}),actions:[{type:'call',method:p.methodName,args:p.args,gas:p.gas,deposit:p.deposit}]}});
   const confirmation=await api('native-actions/'+plan.planId+'/confirm',{token,body:{transactionHash:operation.transaction_hash}});
   return {kind,wallet,phase:operation.phase,transactionHash:operation.transaction_hash,confirmation:confirmation.status};
  }finally{await api('auth/logout',{token});}
 }finally{r.store.close();}
}
try{console.log(JSON.stringify(await run(process.argv.slice(2)),null,2));}
catch(error){console.error(JSON.stringify({code:error.code??'API_QUALIFICATION_FAILED',message:error instanceof AppError?error.message:'API qualification failed; credential details omitted'}));process.exitCode=1;}
