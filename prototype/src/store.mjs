// UI state is session-only. Account data and saved drafts come from the server.
export const state = { connectedPerson: null };
export const person = () => state.connectedPerson ?? {
  id: 'visitor', name: 'Visitor', role: 'public', wallet: '', brand: '',
};
export function navigate(path) {
  const url = new URL(path, location.origin);
  if (url.origin !== location.origin || !/^https?:$/.test(url.protocol)) {
    throw new Error('Choose a page on this website.');
  }
  window.history.pushState({}, '', url.pathname + url.search + url.hash);
  window.dispatchEvent(new Event('app:navigate'));
}
export const toast = text => window.dispatchEvent(new window.CustomEvent('app:toast', { detail: text }));
