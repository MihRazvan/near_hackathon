import {reboxPanel} from './panel-geometry.mjs';
import {amount} from './runtime.mjs';
const cents=value=>{const n=BigInt(amount(String(value)));if(n%10000n)throw new Error('Spot prices must use whole USDC cents.');return (n/10000n).toString();};
export function assetFields(data,base){
 return {title:String(data.get('title')),description:String(data.get('description')),city:String(data.get('city')),assetType:String(data.get('assetType')),
  assumptions:base.assumptions??[],source:base.source??'manual',...(base.photoDataUrl?{photoDataUrl:base.photoDataUrl}:{}),...(base.coverMediaId?{coverMediaId:base.coverMediaId}:{}),
  spots:base.spots.map(p=>({...reboxPanel(p,Object.fromEntries(['x','y','width','height'].map(k=>[k,Number(data.get(k+':'+p.id)??p.box[k]*100)/100]))),name:String(data.get('name:'+p.id)??p.name),side:String(data.get('side:'+p.id)??p.side),
   suggestedPriceCents:cents(data.get('price:'+p.id)??(Number(p.suggestedPriceCents)/100).toFixed(2))}))};
}
