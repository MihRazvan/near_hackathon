// Run against a fresh valueless Sandbox using playwright-cli run-code --filename.
// All business actions use visible product forms, the wallet review, and finalized chain receipts.
async page => {
 const base=new URL(page.url()).origin,checks=[];
 await page.goto(base+'/');await page.getByText('LOCAL NEAR SANDBOX',{exact:true}).waitFor();
 const idle=()=>page.waitForFunction(()=>!document.body.classList.contains('connected-busy'),null,{timeout:180000});
 async function go(path){await page.goto(base+path);await page.waitForFunction(()=>!document.body.textContent.includes('Loading the local backend'),null,{timeout:60000});await idle();}
 async function submit(name){await page.locator(`form[data-live-form="${name}"] button[type=submit]`).click();}
 async function approved(action){await action();await page.locator('dialog.connected-review[open]').waitFor();await page.locator('dialog.connected-review[open] button[value=approve]').click();await idle();if(await page.locator('#connected-notice.orange:visible').count())throw new Error(await page.locator('#connected-notice').textContent());}
 async function connect(label){await go('/settings/wallets');await page.locator('form[data-live-form=connect-test] select').selectOption({label:await page.locator('form[data-live-form=connect-test] option').filter({hasText:label+' ·'}).first().textContent()});await approved(()=>submit('connect-test'));checks.push('Connected '+label);}
 async function act(name){await page.locator(`[data-live-action="${name}"]`).first().click();await idle();if(await page.locator('#connected-notice.orange:visible').count())throw new Error(await page.locator('#connected-notice').textContent());}
 async function assertText(text){if(!await page.getByText(text,{exact:false}).count())throw new Error('Missing visible text: '+text);}
 await connect('Owner');await go('/host/assets/new');
 await page.locator('[name=method]').selectOption('manual');await page.locator('[name=title]').fill('One-cent product qualification');await page.locator('[name=city]').fill('Bucharest');await page.locator('textarea[name=description]').fill('Synthetic demo vehicle; one reviewed advertising panel.');await submit('asset-create');await idle();
 const assetId=new URL(page.url()).pathname.split('/')[3];
 await page.locator('[name=reviewed]').check();await submit('asset-edit');await idle();checks.push('Owner reviewed and saved editable surface');
 await go('/host/sales/new?asset='+assetId);await page.locator('[name=title]').fill('One-cent recoverable campaign');await act('quick-dates');await page.locator('[name="price:spot-1"]').fill('0.01');await submit('sale-edit');await idle();
 const saleId=new URL(page.url()).pathname.split('/')[3];
 await approved(()=>page.locator('[data-live-action=publish]').click());await assertText('Published campaign and original booking records.');checks.push('Recoverable publication through product review');
 const fulfillment=await page.getByRole('link',{name:'Manage artwork & delivery'}).getAttribute('href'),contract=new URL(fulfillment,base).searchParams.get('contract');
 async function buy(label,reject=false){await connect(label);await go('/buy/money');await act('faucet');await go('/checkout/'+saleId+'?spot=spot-1');await page.locator('[name=rules]').check();await submit('prepare-booking');await idle();const booking=new URL(page.url()).pathname.split('/')[2];
  if(reject){await page.locator('[data-live-action=pay-booking]').click();await page.locator('dialog.connected-review[open] button[value=reject]').click();await idle();await assertText('Wallet request rejected.');checks.push('Rejected payment sends nothing and can be retried');}
  await approved(()=>page.locator('[data-live-action=pay-booking]').click());await assertText('Your placement is confirmed.');checks.push(label+' payment accepted by contract');return booking;
 }
 const first=await buy('Buyer A',true),second=await buy('Buyer B');
 await connect('Owner');await go('/_testing');await page.locator('[name=saleId]').selectOption(saleId);await page.locator('[name=stage]').selectOption('biddingClose');await submit('advance-clock');await idle();checks.push('Actual local chain advanced past bidding');
 await connect('Buyer B');await go('/buy/placements/'+second);await page.locator('[name=recipientId]').fill('recipient.sandbox');await approved(()=>submit('nomination'));checks.push('Final EVM payer nominated native NFT recipient');
 await connect('NFT recipient');await go('/buy/placements/'+contract);await approved(()=>page.locator('[data-live-action=accept-nomination]').click());await approved(()=>page.locator('[data-live-action=mint]').click());checks.push('Nominee accepted and minted final placement NFT');
 await page.locator('form[data-live-form=nft-transfer] [name=receiverId]').fill('transferee.sandbox');await approved(()=>submit('nft-transfer'));checks.push('NFT control transferred to separate wallet');
 await connect('NFT transferee');await go('/buy/placements/'+contract);await page.locator('form[data-live-form=artwork] [name=notes]').fill('Synthetic ad artwork for one-cent integration qualification.');await page.locator('form[data-live-form=artwork] [name=public]').check();await approved(()=>submit('artwork'));checks.push('Current NFT owner submitted content-addressed artwork');
 await connect('Owner');await go(fulfillment);await approved(()=>page.locator('[data-live-action=lock-artwork]').click());await page.locator('form[data-live-form=delivery-proof] [name=notes]').fill('Synthetic installation evidence; no real physical advertising was installed.');await page.locator('form[data-live-form=delivery-proof] [name=public]').check();await approved(()=>submit('delivery-proof'));checks.push('Owner locked exact artwork revision and uploaded installation proof');
 await go('/_testing');await page.locator('[name=saleId]').selectOption(saleId);await page.locator('[name=stage]').selectOption('reviewEnd');await submit('advance-clock');await idle();
 await connect('Arbiter');await go('/ops/listings/'+saleId);await approved(()=>page.locator('[data-live-action=finalize-success]').click());checks.push('Independent arbiter finalized successful campaign');if(await page.locator('[data-live-action=finalize-success],[data-live-action=finalize-failure]').count())throw Error('Settled campaign still offers finalization');
 await connect('Owner');await go('/host/earnings');await act('claim');await go('/buy/money');if(await page.locator('[data-live-action=register-storage]').count())await approved(()=>page.locator('[data-live-action=register-storage]').click());await page.locator('form[data-live-form=withdraw-native] [name=amount]').fill('0.01');await approved(()=>submit('withdraw-native'));checks.push('Owner claimed earnings and withdrew native USDC');
 await connect('Buyer A');await go('/buy/money');await act('claim');checks.push('Displaced buyer claimed original-wallet refund and success reward');
 await go('/account/recovery');await act('recover-all');checks.push('Original requests reconciled after wallet switching');
 await go('/buy/placements/'+first);const escrow=await page.locator('dt').filter({hasText:'Escrow balance'}).locator('..').locator('dd').textContent();if(escrow.trim()!=='0.00 USDC')throw Error('Campaign escrow was not cleared after payouts');
 return {base,assetId,saleId,contract,first,second,checks,escrow};
}
