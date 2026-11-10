import {assert,AppError} from './core.mjs';

// Dedicated server API credentials; never publish a personal subscription session.
export class OpenAI {
 constructor({apiKey,model='gpt-5-mini',fetchImpl=fetch}){Object.assign(this,{apiKey,model,fetch:fetchImpl});}
 async complete({instructions,input}){
  assert(this.apiKey,'AI_UNAVAILABLE','AI scanning is unavailable. You can upload a photo and edit surfaces manually.',503);
  let response;
  try{response=await this.fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+this.apiKey,'Content-Type':'application/json'},body:JSON.stringify({model:this.model,instructions,input,store:false,max_output_tokens:3500}),signal:AbortSignal.timeout(60000)});}
  catch{throw new AppError('AI_UNAVAILABLE','Scanning was interrupted. Your photo is still available; try again or edit surfaces manually.',503);}
  assert(response.ok,'AI_UNAVAILABLE',response.status===429?'AI scanning is busy. Try later or edit surfaces manually.':'AI scanning is temporarily unavailable. You can still edit surfaces manually.',503);
  const value=await response.json();assert(value.status==='completed','AI_INCOMPLETE','The scan did not finish. Try again or edit your surfaces manually.',502);
  const text=(value.output??[]).filter(item=>item.type==='message').flatMap(item=>item.content??[]).filter(item=>item.type==='output_text').map(item=>item.text).join('');
  assert(text.length>0&&text.length<50000,'AI_INCOMPLETE','The scan did not return a usable draft.',502);
  return {text,model:value.model,usage:value.usage??null};
 }
}
