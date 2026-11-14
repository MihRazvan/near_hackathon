import { live, api, upload, refresh } from './runtime.mjs';
import { toast,navigate } from '../store.mjs';
import {artworkReservations} from './artwork-media.mjs';

const PAID = new Set(['accepted', 'outbid', 'completed', 'cancelled', 'refunded', 'displaced']);
export const bookingConversationAllowed = (booking, wallet) => typeof wallet === 'string' && !!wallet && !!booking && (booking.accepted === true || PAID.has(booking.status)) && [booking.owner, booking.sellerId].includes(wallet);
export const verifiedMediaFor = (media, wallet) => !wallet ? [] : (media ?? []).filter(m => m.owner === wallet && m.status === 'verified' && m.public === true && /^ipfs:\/\/baf[a-z2-7]{30,120}$/.test(m.uri ?? ''));
export const supportAdministrator = state => !!state.session?.wallet && state.data?.supportAdmin === true && state.session?.wallet === state.config?.defaultArbiter;

export function createWorkspaceForms({ request = api, uploadFile = upload, refreshWorkspace = refresh, showToast = toast, getLive = () => live,go = navigate } = {}) {
  function account() { const state = getLive(); if (!state.session?.wallet) throw new Error('Connect your wallet to continue.'); return state; }
  async function updated(message) { await refreshWorkspace({ force: true, local: true }); showToast(message); }
  return {
    'brand-upload': async data => {
      account(); const file = data.get('file');
      if (!file?.size) throw new Error('Choose a brand image or document to upload.');
      if (!data.has('public')) throw new Error('Confirm that you have permission to publish this content.');
      await uploadFile(file, { acknowledged: true }); await updated('File saved. Choose a reservation below to submit it as artwork.');
    },
    'choose-artwork-reservation': async data => {
      const state=account(),mediaId=String(data.get('mediaId')??''),placementId=String(data.get('placementId')??'');
      if(!verifiedMediaFor(state.data?.media,state.session.wallet).some(m=>m.id===mediaId))throw new Error('Choose a saved file belonging to this wallet.');
      if(!artworkReservations(state).some(t=>t.id===placementId))throw new Error('Open a current reservation that is still waiting for artwork.');
      go('/profile/placements/'+encodeURIComponent(placementId)+'?artwork='+encodeURIComponent(mediaId)+'#artwork');
    },
    'notification-preferences': async data => {
      const state = account(), profile = state.data?.profile ?? {};
      await request('profile', { displayName: profile.displayName || state.session.wallet, brand: profile.brand ?? '', city: profile.city ?? '', defaultWorkspace: profile.defaultWorkspace === 'owner' ? 'owner' : 'buyer', notifications: data.has('notifications') }, { method: 'PATCH' });
      await updated('Notification preferences saved.');
    },
    'booking-message': async data => {
      const state = account(), bookingId = String(data.get('bookingId') ?? ''), dashboard = state.data?.dashboard ?? {};
      const booking = [...(dashboard.bookings ?? []), ...(dashboard.incomingBookings ?? [])].find(b => b.id === bookingId);
      if (!bookingConversationAllowed(booking, state.session.wallet)) throw new Error('Open a paid booking belonging to this wallet.');
      await request('bookings/' + encodeURIComponent(bookingId) + '/messages', { message: String(data.get('message') ?? '') });
      await updated('Message sent to this booking conversation.');
    },
    'support-reply': async data => {
      const state = account(), ticketId = String(data.get('ticketId') ?? ''), admin = supportAdministrator(state);
      const ticket = [...(state.data?.support ?? []), ...(admin ? state.data?.supportQueue ?? [] : [])].find(t => t.id === ticketId);
      if (!ticket || !(ticket.owner === state.session.wallet || admin)) throw new Error('Open a support case available to this wallet.');
      const version = Number(data.get('version'));
      if (!Number.isSafeInteger(version) || version < 1) throw new Error('Refresh this support case before replying.');
      const status = String(data.get('status') ?? ''), message = String(data.get('message') ?? '').trim();
      if (status && !['open', 'closed'].includes(status)) throw new Error('Choose whether this support case is open or closed.');
      if (!message && (!status || status === ticket.status)) throw new Error('Add a reply or change the case status.');
      await request('support/' + encodeURIComponent(ticketId) + '/reply', { message, version, ...(status ? { closed: status === 'closed' } : {}) });
      await updated('Support case updated.');
    },
  };
}
export const workspaceForms = createWorkspaceForms();
