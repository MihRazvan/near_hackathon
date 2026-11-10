const COOKIE='__Host-everywhere_session';
const DEV_COOKIE='everywhere_session';
export function sessionToken(request,config){
 const bearer=request.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]+)$/)?.[1];
 if(bearer)return bearer;
 const name=config.production||config.environment==='production'?COOKIE:DEV_COOKIE;
 for(const part of (request.headers.cookie??'').split(';')){const index=part.indexOf('=');if(part.slice(0,index).trim()===name){const value=part.slice(index+1).trim();if(/^[A-Za-z0-9_-]{32,128}$/.test(value))return value;}}
}
export function sessionCookie(token,config,{clear=false}={}){
 const production=config.production||config.environment==='production',name=production?COOKIE:DEV_COOKIE;
 const seconds=clear?0:Math.floor((config.authSessionMs??8*60*60*1000)/1000);
 return name+'='+(clear?'':token)+'; Path=/; HttpOnly; SameSite='+(config.crossSiteSessions?'None':'Lax')+'; Max-Age='+seconds+(production?'; Secure':'');
}
