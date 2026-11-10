import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.document={querySelector:()=>null};
globalThis.location={pathname:'/explore',search:''};
const {live}=await import('../src/integration/runtime.mjs');
const {publicView}=await import('../src/integration/public.mjs');
const {buyerView}=await import('../src/integration/buyer.mjs');
const now=1800000000000,ns=ms=>(BigInt(ms)*1000000n).toString(),wallet='0x1111111111111111111111111111111111111111';
function setup(){
 location.search='';const asset={id:'asset',title:'City van',description:'Delivery van',city:'Bucharest',assetType:'van',spots:[{id:'door',name:'Side door',suggestedPriceCents:1,box:{x:.2,y:.2,width:.2,height:.2}}]};
 const sale={id:'sale',assetId:'asset',owner:'owner.near',title:'December campaign',createdAt:new Date(now).toISOString(),status:'published',rules:'No restricted content',publication:{manifest:{asset}},schedule:{biddingClose:new Date(now+60000).toISOString(),serviceStart:new Date(now+120000).toISOString(),serviceEnd:new Date(now+180000).toISOString()},spots:[{id:'door',contractId:'offer',takeoverEnabled:true}]};
 const snapshot={accountId:'offer',state:{outcome:'open',cutoff_ns:ns(now+60000),next_price:'10000',holder:null,nft_minted:false,refund_end_ns:ns(now+240000)},rights:{bidding_closed:false,current_owner_id:null,active:false},campaign:{terms:{sale_id:'sale',artwork_due_ns:ns(now+90000)},delivery_proof:null},credits:{}};
 Object.assign(live,{config:{production:true,sandbox:false},session:{wallet,kind:'evm'},catalog:{time:new Date(now).toISOString(),sales:[sale],snapshots:[snapshot],owners:[]},balances:{intentsUsdc:'0',baseUsdc:'1000000'},data:{dashboard:{bookings:[],campaigns:[],incomingBookings:[],sales:[]},placements:[],saved:[],requests:[],intents:[],routes:[]}});
 return {sale,snapshot};
}
test('marketplace hides stale bookable prices and preserves campaign choice through listing navigation',()=>{
 const {snapshot}=setup();location.search='?campaign=brand';let html=publicView({id:'P02'});assert.match(html,/name="campaign" value="brand"/);assert.match(html,/campaign=brand/);assert.match(html,/0\.01 USDC/);
 snapshot.state.cutoff_ns=ns(now-1);html=publicView({id:'P02'});assert.doesNotMatch(html,/0\.01 USDC/);assert.match(html,/No spaces match/);
 html=publicView({id:'P03',params:{slug:'asset'}});assert.doesNotMatch(html,/Book this spot/);assert.doesNotMatch(html,/0\.01 USDC/);
});
test('checkout funds the exact chosen spot while existing holdings cannot be purchased twice',()=>{
 const {snapshot}=setup();location.search='?spot=door';let html=buyerView({id:'B06',params:{intentId:'sale'}});assert.match(html,/data-live-action="fund-and-book" data-sale="sale" data-spot="door"/);assert.match(html,/data-live-form="prepare-booking"/);
 snapshot.state.holder={account_id:wallet};html=buyerView({id:'B06',params:{intentId:'sale'}});assert.match(html,/You already have this spot/);assert.doesNotMatch(html,/fund-and-book/);
});
test('production artwork uses the same EVM payer and never exposes manual nomination',()=>{
 const {snapshot}=setup();snapshot.state.holder={account_id:wallet};snapshot.rights.bidding_closed=true;live.data.placements=[snapshot];
 const html=buyerView({id:'B08',params:{id:'offer'}});assert.match(html,/data-live-form="artwork"/);assert.doesNotMatch(html,/Nominate NFT recipient|Accept NFT nomination|Mint final placement NFT/);assert.match(html,/handled automatically/);
});
test('pending payments never invite another transfer after quote expiry',()=>{
 setup();live.data.dashboard.bookings=[{id:'booking',contractId:'offer',saleId:'sale',spotId:'door',owner:wallet,amount:'10000',planId:'plan',accepted:false,status:'prepared'}];live.data.requests=[{planId:'plan',status:'submitted',createdAt:new Date(now).toISOString()}];live.data.intents=[{id:'plan',expiresAt:new Date(now-1).toISOString()}];
 const html=buyerView({id:'B07',params:{id:'booking'}});assert.match(html,/payment is being checked/);assert.doesNotMatch(html,/data-live-action="pay-booking"/);assert.doesNotMatch(html,/data-live-action="cancel-booking"/);
});
