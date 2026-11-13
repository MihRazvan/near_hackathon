// Layout history is scoped to a wallet and vehicle. It never includes campaign terms.
const histories=new Map();
const history=(wallet,id)=>{const key=wallet+':'+id;if(!histories.has(key))histories.set(key,{past:[],future:[]});return histories.get(key);};
export function pushEditorHistory(wallet,asset){const h=history(wallet,asset.id);h.past.push(structuredClone(asset));if(h.past.length>20)h.past.shift();h.future=[];}
export function editorHistoryState(wallet,id){const h=history(wallet,id);return {undo:h.past.length>0,redo:h.future.length>0};}
export function restoreEditorHistory(wallet,current,direction){
 const h=history(wallet,current.id),source=direction==='redo'?h.future:h.past,target=direction==='redo'?h.past:h.future;
 const next=source.pop();if(!next)return null;target.push(structuredClone(current));return {...next,version:current.version};
}
