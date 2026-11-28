// Stay Log Studio · local image processing
// Everything happens in this browser tab. Nothing is uploaded.
//  - reads JPEG, PNG and WebP (and HEIC where the browser can decode it, e.g. Safari)
//  - applies the camera's orientation
//  - downsizes very large photos with a high-quality multi-step resample, so editing stays smooth
//  - re-encodes the working copy, which drops EXIF metadata such as GPS location
//  - reports the source size so the Studio can warn when a photo is too small for a sharp post

export const MAX_EDGE = 3240;          // 3 × the 1080 post width: enough for 2.5× zoom on a full-bleed post
export const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif';
const MAX_BYTES = 40 * 1024 * 1024;

async function decode(file) {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { /* fall through */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode(); // modern browsers apply EXIF orientation to <img> by default
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function dims(src) {
  return { w: src.naturalWidth || src.width, h: src.naturalHeight || src.height };
}

function resample(src, tw, th) {
  // halve repeatedly, then one final high-quality pass: avoids the aliasing of a single big downscale
  let { w, h } = dims(src);
  let cur = src;
  while (w / 2 >= tw && h / 2 >= th) {
    const c = document.createElement('canvas');
    c.width = Math.round(w / 2); c.height = Math.round(h / 2);
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(cur, 0, 0, c.width, c.height);
    cur = c; w = c.width; h = c.height;
  }
  const out = document.createElement('canvas');
  out.width = tw; out.height = th;
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cur, 0, 0, tw, th);
  return out;
}

function toBlob(canvas, type, q) {
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not prepare the photo.'))), type, q));
}

/**
 * Prepare a photo chosen by staff.
 * @returns {Promise<{url:string, width:number, height:number, sourceWidth:number, sourceHeight:number, bytes:number}>}
 */
export async function preparePhoto(file) {
  if (!file) throw new Error('No file chosen.');
  if (file.size > MAX_BYTES) throw new Error('This photo is larger than 40 MB. Export a smaller copy from the phone or camera and try again.');
  if (file.type && !/^image\//.test(file.type)) throw new Error('That file is not a photo.');
  let src;
  try { src = await decode(file); } catch (e) {
    throw new Error('This browser cannot read that photo format. Save it as JPEG (on iPhone: Settings › Camera › Formats › Most Compatible) and try again.');
  }
  const { w, h } = dims(src);
  if (!w || !h) throw new Error('That photo appears to be empty.');
  const k = Math.min(1, MAX_EDGE / Math.max(w, h));
  const tw = Math.round(w * k), th = Math.round(h * k);
  const canvas = resample(src, tw, th);
  if (src.close) try { src.close(); } catch (e) { /* ignore */ }
  const blob = await toBlob(canvas, 'image/jpeg', 0.92);
  return { url: URL.createObjectURL(blob), width: tw, height: th, sourceWidth: w, sourceHeight: h, bytes: blob.size };
}

/**
 * How many photo pixels land on each post pixel for an area of fw × fh post pixels at a given zoom.
 * Under 1 means the photo is being enlarged and may look soft.
 */
export function sharpness(photo, fw, fh, zoom) {
  if (!photo) return Infinity;
  const cover = Math.max(fw / photo.width, fh / photo.height) * (zoom || 1);
  return 1 / cover;
}
