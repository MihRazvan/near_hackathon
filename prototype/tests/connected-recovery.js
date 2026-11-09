// Fresh Sandbox identity: no extension profile, user keys or mainnet funds are used.
async page=>{
 const base=new URL(page.url()).origin;
 const idle=()=>page.waitForFunction(()=>!document.body.classList.contains('connected-busy'),null,{timeout:120000});
 await page.goto(base+'/settings/wallets');await page.getByText('LOCAL NEAR SANDBOX',{exact:true}).waitFor();
 await page.locator('form[data-live-form=connect-test] select').selectOption('arbiter.sandbox');await page.locator('form[data-live-form=connect-test] button[type=submit]').click();await page.locator('dialog button[value=approve]').click();await idle();
 await page.goto(base+'/_testing');await page.locator('[data-live-action=lose-response]').click();await page.getByRole('link',{name:'Open wallet balances',exact:true}).click();
 await page.locator('[data-live-action=register-storage]').click();await page.locator('dialog button[value=approve]').click();await idle();
 if(!await page.getByText('Test response interrupted.',{exact:false}).count())throw Error('Expected an interrupted response after the actual signed transaction');
 await page.reload();await page.getByRole('link',{name:'Test controls',exact:true}).click();await page.locator('[data-live-action=restart-api]').click();await idle();
 await page.getByRole('link',{name:'Open account recovery',exact:true}).click();await page.locator('[data-live-action=recover-all]').click();await idle();
 const pending=page.locator('.connected-record').filter({hasText:'submitted'});if(await pending.count())throw Error('Original signed native request was not reconciled after restart');
 if(await page.locator('#connected-notice.orange:visible').count())throw Error(await page.locator('#connected-notice').textContent());
 const originalHashes=await page.locator('.connected-record .connected-hash').allTextContents();
 await page.getByRole('link',{name:'Switch wallet',exact:true}).click();await page.locator('form[data-live-form=connect-test] select').selectOption('seller.sandbox');await page.locator('form[data-live-form=connect-test] button[type=submit]').click();await page.locator('dialog button[value=approve]').click();await idle();
 await page.getByRole('link',{name:'Account recovery',exact:true}).click();const otherHashes=await page.locator('.connected-record .connected-hash').allTextContents();if(originalHashes.some(h=>otherHashes.includes(h)))throw Error('Another wallet can see the original wallet request');
 return {responseInterrupted:true,apiRestarted:true,originalRequestRecovered:true,originalHashes,otherHashes};
}
