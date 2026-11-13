import sharp from 'sharp';
import { assert, AppError } from './core.mjs';

// Public inference uses a dedicated server key. No personal OAuth session is forwarded.
export class NearAI {
 constructor({apiKey,model='z-ai/glm-5.3-flash',imageModel='black-forest-labs/FLUX.2-klein-4B',fetchImpl=fetch}){
  Object.defineProperty(this,'apiKey',{value:apiKey});Object.assign(this,{model,imageModel,fetch:fetchImpl});
 }
 async request(path,body,{image=false}={}){
  assert(this.apiKey,'AI_UNAVAILABLE','AI is offline. Your draft can still be edited manually.',503);
  let response;
  try{response=await this.fetch('https://cloud-api.near.ai/v1/'+path,{method:'POST',headers:{Authorization:'Bearer '+this.apiKey,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(image?120000:60000)});}
  catch{throw new AppError('AI_UNAVAILABLE','The AI request was interrupted. Continue manually or explicitly start a new request.',503);}
  assert(response.ok,'AI_UNAVAILABLE',response.status===429?'AI is busy. Your saved draft is available to edit.':'AI could not complete this request. Your saved draft is available to edit.',503);
  const limit=image?14000000:200000;let size=0;const chunks=[];
  for await(const chunk of response.body){size+=chunk.length;assert(size<=limit,'AI_OUTPUT_LIMIT','The AI response was too large.',502);chunks.push(chunk);}
  try{return JSON.parse(Buffer.concat(chunks).toString());}catch{throw new AppError('INVALID_AI_RESULT','AI returned an unreadable response.',502);}
 }
 async complete({instructions,input,schema}){
  const messages=[{role:'system',content:instructions},...input.map(message=>({role:message.role,content:typeof message.content==='string'?message.content:message.content.map(c=>c.type==='input_image'?{type:'image_url',image_url:{url:c.image_url}}:{type:'text',text:c.text})}))];
  const result=await this.request('chat/completions',{model:this.model,messages,max_tokens:3000,temperature:0,...(this.model==='z-ai/glm-5.3-flash'?{reasoning_effort:'low'}:{}),...(schema?{response_format:{type:'json_schema',json_schema:{name:'vehicle_inventory',strict:true,schema}}}:{})});
  assert(result.choices?.[0]?.finish_reason==='stop','AI_INCOMPLETE','The panel suggestions did not finish. Continue editing your draft manually.',502);
  const text=result.choices[0].message?.content;
  assert(typeof text==='string'&&text.length>0&&text.length<50000,'INVALID_AI_RESULT','AI did not return panel suggestions.',502);
  return {text,model:result.model??this.model,usage:result.usage??null};
 }

 async generateReference(prompt){
  const r=await this.request('images/generations',{model:this.imageModel,n:1,prompt:'Photorealistic vehicle reference, full vehicle in frame, unobstructed side profile, natural daylight, simple background. No advertisements, no lettering, no people. This is an illustrative reference, not evidence of a real vehicle. Vehicle description: '+prompt},{image:true});
  const b64=r.data?.[0]?.b64_json;
  assert(typeof b64==='string'&&b64.length<13000000&&/^[A-Za-z0-9+/]+=*$/.test(b64),'INVALID_AI_IMAGE','AI did not return a usable vehicle reference.',502);
  let bytes;try{bytes=await sharp(Buffer.from(b64,'base64'),{limitInputPixels:20000000}).rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).jpeg({quality:82}).toBuffer();}catch{throw new AppError('INVALID_AI_IMAGE','The generated reference could not be prepared.',502);}
  assert(bytes.length<=1000000,'AI_OUTPUT_LIMIT','The generated reference is too large.',502);
  return {imageDataUrl:'data:image/jpeg;base64,'+bytes.toString('base64'),imageProvenance:'ai-generated',imageModel:this.imageModel};
 }
}
