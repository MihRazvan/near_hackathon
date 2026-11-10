import { live,dateTime } from './runtime.mjs';
import { heading,card,form,input,hidden,submit,link,act,esc,signedOut,notice,badge } from './ui.mjs';
export function captureView(r){
 if(r.id==='O05'){
  if(live.captureSaved===r.params.session)return heading('PHOTO CAPTURE','Your photo is ready.','It has been sent to your owner workspace. Continue on the device where you started your listing.')+
   card('Photo sent',`<p>${badge('Ready to review')}</p><p>You can close this camera page. Your photo stays private until you choose to use it on a public listing.</p>${link('/host/capture/'+encodeURIComponent(r.params.session),'Continue on this device','button')}`);
  const token=new URLSearchParams(location.search).get('token');
  if(!token)return heading('PHOTO CAPTURE','Open your camera link.','Use the link from your owner workspace to send a photo to the right listing.')+notice('This link is incomplete.','Return to your owner workspace and create a new camera link.');
  return heading('PHOTO CAPTURE','Show us your space.','Take a clear photo of the advertising side. Keep the whole surface in view.')+
   card('Take or choose a photo',form('capture-photo',hidden('session',r.params.session)+hidden('token',token)+
    input('photo','Photo · up to 25 MB, optimized on your device','','file','accept="image/png,image/jpeg,image/webp,image/heic,image/heif" capture="environment" required')+`<p class="tiny muted">Avoid personal information in the photo. You’ll review and edit the advertising surfaces before publishing.</p>`+submit('Send photo to my workspace')));
 }
 if(r.id==='O04'){
  if(!live.session)return signedOut();const capture=live.data?.captures.find(c=>c.id===r.params.session),received=capture?.status==='received',expired=capture&&(typeof capture.expiresAt==='number'?capture.expiresAt:Date.parse(capture.expiresAt))<=Date.now();
  const expiresAt=typeof capture?.expiresAt==='number'?capture.expiresAt:Date.parse(capture?.expiresAt);
  const url=live.captureLinks?.[r.params.session]??sessionStorage.getItem('everywhere-capture-link:'+r.params.session);
  if(received)return heading('YOUR SPACE','Your photo has arrived.','Continue with the captured view and describe the advertising space.')+
   card('Ready to create your layout',`<p>${badge('Photo received')}</p><p>Your photo is private to this workspace. You can choose a public cover when creating the listing.</p>${act('use-capture','Continue with this photo',`data-id="${r.params.session}"`,'button primary')}`);
  if(expired||!capture)return heading('YOUR SPACE','Start a new camera session.','The previous camera link is no longer available.')+
   card('Create a fresh link',`<p>Camera links expire after 30 minutes. Your saved spaces are unaffected.</p>${act('start-capture','Create a new camera link','','button primary')}${link('/host/assets/new','Upload from this device','button')}`);
  return heading('YOUR SPACE','Use your phone camera.','Open this private link on your phone, take a photo, and return here to continue.')+
   card('Send the link to your phone',url?`<label class="field"><span>Your private camera link</span><input readonly value="${esc(url)}" aria-label="Your private camera link"></label><div class="actions">${act('copy-capture-link','Copy camera link',`data-url="${esc(url)}"`,'button primary')}${link(url,'Open camera on this device','button')}</div><p class="tiny muted">Expires ${esc(dateTime(expiresAt))}. Anyone with this link can send one photo to this workspace.</p>`:notice('Create another camera link.','The original link is only available on the device where it was created.')+act('start-capture','Create a new camera link','','button primary'))+
   card('Waiting for your photo',`<p>After sending the photo from your phone, check here to continue. Your link sends a photo only; it cannot access your wallet or account.</p>${act('refresh','Check for my photo','','button primary')}`)+
   link('/host/assets/new','Choose a photo from this device instead','text-link');
 }
 return null;
}
