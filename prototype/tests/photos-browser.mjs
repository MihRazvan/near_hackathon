// Local image-decoder regression; no backend, API, credentials or external calls.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import process from 'node:process';
const require = createRequire(new URL('../../backend/package.json', import.meta.url));
const { chromium } = require('playwright');
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
try {
  const page = await browser.newPage(), network = [];
  page.on('request', request => { if (/^https?:/.test(request.url())) network.push(request.url()); });
  const source = await readFile(new URL('../src/integration/photos.mjs', import.meta.url), 'utf8');
  const result = await page.evaluate(async source => {
    const moduleUrl = 'data:text/javascript;base64,' + btoa(source), { photoData } = await import(moduleUrl);
    const noise = document.createElement('canvas'); noise.width = 3072; noise.height = 2304;
    const ctx = noise.getContext('2d'), pixels = ctx.createImageData(noise.width, noise.height);
    for (let offset = 0; offset < pixels.data.length; offset += 65536) crypto.getRandomValues(pixels.data.subarray(offset, Math.min(offset + 65536, pixels.data.length)));
    for (let i = 3; i < pixels.data.length; i += 4) pixels.data[i] = 255;
    ctx.putImageData(pixels, 0, 0);
    const png = await new Promise(resolve => noise.toBlob(resolve, 'image/png'));
    const url = await photoData(new File([png], 'synthetic-phone.png', { type: 'image/png' })), output = await (await fetch(url)).blob(), decoded = await globalThis.createImageBitmap(output);
    const large = { inputBytes: png.size, outputBytes: output.size, width: decoded.width, height: decoded.height, mime: output.type }; decoded.close(); noise.width = 0; noise.height = 0;
    const small = document.createElement('canvas'); small.width = 300; small.height = 200;
    const paint = small.getContext('2d'); paint.fillStyle = 'red'; paint.fillRect(0, 0, 150, 200); paint.fillStyle = 'blue'; paint.fillRect(150, 0, 150, 200);
    const jpeg = await new Promise(resolve => small.toBlob(resolve, 'image/jpeg', .95)), bytes = new Uint8Array(await jpeg.arrayBuffer());
    // EXIF orientation 6: rotate this deliberately landscape source clockwise.
    const exif = Uint8Array.from([255,225,0,34,69,120,105,102,0,0,77,77,0,42,0,0,0,8,0,1,1,18,0,3,0,0,0,1,0,6,0,0,0,0,0,0]);
    const file = new File([bytes.slice(0, 2), exif, bytes.slice(2)], 'oriented-phone.jpg', { type: 'image/jpeg' });
    const dimensions = [];
    const bitmap = globalThis.createImageBitmap, create = URL.createObjectURL, revoke = URL.revokeObjectURL;
    let created = 0, revoked = 0;
    URL.createObjectURL = blob => { created++; return create(blob); }; URL.revokeObjectURL = url => { revoked++; return revoke(url); };
    try {
      for (const fallback of [false, true]) {
        globalThis.createImageBitmap = fallback ? undefined : bitmap;
        const data = await photoData(file), blob = await (await fetch(data)).blob(), image = await bitmap(blob);
        dimensions.push({ width: image.width, height: image.height, hasExif: new globalThis.TextDecoder('latin1').decode(await blob.arrayBuffer()).includes('Exif') }); image.close();
      }
      let unsupported = false;
      try { await photoData(new File(['not a supported photo'], 'unsupported.heic', { type: 'image/heic' })); } catch (error) { unsupported = /export your phone photo as JPEG/.test(error.message); }
      return { large, dimensions, created, revoked, unsupported };
    } finally { globalThis.createImageBitmap = bitmap; URL.createObjectURL = create; URL.revokeObjectURL = revoke; }
  }, source);
  assert.ok(result.large.inputBytes > 2000000 && result.large.inputBytes < 25 * 1024 * 1024);
  assert.ok(result.large.outputBytes <= 900000); assert.equal(result.large.mime, 'image/jpeg');
  assert.equal(result.large.width, 1800); assert.equal(result.large.height, 1350);
  assert.deepEqual(result.dimensions, [{ width: 200, height: 300, hasExif: false }, { width: 200, height: 300, hasExif: false }]);
  assert.equal(result.created, result.revoked); assert.equal(result.unsupported, true); assert.deepEqual(network, []);
  console.log(JSON.stringify({ ...result, externalRequests: network.length }, null, 2));
} finally { await browser.close(); }
