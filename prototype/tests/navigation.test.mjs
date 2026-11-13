import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalDestination,matchRoute} from '../src/routes.mjs';
import {siteHeader,accountArea} from '../src/shell.mjs';
globalThis.document={querySelector:()=>null};
globalThis.location={pathname:'/host',search:''};
const {live}=await import('../src/integration/runtime.mjs');
const {ownerView}=await import('../src/integration/owner.mjs');
const {buyerView}=await import('../src/integration/buyer.mjs');
const now=1800000000000,ns=ms=>String(BigInt(ms)*1000000n),wallet='owner.near';
function setup(){
 const a={id:'van',owner:wallet,title:'Dublin van',city:'Dublin',spots:[{id:'door',name:'Door panel',box:{x:.2,y:.3,width:.4,height:.2}},{id:'rear',name:'Rear panel',box:{x:.1,y:.2,width:.2,height:.2}}]};
 const s={id:'sale',owner:wallet,assetId:a.id,title:'City campaign',status:'published',schedule:{serviceStart:new Date(now).toISOString(),serviceEnd:new Date(now+50000).toISOString()},spots:[{id:'door',contractId:'door-offer'},{id:'rear',contractId:'rear-offer'}],publication:{manifest:{asset:a}}};
 const snapshots=s.spots.map((p,i)=>({accountId:p.contractId,mode:'hub',state:{seller_id:wallet,outcome:'open',cutoff_ns:ns(now-1000),refund_end_ns:ns(now+60000),holder:{account_id:'buyer.near'},potential_seller_revenue:'10000',artwork_locked:i===1,nft_minted:true},rights:{active:true,bidding_closed:true,current_owner_id:'buyer.near',proposal:i===0?{revision:'1'}:null},campaign:{terms:{sale_id:s.id,artwork_due_ns:ns(now+20000),service_end_ns:ns(now+50000)},delivery_proof:null},credits:{}}));
 Object.assign(live,{config:{production:true,publicationMode:'hub'},session:{wallet},catalog:{sales:[s],snapshots,time:new Date(now).toISOString()},data:{chainPending:false,profile:{displayName:'Owner'},dashboard:{assets:[a],sales:[s],bookings:[],campaigns:[],incomingBookings:[]},placements:[],saved:[],requests:[],operations:[],media:[],publicationPlans:[],provisionPlans:[]}});
 return {a,s,snapshots};
}
test('one header connects marketplace, dashboard and profile without buyer/owner switching or unused account menus',()=>{
 const html=siteHeader({session:{wallet},area:'dashboard'});
 assert.equal((html.match(/aria-current="page"/g)??[]).length,2); // desktop + mobile
 for(const label of ['Marketplace','Dashboard','Profile'])assert.match(html,new RegExp('>'+label+'<'));
 assert.doesNotMatch(html,/Buy space|Inbox|Notifications|Settings|sidebar|workspace-switch/);
 assert.equal(accountArea({scope:'owner'}),'dashboard');assert.equal(accountArea({scope:'buyer'}),'profile');
});
test('old aggregate and account routes resolve to useful sections while record IDs and checkout return paths survive',()=>{
 for(const [from,to] of [['/host/assets','/host#vehicles'],['/host/calendar','/host#campaigns'],['/host/earnings','/host#earnings'],['/buy','/profile'],['/buy/saved','/profile#saved'],['/settings/profile','/profile#details'],['/buy/money?next=%2Fcheckout%2Fmy-sale','/profile/balance?next=%2Fcheckout%2Fmy-sale'],['/buy/placements/original-id','/profile/placements/original-id'],['/inbox','/profile#orders']])assert.equal(canonicalDestination(from),to);
 assert.equal(matchRoute('/buy/placements/original-id').params.id,'original-id');assert.equal(matchRoute('/inbox/original-booking').id,'S02');
});
test('first-time owners see creation, then resume saved vehicle drafts without empty statistics or earnings',()=>{
 setup();live.data.dashboard.sales=[];live.data.dashboard.assets=[];
 let html=ownerView({id:'O01'});assert.match(html,/first-campaign-title/);assert.match(html,/mode=photo/);assert.match(html,/mode=describe/);assert.doesNotMatch(html,/Your earnings|Your campaigns|Calendar|Performance/);
 const {a}=setup();live.data.dashboard.sales=[];
 html=ownerView({id:'O01'});assert.match(html,/Finish your first campaign/);assert.match(html,new RegExp('/host/assets/'+a.id+'/review'));assert.doesNotMatch(html,/id="earnings"|id="vehicles"/);
});
test('one owner campaign shows independent next steps for both placements and retains earning claims',()=>{
 setup();let html=ownerView({id:'O01'});
 assert.match(html,/Door panel/);assert.match(html,/Rear panel/);assert.match(html,/Review artwork/);assert.match(html,/Add installation evidence/);assert.match(html,/contract=door-offer/);assert.match(html,/contract=rear-offer/);assert.match(html,/id="earnings"/);
 live.data.chainPending=true;html=ownerView({id:'O01'});assert.match(html,/Checking campaign balances/);assert.doesNotMatch(html,/data-live-action="owner-payout"/);
});
test('profile combines bookings, saved spaces and details while only the current NFT controller receives its card',()=>{
 const {s,snapshots}=setup();live.session.wallet='buyer.near';live.data.saved=[{saleId:s.id,saved:true}];live.data.placements=snapshots;
 let html=buyerView({id:'B01'});assert.match(html,/id="orders"/);assert.match(html,/id="saved"/);assert.match(html,/name="displayName"/);assert.match(html,/href="\/profile\/balance"/);assert.match(html,/Your placement NFTs/);assert.equal((html.match(/<h1/g)??[]).length,1);
 snapshots.forEach(s=>s.rights.current_owner_id='studio.near');html=buyerView({id:'B01'});assert.doesNotMatch(html,/Your placement NFTs/);assert.doesNotMatch(html,/Default workspace|Show account notifications/);
});
