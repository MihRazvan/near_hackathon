import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.mjs';
import { ServiceSupport } from '../src/support.mjs';

const owner='customer.near',admin='0x'+'11'.repeat(20),stranger='stranger.near';
function seed(store,id='ticket',wallet=owner){return store.insert('support',id,wallet,{subject:'Printing question',message:'How should I prepare the artwork?',status:'open'});}
function service(store,config={defaultArbiter:admin}){let now=Date.now();return new ServiceSupport({store,config,now:()=>++now});}

test('only the original sender and exact configured support administrator can read and respond',()=>{
 const store=new Store(),support=service(store);seed(store);
 try{assert.equal(support.isAdmin(admin.toUpperCase().replace('0X','0x')),true);assert.equal(support.isAdmin('0x'+'12'.repeat(20)),false);assert.equal(support.isAdmin(owner),false);
  assert.throws(()=>support.read(stranger,'ticket'),{code:'NOT_FOUND'});assert.throws(()=>support.queue(owner),{code:'SUPPORT_ADMIN_REQUIRED'});assert.throws(()=>support.reply(stranger,'ticket',{version:1,message:'Intercept'}),{code:'NOT_FOUND'});assert.equal(store.list('support-message').length,0);
  const initial=support.read(owner,'ticket');assert.equal(initial.messages.length,1);assert.equal(initial.messages[0].owner,owner);assert.equal(support.queue(admin)[0].id,'ticket');
  const answered=support.reply(admin,'ticket',{version:initial.version,message:'Please upload the print-ready PDF.',closed:true,owner:stranger,recipientId:stranger});assert.equal(answered.owner,owner);assert.equal(answered.status,'closed');assert.equal(answered.messages[1].owner,admin);assert.equal(answered.messages[1].role,'admin');assert.equal(support.read(owner,'ticket').messages[1].message,'Please upload the print-ready PDF.');
  const reopened=support.reply(owner,'ticket',{version:answered.version,message:'Uploaded. Could you check the dimensions?',closed:false});assert.equal(reopened.status,'open');assert.equal(reopened.owner,owner);assert.equal(reopened.messages[2].role,'user');assert.equal(support.read(admin,'ticket').messages.length,3);assert.equal(store.list('issue').length,0);assert.equal(store.list('booking').length,0);assert.equal(store.db.prepare('SELECT COUNT(*) count FROM operations').get().count,0);
 }finally{store.close();}
});

test('native and EVM admin identities are exact; treasury wallets and former admins do not inherit support access',()=>{
 const store=new Store();seed(store);
 try{const native=service(store,{defaultArbiter:'support.near',treasury:'treasury.near'});assert.equal(native.isAdmin('support.near'),true);assert.equal(native.isAdmin('support.near.evil'),false);assert.throws(()=>native.read('treasury.near','ticket'),{code:'NOT_FOUND'});assert.throws(()=>native.read(admin,'ticket'),{code:'NOT_FOUND'});assert.equal(native.queue('support.near').length,1);
  const disabled=service(store,{});assert.equal(disabled.isAdmin(owner),false);assert.throws(()=>disabled.queue('support.near'),{code:'SUPPORT_ADMIN_REQUIRED'});assert.equal(disabled.read(owner,'ticket').owner,owner);
 }finally{store.close();}
});

test('status flags, message size and optimistic versions are validated before storing any reply',()=>{
 const store=new Store(),support=service(store);seed(store);
 try{for(const input of [{version:1,message:'A'.repeat(2001)},{version:1,message:'Reply',closed:'false'},{version:1,message:'Reply',closed:null},{version:'1',message:'Reply'},{version:1,message:''},{version:1,message:42,closed:true}])assert.throws(()=>support.reply(owner,'ticket',input));
  assert.equal(store.list('support-message').length,0);assert.equal(store.get('support','ticket').version,1);
  const closed=support.reply(owner,'ticket',{version:1,closed:true});assert.equal(closed.status,'closed');assert.equal(closed.messages.length,1);assert.equal(closed.version,2);
  assert.throws(()=>support.reply(admin,'ticket',{version:1,message:'Stale answer',closed:false}),{code:'STALE_VERSION'});assert.equal(store.list('support-message').length,0);assert.equal(store.get('support','ticket').status,'closed');
  const exact=support.reply(admin,'ticket',{version:2,message:'A'.repeat(2000)});assert.equal(exact.messages[1].message.length,2000);assert.equal(exact.status,'closed');
 }finally{store.close();}
});

test('message history is bounded at 50, while sender and admin can still close or reopen a full ticket',()=>{
 const store=new Store(),support=service(store);let ticket=seed(store);
 try{for(let i=0;i<49;i++)ticket=support.reply(i%2?admin:owner,'ticket',{version:ticket.version,message:'Reply '+i});assert.equal(ticket.messages.length,50);
  assert.throws(()=>support.reply(owner,'ticket',{version:ticket.version,message:'Overflow'}),{code:'SUPPORT_MESSAGE_LIMIT'});assert.equal(store.list('support-message').length,49);
  ticket=support.reply(admin,'ticket',{version:ticket.version,closed:true});assert.equal(ticket.status,'closed');ticket=support.reply(owner,'ticket',{version:ticket.version,message:'',closed:false});assert.equal(ticket.status,'open');assert.equal(ticket.messages.length,50);
 }finally{store.close();}
});

test('two database connections preserve recipient ownership and reject a stale reply without partial message insertion',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'everywhere-support-')),a=new Store(join(dir,'state.sqlite')),b=new Store(join(dir,'state.sqlite'));seed(a);
 try{const first=service(a),second=service(b),view=second.read(admin,'ticket');first.reply(owner,'ticket',{version:1,message:'New detail'});assert.throws(()=>second.reply(admin,'ticket',{version:view.version,message:'Outdated answer',closed:true}),{code:'STALE_VERSION'});assert.equal(a.list('support-message').length,1);assert.equal(a.get('support','ticket').status,'open');assert.equal(b.get('support','ticket').owner,owner);
  const fresh=second.read(admin,'ticket');assert.equal(second.reply(admin,'ticket',{version:fresh.version,message:'Thanks for the detail',closed:true}).messages.length,3);
 }finally{a.close();b.close();await rm(dir,{recursive:true,force:true});}
});
