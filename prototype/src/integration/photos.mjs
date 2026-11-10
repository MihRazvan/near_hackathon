// Only onboarding/camera photos use this conversion. Print artwork keeps its
// original bytes and follows the separate artifact-upload rules.
const MAX_INPUT = 25 * 1024 * 1024;
const MIN_QUALITY = .45;
const MAX_QUALITY = .9;
const TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence']);
const readable = () => new Error('This browser could not read that photo. Choose a JPEG, PNG or WebP, or export your phone photo as JPEG.');
function positive(value, name) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number.`);
}

export function resizeDimensions(width, height, maxSide = 1800) {
  positive(width, 'Photo width'); positive(height, 'Photo height');
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)) throw new Error('Photo dimensions must use whole pixels.');
  if (!Number.isSafeInteger(maxSide) || maxSide < 1 || maxSide > 4096) throw new Error('Photo size must be between 1 and 4096 pixels.');
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function wantedQuality(bytes, maxBytes, previousQuality = MAX_QUALITY) {
  positive(bytes, 'Encoded photo size'); positive(maxBytes, 'Photo byte limit');
  positive(previousQuality, 'Photo quality');
  const previous = Math.min(MAX_QUALITY, Math.max(MIN_QUALITY, previousQuality));
  if (bytes <= maxBytes) return previous;
  return Math.max(MIN_QUALITY, Math.min(previous - .06, previous * Math.sqrt(maxBytes / bytes) * .96));
}

async function decodePhoto(file, release) {
  // Both paths ask the browser to apply the photo's stored orientation once.
  if (typeof globalThis.createImageBitmap === 'function') {
    try {
      const bitmap = await globalThis.createImageBitmap(file, { imageOrientation: 'from-image' });
      release.bitmap = bitmap;
      return { source: bitmap, width: bitmap.width, height: bitmap.height };
    } catch { /* Safari/HEIC and older decoders can use the image-element path. */ }
  }
  release.url = URL.createObjectURL(file);
  const image = new globalThis.Image(); release.image = image;
  image.decoding = 'async';
  await new Promise((resolve, reject) => {
    image.onload = resolve; image.onerror = () => reject(readable()); image.src = release.url;
  });
  if (typeof image.decode === 'function') await image.decode();
  return { source: image, width: image.naturalWidth, height: image.naturalHeight };
}
function jpeg(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob?.size && blob.type === 'image/jpeg' ? resolve(blob) : reject(new Error('Your browser could not prepare this photo. Try saving it as JPEG first.')), 'image/jpeg', quality);
  });
}
function dataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' && reader.result.startsWith('data:image/jpeg;base64,') ? resolve(reader.result) : reject(readable());
    reader.onerror = () => reject(new Error('The prepared photo could not be read. Choose it again.'));
    reader.readAsDataURL(blob);
  });
}

export async function photoData(file, { maxBytes = 900000, maxSide = 1800 } = {}) {
  if (!file || file.size === 0) return null;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 128 || maxBytes > 1000000) throw new Error('Photo byte limit must be between 128 bytes and 1 MB.');
  resizeDimensions(1, 1, maxSide);
  if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > MAX_INPUT) throw new Error('Choose a photo smaller than 25 MB.');
  const type = (file.type || '').toLowerCase(), extension = String(file.name || '').toLowerCase().match(/\.([a-z]+)$/)?.[1];
  if (!TYPES.has(type) && (!['', 'application/octet-stream'].includes(type) || !['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(extension))) throw readable();
  const release = {}; let canvas;
  try {
    let decoded;
    try { decoded = await decodePhoto(file, release); } catch { throw readable(); }
    positive(decoded.width, 'Photo width'); positive(decoded.height, 'Photo height');
    if (decoded.width * decoded.height > 120000000) throw new Error('This photo has too many pixels to edit here. Export a smaller copy and try again.');
    let dimensions = resizeDimensions(decoded.width, decoded.height, maxSide), quality = MAX_QUALITY;
    canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Your browser could not prepare this photo. Try another browser or a smaller JPEG.');
    // Redraw from the decoded original at every size: no stretch/crop, no EXIF,
    // and no accumulated quality loss from re-encoding a previous JPEG.
    for (let attempt = 0; attempt < 30; attempt++) {
      canvas.width = dimensions.width; canvas.height = dimensions.height;
      context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
      const blob = await jpeg(canvas, quality);
      if (blob.size <= maxBytes) return await dataUrl(blob);
      const lower = wantedQuality(blob.size, maxBytes, quality);
      if (lower < quality) { quality = lower; continue; }
      const side = Math.max(dimensions.width, dimensions.height);
      if (side <= 1) break;
      const factor = Math.max(.5, Math.min(.85, Math.sqrt(maxBytes / blob.size) * .9));
      dimensions = resizeDimensions(decoded.width, decoded.height, Math.max(1, Math.floor(side * factor)));
      quality = .85;
    }
    throw new Error('This photo could not fit the upload size. Choose a smaller JPEG or take another photo.');
  } finally {
    release.bitmap?.close?.();
    if (release.image) { release.image.onload = null; release.image.onerror = null; release.image.removeAttribute?.('src'); }
    if (release.url) URL.revokeObjectURL(release.url);
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}
