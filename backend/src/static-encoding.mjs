import {gzipSync,brotliCompressSync,constants} from 'node:zlib';
import {createHash} from 'node:crypto';
const cache=new Map();
function accepted(header){
 const values=new Map(String(header??'').split(',').map(part=>{const [name,...parameters]=part.trim().toLowerCase().split(';');const quality=parameters.find(p=>p.trim().startsWith('q='));return [name,quality?Number(quality.trim().slice(2)):1];}));
 return ['br','gzip'].map(name=>({name,q:values.get(name)??values.get('*')??0})).filter(x=>x.q>0&&x.q<=1).sort((a,b)=>b.q-a.q)[0]?.name;
}
export function encodeStaticAsset(name,bytes,header){
 if((!name.startsWith('assets/')&&name!=='wallets.js')||! /\.(js|css|svg|json)$/.test(name)||bytes.length<1024||bytes.length>1048576)return {bytes};
 const encoding=accepted(header);if(!encoding)return {bytes};
 const key=name+':'+encoding+':'+createHash('sha256').update(bytes).digest('hex');let compressed=cache.get(key);
 if(!compressed){compressed=encoding==='br'?brotliCompressSync(bytes,{params:{[constants.BROTLI_PARAM_QUALITY]:4}}):gzipSync(bytes,{level:6});cache.set(key,compressed);if(cache.size>32)cache.delete(cache.keys().next().value);}
 return {bytes:compressed,encoding};
}
