import test from 'node:test';
import assert from 'node:assert/strict';
import { photoData, resizeDimensions, wantedQuality } from '../src/integration/photos.mjs';

test('phone portrait and landscape dimensions fit the limit without upscaling or changing their aspect', () => {
  assert.deepEqual(resizeDimensions(4032, 3024), { width: 1800, height: 1350 });
  assert.deepEqual(resizeDimensions(3024, 4032), { width: 1350, height: 1800 });
  assert.deepEqual(resizeDimensions(640, 480), { width: 640, height: 480 });
  assert.deepEqual(resizeDimensions(120000, 1), { width: 1800, height: 1 });
  assert.deepEqual(resizeDimensions(1, 120000), { width: 1, height: 1800 });
  for (const [width, height] of [[13, 37], [8291, 6013], [1, 4096]]) {
    const result = resizeDimensions(width, height, 512);
    assert.ok(result.width > 0 && result.height > 0 && Math.max(result.width, result.height) <= 512);
    assert.ok(Math.abs(result.width * height - result.height * width) <= Math.max(width, height));
  }
});
test('invalid dimensions, limits and quality inputs fail before browser work', () => {
  for (const [width, height, limit] of [[0, 1, 10], [-1, 1, 10], [1, Number.NaN, 10], [Infinity, 1, 10], [1, 1, 0], [1, 1, 4097], [1, 1, 1.5], [.5, 1, 10]]) assert.throws(() => resizeDimensions(width, height, limit));
  for (const args of [[0, 10], [10, 0], [Infinity, 1], [1, 1, 0]]) assert.throws(() => wantedQuality(...args));
  assert.equal(wantedQuality(100, 200, .8), .8);
  assert.equal(wantedQuality(100, 200, 2), .9);
  assert.ok(wantedQuality(200, 100, .8) < .8);
  assert.equal(wantedQuality(10000000, 100, .9), .45);
});
function browser({ fallback = false, encodeSize = (_canvas, quality) => quality > .5 ? 1100000 : 500000, noContext = false, readerFails = false, decodeFails = false } = {}) {
  const saved = new Map(), close = { bitmaps: 0, revoked: [], created: [], draws: [], qualities: [] };
  function replace(key, value) { saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { value, configurable: true, writable: true }); }
  const oldCreate = URL.createObjectURL, oldRevoke = URL.revokeObjectURL;
  URL.createObjectURL = () => { const url = 'blob:isolated-photo'; close.created.push(url); return url; };
  URL.revokeObjectURL = url => close.revoked.push(url);
  replace('createImageBitmap', async (_file, options) => { assert.equal(options.imageOrientation, 'from-image'); if (fallback) throw new Error('decoder'); return { width: 4032, height: 3024, close() { close.bitmaps++; } }; });
  replace('Image', class { naturalWidth = 3024; naturalHeight = 4032; set src(value) { if(value)globalThis.queueMicrotask(() => decodeFails ? this.onerror?.() : this.onload?.()); } async decode() {} });
  replace('document', { createElement: () => { const canvas = { width: 0, height: 0, getContext: () => noContext ? null : { fillRect() {}, drawImage(_source, x, y, width, height) { assert.equal(x, 0); assert.equal(y, 0); close.draws.push({ width, height }); } }, toBlob(callback, mime, quality) { assert.equal(mime, 'image/jpeg'); close.qualities.push(quality); callback({ type: mime, size: encodeSize(canvas, quality) }); } }; close.canvas = canvas; return canvas; } });
  replace('FileReader', class { readAsDataURL() { if(readerFails) { this.onerror(); return; } this.result = 'data:image/jpeg;base64,c3ludGhldGlj'; this.onload(); } });
  return { close, restore() { for(const [key, descriptor] of saved) { if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]; } URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke; } };
}
test('large phone photos are locally encoded under the byte limit with bounded quality and released bitmap memory', async () => {
  const b = browser();
  try {
    assert.match(await photoData({ size: 9000000, type: 'image/jpeg' }), /^data:image\/jpeg;base64,/);
    assert.ok(b.close.qualities.length > 1); assert.ok(b.close.qualities.every(q => q >= .45 && q <= .9));
    assert.deepEqual(b.close.draws[0], { width: 1800, height: 1350 });
    assert.equal(b.close.bitmaps, 1); assert.equal(b.close.canvas.width, 0);
  } finally { b.restore(); }
});
test('high-entropy photos reduce dimensions when quality alone cannot reach the byte limit', async () => {
  const b = browser({ encodeSize: canvas => canvas.width > 1000 ? 2000000 : 300000 });
  try {
    await photoData({ size: 10000000, type: 'image/png' });
    assert.ok(b.close.draws.some(d => d.width <= 1000));
    assert.ok(b.close.draws.every(d => d.width <= 1800 && Math.abs(d.width / d.height - 4 / 3) < .002));
    assert.ok(b.close.qualities.length <= 30);
  } finally { b.restore(); }
});
test('browser-supported HEIC uses the image fallback and revokes its URL after success or decode failure', async () => {
  for (const decodeFails of [false, true]) {
    const b = browser({ fallback: true, encodeSize: () => 1000, decodeFails });
    try {
      const operation = photoData({ size: 4000000, type: 'image/heic' });
      if(decodeFails) await assert.rejects(operation, /export your phone photo as JPEG/);
      else { await operation; assert.deepEqual(b.close.draws[0], { width: 1350, height: 1800 }); }
      assert.deepEqual(b.close.revoked, b.close.created);
    } finally { b.restore(); }
  }
});
test('canvas/read failures release decoded resources and oversized or unsupported input never reaches a decoder', async () => {
  for (const option of [{ noContext: true }, { readerFails: true }, { fallback: true, readerFails: true }]) {
    const b = browser(option);
    try { await assert.rejects(photoData({ size: 500, type: 'image/webp' })); assert.equal(b.close.bitmaps, option.fallback ? 0 : 1); assert.equal(b.close.canvas.width, 0); assert.deepEqual(b.close.revoked,b.close.created); }
    finally { b.restore(); }
  }
  assert.equal(await photoData(null), null); assert.equal(await photoData({ size: 0 }), null);
  await assert.rejects(photoData({ size: 26 * 1024 * 1024, type: 'image/jpeg' }), /25 MB/);
  await assert.rejects(photoData({ size: 200, type: 'image/gif' }), /JPEG/);
  await assert.rejects(photoData({ size: 200, type: 'image/jpeg' }, { maxBytes: 0 }), /byte limit/);
});

test('an impossible byte limit fails after bounded encoding attempts instead of returning an oversized image', async () => {
  const b=browser({encodeSize:()=>2000000});
  try { await assert.rejects(photoData({size:1000,type:'image/jpeg'},{maxBytes:128,maxSide:1}),/could not fit the upload size/);assert.ok(b.close.qualities.length<=30);assert.equal(b.close.bitmaps,1);assert.equal(b.close.canvas.width,0); }
  finally { b.restore(); }
});
