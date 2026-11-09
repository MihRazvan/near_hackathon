import { NearConnector } from '@hot-labs/near-connect';

export class ExternalWallets {
 constructor(onChange){this.onChange=onChange;this.providers=new Map();
  window.addEventListener('eip6963:announceProvider',event=>{const d=event.detail;if(d?.info?.uuid&&d.provider?.request){this.providers.set(d.info.uuid,d);this.onChange();}});
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  if(window.ethereum?.request)this.providers.set('injected',{info:{uuid:'injected',name:'Browser wallet'},provider:window.ethereum});
 }
 list(){return [...this.providers.values()].map(({info})=>({id:info.uuid,name:info.name}));}
 async connectEvm(id){
  this.provider?.removeListener?.('accountsChanged',this.listener);
  this.provider?.removeListener?.('disconnect',this.listener);
  this.provider=this.providers.get(id)?.provider;if(!this.provider)throw new Error('Select an installed EVM wallet');
  const accounts=await this.provider.request({method:'eth_requestAccounts'});if(!accounts[0])throw new Error('Wallet returned no account');
  this.address=accounts[0].toLowerCase();this.listener=()=>{this.address=null;this.onChange(true);};
  this.provider.on?.('accountsChanged',this.listener);this.provider.on?.('disconnect',this.listener);
  return this.address;
 }
 async signEvm(message,address){
  const accounts=await this.provider.request({method:'eth_accounts'});
  if(accounts[0]?.toLowerCase()!==address)throw new Error('Wallet changed; reconnect before signing');
  const bytes=new TextEncoder().encode(message),hex='0x'+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  const signature=await this.provider.request({method:'personal_sign',params:[hex,address]});
  const current=await this.provider.request({method:'eth_accounts'});
  if(current[0]?.toLowerCase()!==address)throw new Error('Wallet changed during approval; the signature was not submitted');
  return signature;
 }
 async ensureBase(address){
  if(!this.provider)throw new Error('Reconnect your EVM wallet app before approving a Base transfer');
  const accounts=await this.provider.request({method:'eth_accounts'});
  if(accounts[0]?.toLowerCase()!==address)throw new Error('Wallet changed; reconnect the original funding account');
  if(Number(await this.provider.request({method:'eth_chainId'}))!==8453)await this.provider.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x2105'}]});
  if(Number(await this.provider.request({method:'eth_chainId'}))!==8453)throw new Error('Select Base mainnet in your wallet');
  const current=await this.provider.request({method:'eth_accounts'});if(current[0]?.toLowerCase()!==address)throw new Error('Wallet changed before funding');
 }
 async sendBase(transaction){await this.ensureBase(transaction.from);return this.provider.request({method:'eth_sendTransaction',params:[transaction]});}
 async connectNear(network){
  this.connector??=new NearConnector({network,autoConnect:false,cspNonce:document.querySelector('meta[name="lab-csp-nonce"]')?.content,features:{signInWithoutAddKey:true,signAndSendTransaction:true,signMessage:true}});
  this.native=await this.connector.connect({walletId:'meteor-wallet'});
  const accounts=await this.native.getAccounts({network});if(!accounts[0])throw new Error('NEAR wallet returned no account');
  this.nearAddress=accounts[0].accountId;return this.nearAddress;
 }
 async assertNear(address,network){const accounts=await this.native.getAccounts({network});if(!accounts.some(a=>a.accountId===address))throw new Error('NEAR wallet changed; reconnect before continuing');}
 async signNear(challenge,address,network){
  await this.assertNear(address,network);
  const signed=await this.native.signMessage({message:challenge.message,nonce:Uint8Array.from(atob(challenge.nonce),c=>c.charCodeAt(0)),recipient:location.host,network,signerId:address});
  if(signed.accountId!==address)throw new Error('NEAR signature came from a different account');return signed;
 }
 async sendNear(transaction,network){await this.assertNear(transaction.signerId,network);const result=await this.native.signAndSendTransaction({...transaction,network});
  return {transactionHash:result.transaction?.hash??result.transaction_outcome?.id};}
}
