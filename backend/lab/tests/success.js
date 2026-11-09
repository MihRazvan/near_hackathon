// Run with: playwright-cli -s=integration-lab run-code --filename=backend/lab/tests/success.js
// Start a fresh local lab first. Every business action below uses the visible interface.
async page => {
 const result={checks:[]};
 const idle=()=>page.waitForFunction(()=>!document.querySelector('[data-action=refresh]').disabled,undefined,{timeout:180000});
 const button=name=>page.getByRole('button',{name,exact:true});
 async function action(name,{approve=false,reject=false,allowError=false}={}){
  await button(name).click();
  if(approve||reject){
   await page.waitForFunction(()=>document.querySelector('#review').open||!document.querySelector('[data-action=refresh]').disabled);
   if(!await page.locator('#review').evaluate(e=>e.open))throw new Error(name+': '+await page.locator('#notice').innerText());
   await button(reject?'Reject request':'Approve request').click();
  }
  await idle();const message=await page.locator('#notice').innerText();
  if(!allowError&&await page.locator('#notice').evaluate(e=>e.classList.contains('error')))throw new Error(name+': '+message);
  return message;
 }
 async function connect(index){await page.locator('#test-wallet').selectOption({index});await action('Connect test wallet',{approve:true});}
 async function stage(name){await button(name).click();}
 const snapshot=async()=>JSON.parse(await page.locator('#snapshot').textContent());
 async function expectState(predicate,label){for(let i=0;i<35;i++){
  await action('Refresh chain state');const value=await snapshot();if(predicate(value)){result.checks.push(label);return value;}
  await page.waitForTimeout(300);
 }throw new Error('State did not converge: '+label);}
 await page.goto('http://127.0.0.1:4320/lab');await idle();
 await connect(0);await stage('1 · Owner');
 await action('Save asset draft');await action('Save sale draft');
 await action('Review & publish selected sale',{approve:true});
 const published=await expectState(s=>s.state.round==='0','owner published current terms through wallet');result.contractId=published.accountId;
 await connect(1);await stage('2 · Buy & take over');await action('Fund this test wallet with 0.25 test USDC');
 await action('Prepare booking at current price');
 const rejection=await action('Review & sign booking',{reject:true,allowError:true});
 if(!rejection.includes('rejected'))throw new Error('Expected explicit rejection');
 await expectState(s=>s.state.round==='0','rejected purchase leaves principal and round unchanged');
 await action('Review & sign booking',{approve:true});
 const first=await expectState(s=>s.state.round==='1','buyer A accepted at ten cents');result.buyerA=first.state.holder.account_id;
 await connect(2);await stage('2 · Buy & take over');await action('Fund this test wallet with 0.25 test USDC');await action('Prepare booking at current price');
 await action('Review & sign booking',{approve:true});
 const takeover=await expectState(s=>s.state.round==='2','buyer B takeover accepted at fifteen cents');result.buyerB=takeover.state.holder.account_id;
 if(result.buyerA===result.buyerB)throw new Error('Takeover did not switch payer');
 await connect(1);await stage('5 · Settlement & payout');const displaced=await snapshot();
 if(displaced.credits[result.buyerA].available!=='100000'||displaced.credits[result.buyerA].conditional_bonus!=='10000')throw new Error('Incorrect displaced credit');
 await action('Claim active wallet’s available payout');result.checks.push('displaced principal claimed before service; reward remains conditional');
 await connect(0);await stage('3 · Placement NFT');await action('Sandbox: advance beyond bidding close');
 await connect(2);await stage('3 · Placement NFT');await action('Final buyer: review & nominate recipient',{approve:true});
 await expectState(s=>s.state.nominated_recipient==='recipient.sandbox','final payer nominates native NFT recipient');
 await connect(3);await stage('3 · Placement NFT');await action('Recipient: accept nomination',{approve:true});await action('Mint final placement NFT',{approve:true});
 await expectState(s=>s.rights.current_owner_id==='recipient.sandbox','recipient accepts and placement NFT mints');
 await action('NFT owner: review & transfer',{approve:true});
 await expectState(s=>s.rights.current_owner_id==='transferee.sandbox','NFT transfer changes artwork controller');
 // The old recipient must no longer control artwork.
 await stage('4 · Fulfillment');const blocked=await action('NFT owner: submit artwork',{allowError:true});
 if(!blocked.includes('current placement NFT owner'))throw new Error('Old NFT owner was not rejected');
 result.checks.push('previous NFT owner cannot submit artwork');
 await connect(4);await stage('4 · Fulfillment');await page.locator('#public-artifact').check();
 await action('Upload & verify public artifact');await action('NFT owner: submit artwork',{approve:true});
 await expectState(s=>Boolean(s.rights.proposal),'new owner artwork committed');
 await connect(0);await stage('4 · Fulfillment');await page.locator('#public-artifact').check();
 await page.locator('#artifact-text').fill('Synthetic integration installation proof. No personal data.');
 await action('Upload & verify public artifact');await action('Seller: approve current artwork revision',{approve:true});
 await action('Seller: submit installation proof',{approve:true});
 await expectState(s=>Boolean(s.campaign.delivery_proof)&&s.state.artwork_locked,'seller locks exact artwork and supplies installation proof');
 await action('Buyer or seller: request issue review');
 await connect(5);await stage('4 · Fulfillment');await page.locator('#public-artifact').check();
 await page.locator('#artifact-text').fill('Synthetic integration arbiter review evidence. No personal data.');
 await action('Upload & verify public artifact');await action('Arbiter: open issue',{approve:true});
 await expectState(s=>s.campaign.open_issues===1,'arbiter opens on-chain issue');
 await stage('5 · Settlement & payout');await action('Sandbox: advance beyond review end');
 const issueBlock=await action('Arbiter: finalize successful campaign',{allowError:true});
 if(!issueBlock.includes('must be complete'))throw new Error('Open issue did not block settlement');result.checks.push('unresolved issue blocks payout');
 await stage('4 · Fulfillment');await action('Arbiter: resolve issue',{approve:true});
 await stage('Recovery');await page.locator('#lose-response').check();await stage('5 · Settlement & payout');
 const lost=await action('Arbiter: finalize successful campaign',{approve:true,allowError:true});
 if(!lost.includes('Simulated lost'))throw new Error('Response loss injection did not execute');
 await page.reload();await idle();await stage('Recovery');
 await action('Sandbox: restart API, keep chain');await action('Reconcile this wallet’s requests');
 await expectState(s=>s.state.outcome==='success','lost wallet response recovers original finalized settlement after reload');
 await connect(1);await stage('5 · Settlement & payout');await action('Claim active wallet’s available payout');
 const a=await expectState(s=>s.credits[result.buyerA].available==='0'&&s.credits[result.buyerA].conditional_bonus==='0','original displaced wallet receives reward');
 await connect(0);await stage('5 · Settlement & payout');await action('Claim active wallet’s available payout');
 const final=await expectState(s=>s.credits['seller.sandbox'].available==='0'&&s.state.total_withdrawn==='250000','seller receives fourteen cents; all original claims settle');
 if(final.state.total_received!=='250000'||final.escrowBalance!=='0')throw new Error('Escrow did not settle exactly');
 result.final=final;
 await action('NEAR wallet: register native USDC storage',{approve:true});
 await action('Withdraw USDC to a NEAR wallet',{approve:true});
 if(!(await page.locator('#balances').innerText()).includes('NEAR wallet: 0.010000 USDC'))throw new Error('Native wallet did not receive the withdrawn earnings');
 result.checks.push('seller can withdraw spendable native USDC using its own NEAR wallet');
 await action('NEAR wallet: deposit USDC back to Intents',{approve:true});
 if(!(await page.locator('#balances').innerText()).includes('Intents: 0.140000 USDC'))throw new Error('Native redeposit did not return owner funds');
 result.checks.push('native earnings redeposit verifies without EVM key registration');return result;
}
