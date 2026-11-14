import {esc} from '../ui.mjs';
const decimal=value=>{const n=BigInt(value),whole=n/1000000n,fraction=(n%1000000n).toString().padStart(6,'0').replace(/0+$/,'');return whole+'.'+fraction.padEnd(2,'0');};
const actions={create_offer:'Publish an advertising spot',submit_artwork:'Submit artwork',lock_artwork:'Approve artwork for printing',submit_delivery_proof:'Submit installation evidence',transfer_placement:'Transfer artwork control',mint_final_placement:'Create the final placement NFT',open_issue:'Open a campaign issue',record_issue_decision:'Record an issue decision',finalize_success:'Settle the completed campaign',finalize_failure:'Cancel the campaign',cancel_empty_offer:'Close an unreserved spot'};
// Read the signed bytes, not the server's descriptive context. This is a
// readable companion to the wallet request, not a replacement authorization.
export function signatureDetails(plan,{usdcToken}={}){
 const payload=JSON.parse(plan.message);
 if(payload.signer_id!==plan.signerId||payload.verifying_contract!==plan.verifier||payload.deadline!==plan.expiresAt||!Array.isArray(payload.intents)||payload.intents.length!==1)throw new Error('The signature request changed. Refresh before signing.');
 const intent=payload.intents[0],rows=[['Account',payload.signer_id]],expiry=new Date(payload.deadline);
 let title='Review the request in your wallet';
 if(intent.intent==='transfer'){
  const entries=Object.entries(intent.tokens??{});
  if(entries.length===1&&entries[0][0]===usdcToken&&/^\d+$/.test(entries[0][1]))title='Authorize '+decimal(entries[0][1])+' USDC';
  rows.push(['To',intent.receiver_id]);
 }else if(intent.intent==='auth_call'){
  const call=JSON.parse(intent.msg);title=actions[call.action]??'Authorize a contract action';rows.push(['Contract',intent.contract_id]);
  if(call.receiver_id)rows.push(['New artwork controller',call.receiver_id]);
  if(call.artifact_uri)rows.push(['Submitted file',call.artifact_uri]);
  if(call.expected_revision!==undefined)rows.push(['Artwork revision',String(call.expected_revision)]);
 }else if(intent.intent==='ft_withdraw'){
  title='Authorize a withdrawal';if('nep141:'+intent.token===usdcToken&&/^\d+$/.test(intent.amount))rows.push(['Amount',decimal(intent.amount)+' USDC']);rows.push(['To',intent.receiver_id]);
 }
 if(Number.isFinite(expiry.getTime()))rows.push(['Expires',expiry.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})]);
 return {title,rows,raw:plan.message};
}
export function signatureMarkup(plan,options){
 const {title,rows,raw}=signatureDetails(plan,options);
 return `<div class="signature-summary"><h2>${esc(title)}</h2><p>Approve this action in your wallet. It may display the signed request as JSON.</p><details><summary>Signature details</summary><dl class="data-list">${rows.map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl><details><summary>Exact message being signed</summary><pre class="transaction-review">${esc(raw)}</pre></details></details></div>`;
}
