import { live } from './runtime.mjs';
import { heading,card,form,input,hidden,submit,link,act,esc,signedOut,notice } from './ui.mjs';
export function captureView(r){
 if(r.id==='O05'){
  if(live.captureSaved===r.params.session)return heading('PHOTO CAPTURE','Your photo is ready.','Return to the owner workspace to create an editable space from this image.');
  return heading('PHOTO CAPTURE','Show us your vehicle.','Take a clear photo of the advertising side. Avoid including personal information.')+
   card('Capture a view',form('capture-photo',hidden('session',r.params.session)+hidden('token',new URLSearchParams(location.search).get('token')??'')+
    input('photo','Vehicle photo','','file','accept="image/png,image/jpeg" capture="environment" required')+submit('Save vehicle photo')));
 }
 if(r.id==='O04'){
  if(!live.session)return signedOut();const session=live.data?.captures.find(c=>c.id===r.params.session);
  const url=live.captureLinks?.[r.params.session]??sessionStorage.getItem('everywhere-capture-link:'+r.params.session);
  return heading('OWNER / DEVICE CAPTURE','Bring the photo back to your workspace.','Open the scoped capture link on a device that can reach this server.')+
   card('Capture link',url?`<label class="field"><span>Open this link on the camera device</span><input readonly value="${esc(url)}"></label>${link(url,'Open capture page on this device','button primary')}`:notice('The original capture link is not stored on this device.','Create another capture link if you need to pair a camera again.'))+
   card('Photo status',`<p>${session?.status==='received'?'Photo received. It is private to this owner workspace.':'Waiting for a vehicle photo.'}</p>${act('refresh','Check photo status')}
   ${session?.status==='received'?act('use-capture','Continue with this photo',`data-id="${r.params.session}"`,'button primary'):''}`);
 }
 return null;
}
