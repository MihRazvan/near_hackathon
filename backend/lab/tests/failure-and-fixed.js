// Run with: playwright-cli -s=integration-lab run-code --filename=backend/lab/tests/failure-and-fixed.js
// Run after the success flow on the same local lab. Every business action below uses the visible interface.
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
 await connect(0);await stage('1 · Owner');await page.locator('#asset-title').fill('Synthetic cancellation vehicle');await action('Save asset draft');
 await page.locator('#price').fill('1');await page.locator('#sale-title').fill('One-cent cancellation case');await action('Save sale draft');await action('Review & publish selected sale',{approve:true});
 await expectState(s=>s.state.round==='0','one-cent takeover sale published');
 await connect(1);await stage('2 · Buy & take over');await action('Prepare booking at current price');await action('Review & sign booking',{approve:true});
 const a=await expectState(s=>s.state.round==='1','first principal is one cent');result.buyerA=a.state.holder.account_id;
 await connect(2);await stage('2 · Buy & take over');await action('Prepare booking at current price');await action('Review & sign booking',{approve:true});
 const b=await expectState(s=>s.state.round==='2','takeover principal rounds up to two cents');result.buyerB=b.state.holder.account_id;
 await connect(0);await stage('3 · Placement NFT');await action('Sandbox: advance beyond bidding close');
 await connect(5);await stage('5 · Settlement & payout');await action('Arbiter: finalize failed campaign',{approve:true});
 await expectState(s=>s.state.outcome==='failure'&&!s.state.nft_minted,'failed campaign closes without an NFT');
 await connect(1);await stage('5 · Settlement & payout');let value=await snapshot();
 if(value.credits[result.buyerA].conditional_bonus!=='0'||value.credits[result.buyerA].available!=='10000')throw new Error('Failure did not cancel the conditional bonus');
 await action('Claim active wallet’s available payout');
 await connect(2);await stage('5 · Settlement & payout');value=await snapshot();if(value.credits[result.buyerB].available!=='20000')throw new Error('Final buyer principal was not returned');
 await action('Claim active wallet’s available payout');
 const cancelled=await expectState(s=>s.state.total_withdrawn==='30000'&&s.escrowBalance==='0','both original principals refunded exactly; failed escrow empty');result.cancelledContract=cancelled.accountId;
 // A separate fixed-price offer rejects a takeover before asking the second buyer to sign.
 await connect(0);await stage('1 · Owner');await page.locator('#asset-title').fill('Synthetic fixed-price vehicle');await action('Save asset draft');
 await page.locator('#price').fill('1');await page.locator('#takeovers').uncheck();await page.locator('#sale-title').fill('Fixed-price one-cent case');await action('Save sale draft');await action('Review & publish selected sale',{approve:true});
 await connect(1);await stage('2 · Buy & take over');await action('Prepare booking at current price');await action('Review & sign booking',{approve:true});await expectState(s=>s.state.round==='1','fixed-price spot accepts first buyer');
 await connect(2);await stage('2 · Buy & take over');const rejected=await action('Prepare booking at current price',{allowError:true});
 if(!rejected.includes('already booked'))throw new Error('Fixed-price takeover was not refused');result.checks.push('fixed spot rejects takeover without a wallet request or token transfer');
 await connect(0);await stage('3 · Placement NFT');await action('Sandbox: advance beyond bidding close');
 await connect(5);await stage('5 · Settlement & payout');await action('Arbiter: finalize failed campaign',{approve:true});
 await connect(1);await stage('5 · Settlement & payout');await action('Claim active wallet’s available payout');
 result.fixed=await expectState(s=>s.state.outcome==='failure'&&s.escrowBalance==='0','fixed-price qualification principal recovered');return result;
}
