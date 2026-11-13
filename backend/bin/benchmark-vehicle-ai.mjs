#!/usr/bin/env node
// Explicit paid inference only. Credentials and report remain local; no chain actions.
import {readFile,mkdir,writeFile} from 'node:fs/promises';import {resolve,dirname} from 'node:path';
import sharp from 'sharp';import {parseEnv} from '../src/config.mjs';import {NearAI} from '../src/near-ai.mjs';import {AssetAI} from '../src/asset-ai.mjs';
const args=process.argv.slice(2);if(!args.includes('--run')){console.log('Usage: node backend/bin/benchmark-vehicle-ai.mjs --run <manifest.json> <private-output.json>\nManifest: [{"file":"/path/to/photo.jpg","prompt":"Suggest visible advertising panels","expectedPanels":["front door"]}]');process.exit(0);}
const i=args.indexOf('--run'),manifest=JSON.parse(await readFile(args[i+1],'utf8')),out=resolve(args[i+2]??'.local/vehicle-ai-benchmark.json');
let env={};try{env=parseEnv(await readFile('.env.local','utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
const key=process.env.NEAR_AI_API_KEY??env.NEAR_AI_API_KEY;if(!key)throw Error('NEAR_AI_API_KEY is required.');
if(!Array.isArray(manifest)||manifest.length>20)throw Error('Use at most 20 explicitly selected benchmark inputs.');
const ai=new AssetAI(new NearAI({apiKey:key,model:process.env.NEAR_AI_MODEL??env.NEAR_AI_MODEL})),results=[];
for(const item of manifest){const photo=await sharp(await readFile(item.file)).rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).jpeg({quality:80}).toBuffer(),start=Date.now();try{const r=await ai.draft({prompt:item.prompt??'Suggest advertising panels visible on this vehicle.',imageDataUrl:'data:image/jpeg;base64,'+photo.toString('base64')});results.push({file:item.file,expectedPanels:item.expectedPanels??[],elapsedMs:Date.now()-start,...r,accuracyReview:'pending human inspection'});}catch(e){results.push({file:item.file,elapsedMs:Date.now()-start,errorCode:e.code??'ERROR',error:e.message});}
await mkdir(dirname(out),{recursive:true});await writeFile(out,JSON.stringify({model:ai.chatgpt.model,checkedAt:new Date().toISOString(),results},null,2)+'\n',{mode:0o600});console.log(results.length+'/'+manifest.length+' completed; '+(results.at(-1).errorCode??'structured draft returned'));}
