import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.document={querySelector:()=>null};
globalThis.location={pathname:'/settings/workspace',search:'?tab=brand'};
const {live}=await import('../src/integration/runtime.mjs');
const {accountView,sharedView,opsView}=await import('../src/integration/shared.mjs');
const {buyerView}=await import('../src/integration/buyer.mjs');
const {createWorkspaceForms}=await import('../src/integration/workspace-actions.mjs');
const A='0x'+'11'.repeat(20),B='0x'+'22'.repeat(20),OWNER='owner.near',ADMIN='arbiter.near',CID='baf'+'a'.repeat(45),now=1800000000000,ns=n=>String(BigInt(n)*1000000n);
function setup(wallet=A){
 location.search='';const sale={id:'sale',title:'City vehicle campaign',owner:OWNER,schedule:{},publication:{manifest:{asset:{title:'City van'}}}},snap={accountId:'offer',mode:'hub',state:{outcome:'open',holder:{account_id:B},seller_id:OWNER,arbiter_id:ADMIN,nft_minted:true,artwork_locked:false,cutoff_ns:ns(now-1000),refund_end_ns:ns(now+60000)},rights:{current_owner_id:B,bidding_closed:true,active:true},campaign:{terms:{sale_id:'sale',artwork_due_ns:ns(now+30000)},delivery_proof:null,open_issues:0,issues:{}},credits:{}};
 const original={id:'booking-a',saleId:'sale',contractId:'offer',owner:A,sellerId:OWNER,status:'outbid',accepted:true,amount:'10000'};
 Object.assign(live,{config:{production:true,sandbox:false,publicationMode:'hub',defaultArbiter:ADMIN},session:{wallet},catalog:{sales:[sale],snapshots:[snap],time:new Date(now).toISOString()},data:{profile:{displayName:'Customer',brand:'ACME',city:'Bucharest',defaultWorkspace:'buyer',notifications:true},dashboard:{bookings:[original],incomingBookings:[],campaigns:[],sales:[]},placements:[snap],media:[],messages:[],placementMessages:[],support:[],supportQueue:[],supportAdmin:false,issues:[],events:[],arbiterSales:[],requests:[]}});
 return {sale,snap,original};
}
function form(values={}){const data=new FormData();for(const [key,value]of Object.entries(values))data.set(key,value);return data;}
function transport(){const calls=[],uploads=[],notices=[];const forms=createWorkspaceForms({request:async(...args)=>{calls.push(args);return{};},uploadFile:async(...args)=>{uploads.push(args);return{id:'verified'};},refreshWorkspace:async opts=>{calls.push(['refresh',opts]);},showToast:message=>notices.push(message),getLive:()=>live});return {forms,calls,uploads,notices};}

test('saved files open only an authorized reservation and do not submit or approve artwork',async()=>{
 const {original,snap}=setup(B);original.owner=B;original.status='accepted';live.data.media=[{id:'logo',owner:B,status:'verified',public:true,mime:'image/jpeg',uri:'ipfs://'+CID}];
 const navigated=[],forms=createWorkspaceForms({getLive:()=>live,go:url=>navigated.push(url),request:()=>{throw Error('Choosing a file must not send a transaction');}});
 const html=accountView({id:'S05'});assert.match(html,/Saved to your library/);assert.match(html,/Use for a reservation/);assert.match(html,/value="booking-a"/);
 await forms['choose-artwork-reservation'](form({mediaId:'logo',placementId:'booking-a'}));assert.deepEqual(navigated,['/profile/placements/booking-a?artwork=logo#artwork']);
 snap.rights.current_owner_id=A;await assert.rejects(forms['choose-artwork-reservation'](form({mediaId:'logo',placementId:'booking-a'})),/current reservation/);
 live.session.wallet=A;await assert.rejects(forms['choose-artwork-reservation'](form({mediaId:'logo',placementId:'offer'})),/belonging to this wallet/);
});

