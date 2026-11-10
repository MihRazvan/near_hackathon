// Playwright CLI: exercise the real Meteor bridge and popup, then cancel at the wallet gate.
async page=>{
 const base=new URL(page.url()).origin,results=[];
 for(const [path,selector]of [['/settings/wallets','[data-live-action=connect-near]'],['/lab','#connect-near']]){
  const sockets=[],policyErrors=[];
  const socketHandler=socket=>{if(new URL(socket.url()).origin!=='wss://mc.meteorwallet.app')return;const item={receivedFrames:0,errors:0};sockets.push(item);socket.on('framereceived',()=>item.receivedFrames++);socket.on('socketerror',()=>item.errors++);};
  const consoleHandler=m=>{if(m.type()==='error'&&m.text().includes('Content Security Policy'))policyErrors.push(m.text().split(' violates ')[0].replace(/\?.*/,'?[omitted]').slice(0,180));};
  page.on('websocket',socketHandler);page.on('console',consoleHandler);
  try{
   await page.goto(base+path);const connect=page.locator(selector);await connect.click();
   let frame=page.frameLocator('iframe');await frame.getByRole('button',{name:'Meteor Web',exact:true}).waitFor({timeout:30000});
   for(let i=0;i<60&&!sockets.some(s=>s.receivedFrames>0);i++)await new Promise(r=>setTimeout(r,250));
   if(policyErrors.length)throw Error('Meteor resources blocked by page policy');if(!sockets.some(s=>s.receivedFrames>0&&s.errors===0))throw Error('Meteor bridge did not receive a live response');
   await frame.getByRole('button',{name:'Close Meteor Connect',exact:true}).click();await page.waitForFunction(s=>!document.querySelector(s).disabled,selector,{timeout:45000});
   await connect.click();frame=page.frameLocator('iframe');await frame.getByRole('button',{name:'Meteor Web',exact:true}).waitFor();
   const [popup]=await Promise.all([page.waitForEvent('popup',{timeout:20000}),frame.getByRole('button',{name:'Meteor Web',exact:true}).click()]);
   await popup.waitForLoadState('domcontentloaded');if(new URL(popup.url()).origin!=='https://wallet.meteorwallet.app')throw Error('Unexpected wallet origin');await popup.close();
   await frame.getByRole('button',{name:'Close Meteor Connect',exact:true}).click();await page.waitForFunction(s=>!document.querySelector(s).disabled,selector,{timeout:45000});
   if(policyErrors.length)throw Error('Meteor resources blocked during retry');
   results.push({path,receivedFrames:sockets.reduce((n,s)=>n+s.receivedFrames,0),policyErrors:policyErrors.length,cancelAndRetry:true,webPopupOpened:true});
  }finally{page.off('websocket',socketHandler);page.off('console',consoleHandler);}
 }
 return results;
}
