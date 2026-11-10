import test from 'node:test';
import assert from 'node:assert/strict';
import { routes, matchRoute } from '../src/routes.mjs';
import { state, person, navigate } from '../src/store.mjs';
import { vehicle } from '../src/ui.mjs';

test('static create destinations precede dynamic records and real record IDs remain intact', () => {
  assert.equal(matchRoute('/host/assets/new').id, 'O03');
  assert.equal(matchRoute('/host/sales/new').id, 'O10');
  assert.equal(matchRoute('/buy/campaigns/new').id, 'B03');
  assert.equal(matchRoute('/owners/alice.near').params.slug, 'alice.near');
  assert.equal(matchRoute('/host/sales/3bfb8cae-5e62-4ad2-86d4-46a90940b1e0').params.id, '3bfb8cae-5e62-4ad2-86d4-46a90940b1e0');
  assert.equal(new Set(routes.map(r => r.id)).size, routes.length);
});
test('unknown and malformed routes produce a safe not-found state', () => {
  for (const path of ['/_screens', '/_testing', '/some-unknown-page', '/host/assets/%E0%A4%A']) {
    assert.equal(matchRoute(path).id, 'G01', path);
  }
  assert.equal(matchRoute('/inbox/near%3Aalice.near').params.threadId, 'near:alice.near');
  assert.ok(routes.every(r => !Object.hasOwn(r, 'sample')));
});
test('the session UI begins signed out without sample records or stored personas', () => {
  assert.equal(person().id, 'visitor');
  assert.deepEqual(Object.keys(state), ['connectedPerson']);
  state.connectedPerson = { id: 'alice.near', name: 'Alice', role: 'owner' };
  assert.equal(person().name, 'Alice');
  state.connectedPerson = null;
});
test('application navigation rejects external destinations and preserves internal query and fragment', () => {
  globalThis.location = { origin: 'https://everywhere.example' };
  let pushed, navigated = 0;
  globalThis.window = new globalThis.EventTarget();
  window.history = { pushState: (_state, _title, path) => { pushed = path; } };
  window.addEventListener('app:navigate', () => navigated++);
  navigate('/host/sales/new?asset=actual-id#schedule');
  assert.equal(pushed, '/host/sales/new?asset=actual-id#schedule');
  assert.equal(navigated, 1);
  assert.throws(() => navigate('https://another.example/'), /this website/);
  assert.throws(() => navigate('//another.example/'), /this website/);
  assert.throws(() => navigate('javascript:alert(1)'), /this website/);
});
test('illustrative surfaces use only the supplied asset geometry and escape owner text', () => {
  const html = vehicle({ type: 'van', color: '#c8d6cc', title: 'My van', model: '<van>', spots: [{ id: 'door', name: '<door>', x: 100, y: 150, w: 200, h: 80 }] }, { large: true, interactive: true, selected: 'door' });
  assert.match(html, /data-id="door"/);
  assert.match(html, /x="100" y="150" width="200" height="80"/);
  assert.match(html, /&lt;door&gt;/);
  assert.match(html, /ILLUSTRATIVE VEHICLE/);
  assert.doesNotMatch(html, /sample|sale-alpine|Mara/i);
});
