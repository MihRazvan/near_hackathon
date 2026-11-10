import { randomUUID } from 'node:crypto';
import { assert, text, walletId } from './core.mjs';

const MAX_MESSAGES=50;
const MAX_QUEUE=100;

// In-app support is separate from campaign issues and every financial service.
// The configured arbiter can read/respond, without gaining the ticket owner's identity.
export class ServiceSupport {
 constructor({store,config,now=Date.now}){Object.assign(this,{store,config,now});}
 isAdmin(wallet){return !!this.config.defaultArbiter&&walletId(wallet)===walletId(this.config.defaultArbiter);}
 ticket(wallet,id){
  assert(typeof id==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(id),'NOT_FOUND','Support ticket not found',404);
  const actor=walletId(wallet),ticket=this.store.get('support',id);
  assert(ticket&&(ticket.owner===actor||this.isAdmin(actor)),'NOT_FOUND','Support ticket not found',404);
  return ticket;
 }
 replies(id){
  return this.store.db.prepare("SELECT id FROM objects WHERE kind='support-message' AND json_extract(data,'$.ticketId')=? ORDER BY CAST(json_extract(data,'$.sequence') AS INTEGER),created_at,id LIMIT ?").all(id,MAX_MESSAGES)
   .map(row=>this.store.get('support-message',row.id));
 }
 read(wallet,id){
  const ticket=this.ticket(wallet,id);
  return {...ticket,messages:[{id:'initial-'+ticket.id,owner:ticket.owner,role:'user',message:ticket.message,createdAt:ticket.createdAt},
   ...this.replies(ticket.id).map(reply=>({id:reply.id,owner:reply.owner,role:reply.role,message:reply.message,createdAt:reply.sentAt??reply.createdAt}))]};
 }
 queue(wallet){
  const actor=walletId(wallet);assert(this.isAdmin(actor),'SUPPORT_ADMIN_REQUIRED','Only the support administrator can open the support queue',403);
  const tickets=this.store.list('support').sort((a,b)=>Number(a.status==='closed')-Number(b.status==='closed')
   ||Date.parse(b.lastActivityAt??b.updatedAt)-Date.parse(a.lastActivityAt??a.updatedAt)||a.id.localeCompare(b.id)).slice(0,MAX_QUEUE);
  return tickets.map(ticket=>this.read(actor,ticket.id));
 }
 reply(wallet,id,input={}){
  const actor=walletId(wallet);
  assert(input&&typeof input==='object'&&!Array.isArray(input),'INVALID_SUPPORT_INPUT','Provide a support reply',400);
  return this.store.transaction(()=>{
   const ticket=this.ticket(actor,id);
   assert(Number.isSafeInteger(input.version)&&input.version>0,'INVALID_VERSION','Use the current support ticket version',400);
   assert(input.version===ticket.version,'STALE_VERSION','This ticket changed. Refresh it before replying.',409);
   const hasStatus=Object.hasOwn(input,'closed');
   assert(!hasStatus||typeof input.closed==='boolean','INVALID_STATUS','Choose whether this ticket is closed',400);
   assert(input.message===undefined||typeof input.message==='string','INVALID_TEXT','Support reply must be text',400);
   const message=input.message?.trim()?text(input.message,'support reply',2000):'';
   assert(message||hasStatus,'INVALID_TEXT','Write a reply or choose a ticket status',400);
   assert(input.message===undefined||input.message.length<=2000,'INVALID_TEXT','Support reply must be at most 2000 characters',400);
   const replies=this.replies(id);
   assert(!message||replies.length+1<MAX_MESSAGES,'SUPPORT_MESSAGE_LIMIT','This ticket has reached its message limit. You can still update its status.',429);
   const timestamp=new Date(this.now()).toISOString(),role=actor===ticket.owner?'user':'admin';
   if(message)this.store.insert('support-message',randomUUID(),actor,{ticketId:id,role,message,sequence:replies.length+1,sentAt:timestamp});
   const status=hasStatus?(input.closed?'closed':'open'):ticket.status;
   this.store.update('support',id,ticket.owner,ticket.version,{...ticket,status,lastActivityAt:timestamp});
   this.store.event(message?'support_replied':'support_status_changed',id,actor,{role,status});
   return this.read(actor,id);
  });
 }
}
export { ServiceSupport as Support };
