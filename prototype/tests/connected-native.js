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
 await go('/host/sales/new?asset='+assetId);await page.locator('[name=title]').fill('One-cent recoverable campaign');await act('quick-dates');await page.locator('[name="price:spot-1"]').fill('0.01');await page.locator('[name=takeoverDefault]').uncheck();await submit('sale-edit');await idle();
 const saleId=new URL(page.url()).pathname.split('/')[3];
 await approved(()=>page.locator('[data-live-action=publish]').click());await assertText('Published campaign and original booking records.');checks.push('Recoverable publication through product review');
 const fulfillment=await page.getByRole('link',{name:'Manage artwork & delivery'}).getAttribute('href'),contract=new URL(fulfillment,base).searchParams.get('contract');

 await connect('NFT recipient');await go('/buy/money');await act('faucet');await go('/checkout/'+saleId+'?spot=spot-1');await page.locator('[name=rules]').check();await submit('prepare-booking');await idle();const nativeBooking=new URL(page.url()).pathname.split('/')[2];await approved(()=>page.locator('[data-live-action=pay-booking]').click());await assertText('Your placement is confirmed.');
 await connect('Owner');await go('/_testing');await page.locator('[name=saleId]').selectOption(saleId);await page.locator('[name=stage]').selectOption('biddingClose');await submit('advance-clock');await idle();
 await connect('NFT recipient');await go('/buy/placements/'+nativeBooking);await approved(()=>page.locator('[data-live-action=mint]').click());await assertText('recipient.sandbox');
 await connect('Arbiter');await go('/ops/listings/'+saleId);await approved(()=>page.locator('[data-live-action=finalize-failure]').click());if(await page.locator('[data-live-action=finalize-success],[data-live-action=finalize-failure]').count())throw Error('Failed campaign still offers finalization');
 await connect('NFT recipient');await go('/buy/money');await act('claim');await page.getByRole('button',{name:'Refresh state',exact:true}).click();await idle();await assertText('0.25 USDC');
 return {saleId,contract,nativeBooking,checks,nativeRefundConfirmed:true};
}