test('a saved image is visibly selected and a submitted revision remains visible beside its update form',()=>{
 const {original,snap}=setup(B);original.owner=B;original.status='accepted';const sha256='ab'.repeat(32),uri='ipfs://'+CID;
 live.data.media=[{id:'logo',owner:B,status:'verified',public:true,mime:'image/jpeg',uri,sha256}];location.search='?artwork=logo';
 let html=buyerView({id:'B08',params:{id:'booking-a'}});assert.match(html,/<option value="logo" selected>/);assert.match(html,/Selected file · not submitted yet/);assert.match(html,/<img[^>]*alt="Selected file/);
 snap.rights.proposal={artifact_uri:uri,artifact_sha256:Buffer.from(sha256,'hex').toString('base64'),revision:'1'};
 html=buyerView({id:'B08',params:{id:'booking-a'}});assert.match(html,/<img[^>]*alt="Submitted artwork/);assert.match(html,/Send updated artwork/);
 snap.state.artwork_locked=true;html=buyerView({id:'B08',params:{id:'booking-a'}});assert.match(html,/<img[^>]*alt="Approved artwork"/);assert.doesNotMatch(html,/data-live-form="artwork"/);
 snap.rights.proposal.artifact_sha256=Buffer.alloc(32,1).toString('base64');location.search='';html=buyerView({id:'B08',params:{id:'booking-a'}});assert.doesNotMatch(html,/<img[^>]*alt="Approved artwork"/);
});

test('selecting a saved file before bookings close previews it without exposing an artwork submission',()=>{
 const {original,snap}=setup(B);original.owner=B;original.status='accepted';snap.state.nft_minted=false;snap.rights.bidding_closed=false;snap.rights.active=false;snap.rights.current_owner_id=null;
 live.data.media=[{id:'logo',owner:B,status:'verified',public:true,mime:'image/jpeg',uri:'ipfs://'+CID}];location.search='?artwork=logo';
 const html=buyerView({id:'B08',params:{id:'booking-a'}});assert.match(html,/Saved file · submit it after booking closes/);assert.doesNotMatch(html,/data-live-form="artwork"/);
});

test('brand library shows only this wallet’s public verified assets and keeps upload consent explicit',()=>{
 setup();live.data.media=[{id:'own',owner:A,status:'verified',public:true,mime:'image/png',uri:'ipfs://'+CID,bytes:1234,createdAt:new Date(now).toISOString()},{id:'other',owner:B,status:'verified',public:true,mime:'image/png',uri:'ipfs://baf'+'b'.repeat(45)},{id:'private',owner:A,status:'verified',public:false,mime:'image/png',uri:'ipfs://baf'+'c'.repeat(45)},{id:'pending',owner:A,status:'uploaded',public:true,mime:'image/png',uri:'ipfs://baf'+'d'.repeat(45)}];
 const html=accountView({id:'S05'});assert.match(html,/data-live-form="brand-upload"/);assert.match(html,/name="public"/);assert.match(html,new RegExp(CID));assert.match(html,/<img/);assert.doesNotMatch(html,new RegExp('baf'+'b'.repeat(45)));assert.doesNotMatch(html,new RegExp('baf'+'c'.repeat(45)));assert.doesNotMatch(html,new RegExp('baf'+'d'.repeat(45)));
});
test('saved verified media can be selected for artwork and booked placement messages use the original booking ID',()=>{
 const {original}=setup(B);original.owner=B;original.status='accepted';live.data.media=[{id:'saved-logo',owner:B,status:'verified',public:true,mime:'image/png',uri:'ipfs://'+CID,sha256:'ab'.repeat(32)},{id:'foreign-logo',owner:A,status:'verified',public:true,mime:'image/png',uri:'ipfs://'+CID}];
 const html=buyerView({id:'B08',params:{id:original.id}});assert.match(html,/name="mediaId"/);assert.match(html,/value="saved-logo"/);assert.doesNotMatch(html,/foreign-logo/);assert.match(html,/href="\/inbox\/booking-a"/);
});
test('a displaced buyer keeps the original booking conversation and cannot open the current artwork conversation',()=>{
 setup();live.data.messages=[{bookingId:'booking-a',owner:A,text:'Original buyer private note',createdAt:new Date(now).toISOString()},{bookingId:'booking-b',owner:B,text:'Other booking secret'}];live.data.placementMessages=[{contractId:'offer',owner:B,text:'Current advertiser artwork secret'}];
 let html=sharedView({id:'S01'});assert.match(html,/\/inbox\/booking-a/);assert.doesNotMatch(html,/href="\/inbox\/offer"/);
 html=sharedView({id:'S02',params:{threadId:'booking-a'}});assert.match(html,/Original buyer private note/);assert.match(html,/data-live-form="booking-message"/);assert.doesNotMatch(html,/Other booking secret|Current advertiser artwork secret/);
 html=sharedView({id:'S02',params:{threadId:'offer'}});assert.match(html,/conversation not found/);assert.doesNotMatch(html,/Current advertiser artwork secret|data-live-form="message"/);
});
test('the current NFT controller can use the artwork thread while unpaid drafts are not conversations',()=>{
 const {original}=setup(B);original.accepted=false;original.status='prepared';original.owner=B;live.data.placementMessages=[{contractId:'offer',owner:OWNER,text:'Current delivery discussion'}];
 const inbox=sharedView({id:'S01'});assert.doesNotMatch(inbox,/href="\/inbox\/booking-a"/);assert.match(inbox,/href="\/inbox\/offer"/);
 const html=sharedView({id:'S02',params:{threadId:'offer'}});assert.match(html,/Current delivery discussion/);assert.match(html,/data-live-form="message"/);
});
test('notification preferences preserve the profile and hiding notifications leaves the activity feed paused',async()=>{
 setup();const t=transport();await t.forms['notification-preferences'](form());assert.deepEqual(t.calls[0],['profile',{displayName:'Customer',brand:'ACME',city:'Bucharest',defaultWorkspace:'buyer',notifications:false},{method:'PATCH'}]);
 live.data.profile.notifications=false;live.data.events=[{kind:'private_account_activity',entity_id:'hidden-event'}];assert.match(accountView({id:'S07'}),/data-live-form="notification-preferences"/);const html=sharedView({id:'S03'});assert.match(html,/notifications are paused/);assert.doesNotMatch(html,/hidden-event/);
});
test('brand upload uses the public artifact path only after acknowledgement and booking messages use the booking endpoint',async()=>{
 setup();const t=transport(),file=new File(['synthetic bytes'],'brand.png',{type:'image/png'});await assert.rejects(t.forms['brand-upload'](form({file})),/permission/);assert.equal(t.uploads.length,0);
 await t.forms['brand-upload'](form({file,public:'on'}));assert.equal(t.uploads[0][0],file);assert.deepEqual(t.uploads[0][1],{acknowledged:true});
 await t.forms['booking-message'](form({bookingId:'booking-a',message:'Please explain the refund.'}));assert.ok(t.calls.some(c=>c[0]==='bookings/booking-a/messages'));assert.equal(t.calls.some(c=>String(c[0]).startsWith('placements/')),false);
 live.session.wallet=B;await assert.rejects(t.forms['booking-message'](form({bookingId:'booking-a',message:'Wrong wallet'})),/belonging/);
});
test('support history renders once with replies and current version, and only the configured support admin sees the queue',async()=>{
 setup();const ticket={id:'ticket',owner:A,subject:'Help with my booking',message:'Original question',status:'open',version:3,messages:[{owner:A,role:'user',message:'Original question',createdAt:new Date(now).toISOString()},{owner:ADMIN,role:'admin',message:'Support response',createdAt:new Date(now).toISOString()}]};live.data.support=[ticket];
 let html=sharedView({id:'S10',params:{id:'ticket'}});assert.equal((html.match(/Original question/g)??[]).length,1);assert.match(html,/Support response/);assert.match(html,/name="version" value="3"/);assert.match(html,/data-live-form="support-reply"/);
 const t=transport();await t.forms['support-reply'](form({ticketId:'ticket',version:'3',message:'Thanks',status:'closed'}));assert.deepEqual(t.calls[0],['support/ticket/reply',{message:'Thanks',version:3,closed:true}]);
 live.data.support=[];live.data.supportQueue=[ticket];live.data.supportAdmin=true;assert.doesNotMatch(opsView({id:'M01'}),/Help with my booking/);
 live.session.wallet=ADMIN;html=opsView({id:'M01'});assert.match(html,/Help with my booking/);assert.doesNotMatch(html,/data-live-action="finalize/);assert.match(sharedView({id:'S10',params:{id:'ticket'}}),/Support response/);
});
test('support case controls stay unavailable to another customer and allow a versioned status-only reopen by its owner',async()=>{
 setup();live.data.support=[{id:'ticket',owner:A,status:'closed',version:4,messages:[]}];const t=transport();await t.forms['support-reply'](form({ticketId:'ticket',version:'4',message:'',status:'open'}));assert.deepEqual(t.calls[0],['support/ticket/reply',{message:'',version:4,closed:false}]);
 live.session.wallet=B;assert.match(sharedView({id:'S10',params:{id:'ticket'}}),/not found/);await assert.rejects(t.forms['support-reply'](form({ticketId:'ticket',version:'4',message:'Intrude',status:'open'})),/available to this wallet/);
});
