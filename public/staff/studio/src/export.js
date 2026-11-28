// Stay Log Studio · full-resolution PNG export
// Rasterises the post exactly as previewed, at its true size (1080 wide), in the browser.
// Uses the vendored html-to-image 1.11.11 (MIT, see vendor/html-to-image.LICENSE). No network calls:
// fonts are read from the module's own asset folder and embedded, photos are local blob URLs.

const MODULE_URL = (typeof import.meta !== 'undefined' && import.meta.url) || document.baseURI;
let libPromise = null;
/** Load the vendored html-to-image once. `url` lets a host serve the file from elsewhere (default: next to this module). */
export function loadExportLibrary(url) {
  if (globalThis.htmlToImage) return Promise.resolve(globalThis.htmlToImage);
  if (!libPromise) {
    // a classic <script> tag: works from an ES module, from the IIFE build and inside sandboxed frames.
    // A host-supplied url is relative to the page; the default sits next to this module.
    const src = url ? new URL(url, document.baseURI).href : new URL('./vendor/html-to-image.js', MODULE_URL).href;
    libPromise = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = () => (globalThis.htmlToImage ? res(globalThis.htmlToImage) : rej(new Error('The export library did not load.')));
      s.onerror = () => rej(new Error('The export library did not load.'));
      document.head.appendChild(s);
    }).catch((e) => { libPromise = null; throw e; });
  }
  return libPromise;
}

const FONTS = [
  ['Inter Tight', 'fonts/InterTight-latin-wght.woff2', 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'],
  ['Inter Tight', 'fonts/InterTight-latin-ext-wght.woff2', 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF'],
  ['JetBrains Mono', 'fonts/JetBrainsMono-latin-wght.woff2', 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD']
];

/** @font-face rules pointing at the module's font files (for the live page). */
export function fontFaceCSS(assetBase) {
  return FONTS.map(([fam, path, range]) =>
    `@font-face{font-family:'${fam}';src:url(${assetBase}${path}) format('woff2');font-weight:100 900;font-style:normal;font-display:block;unicode-range:${range}}`).join('');
}

const cache = new Map();
function dataURL(url) {
  return fetch(url).then((r) => {
    if (!r.ok) throw new Error('Missing font file ' + url);
    return r.blob();
  }).then((b) => new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(b);
  }));
}
/** The same faces as data URLs, so the exported file never depends on anything outside it. */
export function embeddedFontCSS(assetBase) {
  if (!cache.has(assetBase)) {
    cache.set(assetBase, Promise.all(FONTS.map(([fam, path, range]) => dataURL(assetBase + path).then((d) =>
      `@font-face{font-family:'${fam}';src:url(${d}) format('woff2');font-weight:100 900;font-style:normal;font-display:block;unicode-range:${range}}`)))
      .then((a) => a.join(''))
      .catch((e) => { cache.delete(assetBase); throw e; }));
  }
  return cache.get(assetBase);
}

async function settle(node) {
  // wait for fonts and every image inside the post, so the file never misses a texture
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  const imgs = Array.from(node.querySelectorAll('img'));
  await Promise.all(imgs.map((i) => (i.complete ? Promise.resolve() : i.decode().catch(() => {}))));
}

/**
 * Render `node` to a PNG Blob at exactly width × height pixels.
 * @returns {Promise<Blob>}
 */
export async function exportPNG(node, width, height, assetBase, vendorUrl) {
  const h2i = await loadExportLibrary(vendorUrl);
  await settle(node);
  const fontEmbedCSS = await embeddedFontCSS(assetBase);
  const opts = { width, height, pixelRatio: 1, fontEmbedCSS, cacheBust: false, skipAutoScale: true, style: { transform: 'none' } };
  // the first pass warms image decoding in some browsers; the second is the file
  await h2i.toBlob(node, opts).catch(() => null);
  const blob = await h2i.toBlob(node, opts);
  if (!blob) throw new Error('The browser could not create the file.');
  if ('createImageBitmap' in window) {
    const bmp = await createImageBitmap(blob);
    const ok = bmp.width === width && bmp.height === height;
    if (bmp.close) bmp.close();
    if (!ok) throw new Error('The file came out at the wrong size. Try again.');
  }
  return blob;
}
