import {api,live} from './runtime.mjs';
export function createCapacityReader({request=api,now=Date.now,session=()=>live.session}={}){
 const cache=new WeakMap();
 return function capacity({force=false,background=true}={}){
  const owner=session();if(!owner)throw new Error('Connect your wallet to check publication availability.');
  const previous=cache.get(owner);
  if(!force&&previous&&(previous.pending||now()-previous.loadedAt<5000))return previous.promise;
  const entry={pending:true};cache.set(owner,entry);
  entry.promise=Promise.resolve().then(()=>request('publication-capacity'+(background?'?preview=1':''))).then(value=>{entry.pending=false;entry.loadedAt=now();return value;},error=>{if(cache.get(owner)===entry)cache.delete(owner);throw error;});
  return entry.promise;
 };
}
export const publicationCapacity=createCapacityReader();
