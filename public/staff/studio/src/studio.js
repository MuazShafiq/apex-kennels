// Stay Log Studio · staff dashboard module
// mountStudio(element, options) builds the whole Studio inside `element`.
// Plain ES module, no framework, no network calls beyond its own asset folder.

import { TEMPLATES } from './templates.js';
import { renderTemplate } from './render.js';
import { preparePhoto, sharpness, ACCEPT } from './image.js';
import { exportPNG, fontFaceCSS } from './export.js';

const CWS = {
  poppy: { label: 'Raven + Poppy', c1: '#120709', c2: '#FF4D55', dark: true },
  raven: { label: 'Raven + Powder', c1: '#120709', c2: '#BFE3F4', dark: true },
  powder: { label: 'Powder + Coral', c1: '#BFE3F4', c2: '#FD6E6E', dark: false }
};
const FMTS = {
  feed: { label: 'Feed 4:5', sub: '1080 × 1350', H: 1350, file: 'ig_feed' },
  story: { label: 'Story 9:16', sub: 'also WhatsApp Status', H: 1920, file: 'ig_story' },
  reel: { label: 'Reel cover', sub: '1080 × 1920', H: 1920, file: 'ig_reelcover' },
  square: { label: 'Square 1:1', sub: 'Threads · 1080', H: 1080, file: 'th_square' }
};
const KINDS = [['open', 'Open', 'Full photo'], ['gate', 'Gate', 'Framed photo'], ['note', 'Note', 'Words'], ['fact', 'Fact', 'Prices']];
const SERV = ['Standard boarding', 'Camera cage', 'Exactly 30 days', 'Exactly 30 days, camera cage', 'Grooming'];
const SERVL = { 'Standard boarding': 'Standard', 'Camera cage': 'Camera cage', 'Exactly 30 days': '30 days', 'Exactly 30 days, camera cage': '30 days, camera', 'Grooming': 'Grooming' };
const KICK = { 'Standard boarding': 'Boarding', 'Camera cage': 'Camera cage', 'Exactly 30 days': 'Long stays', 'Exactly 30 days, camera cage': 'Long stays', 'Grooming': 'Grooming' };
const PAW = { painted: { lab: 'Painted', w: 150, r: 980 / 1180 }, trace: { lab: 'Trace', w: 150, r: 980 / 1185 }, wax: { lab: 'Wax seal', w: 230, r: 1 }, deboss: { lab: 'Deboss', w: 250, r: 714 / 847 } };
// attestations reset whenever the facts they cover change
const COVER = { photo: ['consent', 'verified'], name: ['consent', 'verified'], kind: ['consent', 'verified'], activity: ['verified'], line: ['verified'], noteText: ['verified'], day: ['verified'], of: ['verified'] };

const pad = (n) => String(n).padStart(2, '0');
let uid = 0;

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  kids.flat().forEach((c) => { if (c != null && c !== false) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  return el;
}

/**
 * @param {HTMLElement} root
 * @param {object} [options]
 * @param {string} [options.assetBase] URL of the folder holding img/ and fonts/ (default: the module's own ../assets/)
 * @param {{name?:string,id?:string}} [options.user] the signed-in staff member, recorded in export metadata
 * @param {(e:{blob:Blob,fileName:string,meta:object})=>void} [options.onExport] called after every successful export (audit log, media library)
 * @param {boolean} [options.autoDownload=true] save the file through the browser's download
 * @param {{version?:string|number, std:number, cam:number, pkgDisc:number}} [options.rates] the published rate card from Business settings;
 *        Fact posts take their prices from it (same source as booking and invoices). Without it, the approved card is used.
 * @param {boolean} [options.embedded=false] inside the staff dashboard: no Studio header (the page supplies it), transparent ground
 * @param {string} [options.vendorUrl] where html-to-image is served, if not next to the module
 * @returns {{destroy:()=>void, getState:()=>object}}
 */
export function mountStudio(root, options = {}) {
  const assetBase = options.assetBase || new URL('../assets/', (typeof import.meta !== 'undefined' && import.meta.url) || document.baseURI).href;
  const id = 'sls' + (++uid);
  const st = {
    kind: 'gate', photo: null, fx: 50, fy: 40, zoom: 1, tone: 'dark', win: 'auto', cw: 'powder', fmt: 'feed',
    mat: 'Cut', grain: true, paw: 'none', spot: 'br',
    name: '', activity: '', line: '', day: '', of: '',
    noteText: '', layout: 'One price', service: 'Standard boarding',
    consent: false, verified: false, busy: false, outUrl: '', showOut: false, status: '', reading: false,
    rates: options.rates || null, available: true
  };

  // fonts, scoped to the page once
  if (!document.getElementById('sls-fonts')) {
    document.head.appendChild(h('style', { id: 'sls-fonts', text: fontFaceCSS(assetBase) }));
  }

  // ---------- derived rules (same as the approved Studio)
  function derive() {
    const K = st.kind, isPhoto = K === 'open' || K === 'gate';
    const cw = CWS[st.cw];
    const allowed = isPhoto ? ['feed', 'story', 'reel', 'square'] : ['feed', 'story', 'square'];
    const fmt = allowed.includes(st.fmt) ? st.fmt : 'feed';
    const H = FMTS[fmt].H;
    const silkOk = st.cw === 'powder';
    let mat = st.mat;
    if (K === 'gate' && mat === 'Coral silk') mat = 'Cut';
    if (mat === 'Coral silk' && !silkOk) mat = 'None';
    const darkGround = cw.dark && (K === 'note' || K === 'fact' || K === 'gate');
    let paw = st.paw;
    if (paw === 'deboss' && !darkGround) paw = 'none';
    let slateA = '';
    if (st.day !== '' && st.of !== '') slateA = 'Day ' + pad(Math.min(st.day, st.of)) + ' / ' + pad(st.of);
    else if (st.day !== '') slateA = 'Day ' + pad(st.day);
    const needsChecks = isPhoto || K === 'note';
    const checksOk = !needsChecks || (st.consent && st.verified);
    const noPhoto = isPhoto && !st.photo;
    const noName = K !== 'fact' && !String(st.name).trim();
    const noNote = K === 'note' && !String(st.noteText).trim();
    const exportOff = !st.available || !st.rates || st.busy || st.reading || noPhoto || noName || noNote || !checksOk;
    let ribbon = 'READY TO DOWNLOAD';
    if (noPhoto) ribbon = 'ADD A PHOTO';
    else if (noName) ribbon = 'ADD THE DOG’S NAME';
    else if (noNote) ribbon = 'WRITE THE NOTE';
    else if (!checksOk) ribbon = 'TICK BOTH CHECKS TO DOWNLOAD';
    if (!st.available || !st.rates) ribbon = 'CURRENT RATES UNAVAILABLE';
    const slug = (String(K === 'fact' ? SERVL[st.service] : st.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'post');
    const d = new Date();
    const fileName = 'apex_' + FMTS[fmt].file + '_' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '_' + K + '_' + slug + '.png';
    // softness warning: the frame a photo fills (full post for Open, roughly the window for Gate)
    let soft = false;
    if (isPhoto && st.photo) {
      const fw = 1080, fh = K === 'open' ? H : Math.round(H * 0.62);
      soft = sharpness(st.photo, fw, fh, st.zoom) < 0.8;
    }
    return { K, isPhoto, cw, allowed, fmt, H, silkOk, mat, darkGround, paw, slateA, needsChecks, checksOk, exportOff, ribbon, fileName, soft };
  }

  // rev counts every change to what the post shows; an export is only delivered if rev is unchanged when it finishes
  let rev = 0, destroyed = false, pendingRates;
  function set(patch, field) {
    if (st.busy && field !== 'ui') return; // controls are locked while a file renders
    if (field !== 'ui') rev++;
    Object.assign(st, patch);
    (COVER[field] || []).forEach((k) => { st[k] = false; });
    if (field !== 'ui') { if (st.outUrl) { URL.revokeObjectURL(st.outUrl); } st.outUrl = ''; st.showOut = false; }
    update();
  }

  // ---------- controls
  const segs = [];
  function seg(label, items, isOn, pick, opts = {}) {
    const wrap = h('div', { class: 'sls-seg' + (opts.cls ? ' ' + opts.cls : ''), role: 'group', 'aria-label': label });
    const btns = items.map((it) => {
      const b = h('button', { type: 'button', class: 'sls-btn', onClick: () => pick(it.v) },
        it.sw ? h('span', { class: 'sls-sw', 'aria-hidden': 'true' }, h('span', { style: 'background:' + it.sw[0] }), h('span', { style: 'background:' + it.sw[1] })) : null,
        h('span', { class: 'sls-btn-l', text: it.l }), it.s ? h('span', { class: 'sls-btn-s', text: it.s }) : null);
      wrap.appendChild(b);
      return { b, it };
    });
    segs.push(() => btns.forEach(({ b, it }) => {
      const on = isOn(it.v);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      const off = opts.off ? opts.off(it.v) : '';
      b.disabled = !!off;
      if (off) b.title = off; else b.removeAttribute('title');
      b.hidden = opts.hide ? opts.hide(it.v) : false;
    }));
    return wrap;
  }
  function field(idS, label, input, help) {
    return h('div', { class: 'sls-field' }, h('label', { for: idS, text: label }), input, help || null);
  }
  function text(key, idS, label, max, attrs = {}) {
    const i = h('input', Object.assign({ id: idS, type: 'text', maxlength: max, autocomplete: 'off', onInput: (e) => set({ [key]: e.target.value }, key) }, attrs));
    segs.push(() => { if (document.activeElement !== i) i.value = st[key]; });
    return field(idS, label, i);
  }
  function num(key, idS, label) {
    const i = h('input', { id: idS, type: 'text', inputmode: 'numeric', pattern: '[0-9]*', maxlength: 2, autocomplete: 'off',
      onInput: (e) => { const v = parseInt(e.target.value, 10); set({ [key]: isNaN(v) ? '' : Math.max(1, Math.min(60, v)) }, key); } });
    segs.push(() => { if (document.activeElement !== i) i.value = st[key]; });
    return field(idS, label, i);
  }
  function range(key, idS, label, min, max, step, fmt) {
    const lab = h('label', { for: idS });
    const i = h('input', { id: idS, type: 'range', min, max, step, onInput: (e) => set({ [key]: Number(e.target.value) }, key) });
    segs.push(() => { i.value = st[key]; lab.textContent = label + ' ' + fmt(st[key]); });
    return h('div', { class: 'sls-field' }, lab, i);
  }
  function section(n, title, ...kids) {
    const t = h('h2', { class: 'sls-h2' });
    const s = h('section', { class: 'sls-sec' }, t, ...kids);
    s._title = (num) => { t.textContent = num + ' · ' + title; };
    return s;
  }

  // photo
  const file = h('input', { type: 'file', accept: ACCEPT, class: 'sls-file', id: id + '-file', onChange: (e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) takeFile(f); } });
  const photoInfo = h('p', { class: 'sls-note', 'aria-live': 'polite' });
  const softWarn = h('p', { class: 'sls-warn', role: 'status' });
  const removeBtn = h('button', { type: 'button', class: 'sls-btn sls-btn-quiet', onClick: () => { if (st.photo) URL.revokeObjectURL(st.photo.url); set({ photo: null, fx: 50, fy: 40, zoom: 1 }, 'photo'); } }, h('span', { class: 'sls-btn-l', text: 'Remove photo' }));
  const icon = h('span', { class: 'sls-ico', 'aria-hidden': 'true' });
  icon.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
  const pickLabel = h('label', { class: 'sls-pick', for: id + '-file' }, icon, h('span', { class: 'sls-pick-l' }));
  const secPhoto = section(2, 'Photo',
    h('div', { class: 'sls-row' }, pickLabel, file, removeBtn),
    photoInfo, softWarn,
    h('div', { class: 'sls-grid3' },
      range('fx', id + '-fx', 'Across', 0, 100, 1, (v) => v + '%'),
      range('fy', id + '-fy', 'Down', 0, 100, 1, (v) => v + '%'),
      range('zoom', id + '-z', 'Zoom', 1, 2.5, 0.05, (v) => Number(v).toFixed(2) + '×')),
    h('p', { class: 'sls-note sls-drag-hint', text: 'You can also drag the photo in the preview to move it.' }));
  const gateOpts = h('div', { class: 'sls-grid2' },
    h('div', {}, h('div', { class: 'sls-lab', text: 'Window' }), seg('Window', [{ v: 'auto', l: 'Auto' }, { v: 'wide', l: 'Wide' }, { v: 'inset', l: 'Inset' }], (v) => st.win === v, (v) => set({ win: v }))),
    h('div', {}, h('div', { class: 'sls-lab', text: 'Photo is' }), seg('Photo is', [{ v: 'dark', l: 'Dark' }, { v: 'light', l: 'Light' }], (v) => st.tone === v, (v) => set({ tone: v }))));
  secPhoto.appendChild(gateOpts);
  segs.push(() => {
    const has = !!st.photo;
    pickLabel.lastChild.textContent = st.reading ? 'Preparing…' : has ? 'Change photo' : 'Choose a photo';
    removeBtn.hidden = !has;
    photoInfo.textContent = has
      ? `${st.photo.sourceWidth} × ${st.photo.sourceHeight} photo, prepared in this browser. Location data removed. Nothing is uploaded.`
      : 'Choose a photo from this device. It is prepared in this browser and never uploaded.';
    gateOpts.hidden = st.kind !== 'gate';
  });

  // words
  const noteArea = h('textarea', { id: id + '-note', maxlength: 140, rows: 3, onInput: (e) => set({ noteText: e.target.value }, 'noteText') });
  const noteCount = h('p', { class: 'sls-note' });
  segs.push(() => { if (document.activeElement !== noteArea) noteArea.value = st.noteText; noteCount.textContent = String(st.noteText || '').length + ' of 140 characters. Short reads best.'; });
  const noteWrap = field(id + '-note', 'The note', noteArea, noteCount);
  const factWrap = h('div', { class: 'sls-stack' },
    h('div', {}, h('div', { class: 'sls-lab', text: 'Layout' }), seg('Layout', ['One price', 'Rate card', 'Steps', 'Statement'].map((x) => ({ v: x, l: x })), (v) => st.layout === v, (v) => set({ layout: v }))),
    h('div', {}, h('div', { class: 'sls-lab', text: 'Service' }), seg('Service', SERV.map((x) => ({ v: x, l: SERVL[x] })), (v) => st.service === v, (v) => set({ service: v })),
      (() => { const p = h('p', { class: 'sls-note' }); segs.push(() => { p.textContent = st.rates ? 'Prices come from the rate card in Business settings' + (st.rates.version ? ' (version ' + st.rates.version + ')' : '') + '. They cannot be typed in by hand.' : 'Prices come from the approved rate card. They cannot be typed in by hand.'; }); return p; })()));
  const dogWrap = h('div', { class: 'sls-stack' },
    h('div', { class: 'sls-grid2' }, text('name', id + '-name', 'Dog name', 28), text('activity', id + '-act', 'Moment', 28)),
    (() => { const w = text('line', id + '-line', 'Line on the image', 80); w.classList.add('sls-only-photo'); return w; })(),
    h('div', { class: 'sls-grid2 sls-narrow' }, num('day', id + '-day', 'Day'), num('of', id + '-of', 'Of')));
  const secWords = section(3, 'Words', noteWrap, factWrap, dogWrap);
  segs.push(() => {
    noteWrap.hidden = st.kind !== 'note';
    factWrap.hidden = st.kind !== 'fact';
    dogWrap.hidden = st.kind === 'fact';
    dogWrap.querySelector('.sls-only-photo').hidden = !(st.kind === 'open' || st.kind === 'gate');
  });

  // look
  const grainBox = h('input', { type: 'checkbox', id: id + '-grain', onChange: (e) => set({ grain: e.target.checked }) });
  segs.push(() => { grainBox.checked = st.grain; });
  const matWrap = h('div', {}, h('div', { class: 'sls-lab', text: 'Material' }),
    seg('Material', ['Cut', 'Coral silk', 'None'].map((x) => ({ v: x, l: x })), (v) => derive().mat === v, (v) => set({ mat: v }), {
      off: (v) => (v === 'Coral silk' && st.cw !== 'powder') ? 'Coral silk belongs to Powder + Coral' : '',
      hide: (v) => v === 'Coral silk' && st.kind === 'gate'
    }));
  const secLook = section(4, 'Look',
    seg('Colourway', Object.entries(CWS).map(([k, c]) => ({ v: k, l: c.label, sw: [c.c1, c.c2] })), (v) => st.cw === v, (v) => set({ cw: v }), { cls: 'sls-seg-cw' }),
    matWrap,
    h('label', { class: 'sls-check', for: id + '-grain' }, grainBox, h('span', { text: 'Raven grain on dark grounds' })));
  segs.push(() => { matWrap.hidden = st.kind === 'open'; });

  // paw
  const pawNote = h('p', { class: 'sls-note' });
  const spots = seg('Position', [{ v: 'br', l: 'Bottom right' }, { v: 'bl', l: 'Bottom left' }, { v: 'tr', l: 'Top right' }], (v) => st.spot === v, (v) => set({ spot: v }));
  const secPaw = section(5, 'Paw',
    seg('Paw', ['none', 'painted', 'trace', 'wax', 'deboss'].map((p) => ({ v: p, l: p === 'none' ? 'None' : PAW[p].lab })), (v) => derive().paw === v, (v) => set({ paw: v }), {
      off: (v) => (v === 'deboss' && !derive().darkGround) ? 'The deboss is pressed into dark grounds only' : ''
    }), spots, pawNote);
  segs.push(() => {
    const D = derive();
    spots.hidden = D.paw === 'none';
    pawNote.textContent = D.paw !== 'none' ? 'The colour follows the colourway: Coral or Raven on Powder, Powder on Raven, Poppy wax on Raven + Poppy.' : 'Add a print or a seal if the post marks a moment: a first stay, a homecoming, a regular.';
  });

  // size
  const secSize = section(6, 'Size', seg('Size', Object.entries(FMTS).map(([k, f]) => ({ v: k, l: f.label, s: f.sub })), (v) => derive().fmt === v, (v) => set({ fmt: v }), {
    hide: (v) => !derive().allowed.includes(v), cls: 'sls-seg-size'
  }));

  // checks
  const conBox = h('input', { type: 'checkbox', id: id + '-con', onChange: (e) => set({ consent: e.target.checked }, 'ui') });
  const verBox = h('input', { type: 'checkbox', id: id + '-ver', onChange: (e) => set({ verified: e.target.checked }, 'ui') });
  const conText = h('span');
  const secChecks = h('section', { class: 'sls-sec sls-checks', role: 'group', 'aria-labelledby': id + '-chk' },
    h('h2', { class: 'sls-h2', id: id + '-chk', text: 'Before you download' }),
    h('label', { class: 'sls-check', for: id + '-con' }, conBox, conText),
    h('label', { class: 'sls-check', for: id + '-ver' }, verBox, h('span', { text: 'The day, stay length and moment match the booking record.' })),
    h('p', { class: 'sls-note', text: 'Changing the photo, the name or the words clears these ticks, so they always describe what you download.' }));
  segs.push(() => {
    const D = derive();
    secChecks.hidden = !D.needsChecks;
    conBox.checked = st.consent; verBox.checked = st.verified;
    conText.textContent = st.kind === 'note' ? 'The owner is happy for their dog’s name to appear in a post.' : 'The owner has given written consent for this photo and their dog’s name.';
  });

  const secKind = section(1, 'Post type', seg('Post type', KINDS.map((k) => ({ v: k[0], l: k[1], s: k[2] })), (v) => st.kind === v, (v) => set({ kind: v }, 'kind'), { cls: 'sls-seg-kind' }));
  secKind._title(1);

  const form = h('form', { class: 'sls-controls', novalidate: true, onSubmit: (e) => e.preventDefault() },
    secKind, secPhoto, secWords, secLook, secPaw, secSize, secChecks);
  segs.push(() => {
    const p = st.kind === 'open' || st.kind === 'gate';
    secPhoto.hidden = !p;
    let n = 2;
    if (p) secPhoto._title(n++);
    secWords._title(n++); secLook._title(n++); secPaw._title(n++); secSize._title(n++);
  });

  // ---------- preview
  const post = h('div', { class: 'sls-post', id: id + '-post' });
  const outImg = h('img', { class: 'sls-out', alt: 'The downloaded file, shown at preview size' });
  const scaler = h('div', { class: 'sls-scaler' }, outImg, post);
  const box = h('div', { class: 'sls-box' }, scaler);
  const stage = h('div', { class: 'sls-stage' }, box);
  const pvTitle = h('div', { class: 'sls-pv-t' });
  const ribbon = h('div', { class: 'sls-ribbon' });
  const status = h('p', { class: 'sls-status', role: 'status', 'aria-live': 'polite' });
  const dl = h('button', { type: 'button', class: 'sls-dl', onClick: doExport });
  const viewBtn = h('button', { type: 'button', class: 'sls-btn sls-btn-quiet', onClick: () => set({ showOut: !st.showOut }, 'ui') }, h('span', { class: 'sls-btn-l' }));
  const fname = h('p', { class: 'sls-fname' });
  const actions = h('div', { class: 'sls-actions' }, dl, viewBtn);
  const preview = h('section', { class: 'sls-preview', 'aria-label': 'Preview' },
    h('div', { class: 'sls-pv-head' }, pvTitle, ribbon), stage, actions, fname, status);

  const head = h('header', { class: 'sls-head' },
    h('p', { class: 'sls-eyebrow' }, 'STAY LOG STUDIO', h('span', { 'aria-hidden': 'true' })),
    h('h1', { class: 'sls-h1' }, 'Make a post', h('span', { class: 'sls-dot', text: '.' })),
    h('p', { class: 'sls-lede', text: 'Choose a post type, add the photo and words, pick the look, then download the finished file at full size.' }));

  const app = h('div', { class: 'sls' + (options.embedded ? ' is-embedded' : ''), 'data-sls': '' }, options.embedded ? null : head, h('div', { class: 'sls-body' }, form, preview));
  root.appendChild(app);

  // drag the photo in the preview
  let drag = null;
  post.addEventListener('pointerdown', (e) => {
    if (st.busy || !st.photo || !(st.kind === 'open' || st.kind === 'gate') || st.showOut) return;
    drag = { x: e.clientX, y: e.clientY, fx: st.fx, fy: st.fy };
    post.setPointerCapture(e.pointerId);
  });
  post.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const s = scale || 1;
    const k = 100 / (1080 * s) / Math.max(1, st.zoom * 0.9);
    set({ fx: Math.max(0, Math.min(100, Math.round(drag.fx - (e.clientX - drag.x) * k))), fy: Math.max(0, Math.min(100, Math.round(drag.fy - (e.clientY - drag.y) * k))) }, 'fx');
  });
  const endDrag = () => { drag = null; };
  post.addEventListener('pointerup', endDrag);
  post.addEventListener('pointercancel', endDrag);

  // drop a photo anywhere on the preview
  stage.addEventListener('dragover', (e) => { if (st.kind === 'open' || st.kind === 'gate') { e.preventDefault(); stage.classList.add('is-drop'); } });
  stage.addEventListener('dragleave', () => stage.classList.remove('is-drop'));
  stage.addEventListener('drop', (e) => {
    if (st.busy) { e.preventDefault(); stage.classList.remove('is-drop'); return; }
    stage.classList.remove('is-drop');
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f && (st.kind === 'open' || st.kind === 'gate')) { e.preventDefault(); takeFile(f); }
  });

  async function takeFile(f) {
    set({ reading: true, status: 'Preparing your photo in this browser…' }, 'ui');
    try {
      const p = await preparePhoto(f);
      if (st.photo) URL.revokeObjectURL(st.photo.url);
      set({ photo: p, fx: 50, fy: 40, zoom: 1, reading: false, status: 'Photo ready. It stays in this browser tab.' }, 'photo');
    } catch (err) {
      set({ reading: false, status: err && err.message ? err.message : 'Could not read that photo.' }, 'ui');
    }
  }

  // ---------- scale the preview to the space it has
  let scale = 0.5;
  function fit() {
    const D = derive();
    const w = stage.clientWidth || 600;
    const maxH = Math.max(320, Math.min(window.innerHeight * 0.78, 980));
    scale = Math.min(w / 1080, maxH / D.H, 1);
    box.style.width = Math.round(1080 * scale) + 'px';
    box.style.height = Math.round(D.H * scale) + 'px';
    scaler.style.height = D.H + 'px';
    scaler.style.transform = 'scale(' + scale + ')';
  }
  const ro = 'ResizeObserver' in window ? new ResizeObserver(fit) : null;
  if (ro) ro.observe(stage); else window.addEventListener('resize', fit);

  // ---------- render the post
  let raf = 0;
  function paint() {
    raf = 0;
    const D = derive();
    const tplName = { open: 'LogOpen', gate: 'LogFrame', note: 'LogNote', fact: 'LogFact' }[D.K];
    const common = { format: D.fmt, colourway: D.cw.label, grain: st.grain ? 'On' : 'Off' };
    let props;
    if (D.K === 'open') props = Object.assign(common, { photo: st.photo ? st.photo.url : '', focusX: st.fx, focusY: st.fy, zoom: st.zoom, title: st.name, line: st.line, slateA: D.slateA, slateB: st.activity, mark: '', grain: st.grain, brief: 'Choose a photo to begin.' });
    else if (D.K === 'gate') props = Object.assign(common, { photo: st.photo ? st.photo.url : '', focusX: st.fx, focusY: st.fy, zoom: st.zoom, title: st.name, line: st.line, slateA: D.slateA, slateB: st.activity, mark: '', win: st.win, tone: st.tone, material: D.mat === 'Cut' ? 'Cut' : 'None', brief: 'Choose a photo to begin.' });
    else if (D.K === 'note') props = Object.assign(common, { kicker: 'From the log', corner: st.name, text: st.noteText || ' ', slateA: D.slateA, slateB: st.activity, material: D.mat });
    else props = Object.assign(common, { layout: st.layout, service: st.service, kicker: KICK[st.service] || 'Boarding', material: D.mat, rates: st.rates || undefined });
    const frag = renderTemplate(TEMPLATES[tplName], props, assetBase);
    post.style.height = D.H + 'px';
    post.replaceChildren(frag);
    if (D.paw !== 'none') {
      const P = PAW[D.paw];
      const pw = P.w, ph = Math.round(pw / P.r);
      const m = 72, bottom = Math.round(D.H * (D.fmt === 'feed' ? 0.19 : D.fmt === 'square' ? 0.2 : 0.22));
      let x, y;
      if (st.spot === 'tr') { x = 1080 - m - pw; y = D.fmt === 'feed' ? 150 : D.fmt === 'square' ? 130 : 300; }
      else { x = st.spot === 'bl' ? m : 1080 - m - pw; y = D.H - bottom - ph; }
      const rot = D.paw === 'wax' ? 9 : D.paw === 'deboss' ? -8 : (st.spot === 'bl' ? -14 : 14);
      const file = {
        painted: st.cw === 'powder' ? 'paw-painted-coral' : 'paw-painted-powder',
        trace: st.cw === 'powder' ? 'paw-trace-raven' : 'paw-trace-powder',
        wax: st.cw === 'powder' ? 'paw-wax-raven' : st.cw === 'poppy' ? 'paw-wax-poppy' : 'paw-wax-powder',
        deboss: 'paw-deboss-raven'
      }[D.paw];
      // an <img>, not a CSS background: it is decoded before export and embedded reliably
      post.appendChild(h('img', { alt: '', 'aria-hidden': 'true', src: assetBase + 'img/' + file + '.webp', class: 'sls-paw',
        style: `left:${x}px;top:${y}px;width:${pw}px;height:${ph}px;transform:rotate(${rot}deg);${D.paw === 'wax' ? 'filter:drop-shadow(0 14px 16px rgba(18,7,9,.32));' : ''}` }));
    }
  }

  function update() {
    segs.forEach((f) => f());
    const D = derive();
    pvTitle.textContent = 'EXPORT PREVIEW · 1080 × ' + D.H;
    ribbon.textContent = D.ribbon;
    ribbon.classList.toggle('is-ready', !D.exportOff && !st.busy);
    dl.disabled = D.exportOff;
    dl.textContent = st.busy ? 'Rendering…' : 'Download PNG';
    fname.textContent = D.fileName;
    status.textContent = st.status;
    viewBtn.hidden = !st.outUrl;
    viewBtn.setAttribute('aria-pressed', st.showOut ? 'true' : 'false');
    viewBtn.firstChild.textContent = st.showOut ? 'Back to editing' : 'View file';
    outImg.hidden = !(st.outUrl && st.showOut);
    if (st.outUrl) outImg.src = st.outUrl; else outImg.removeAttribute('src');
    post.classList.toggle('is-draggable', !!st.photo && D.isPhoto);
    fit();
    if (!raf) raf = requestAnimationFrame(paint);
  }

  function lock(on) {
    form.inert = on; // no edits while the file renders: what is captured is what the metadata describes
    app.setAttribute('aria-busy', on ? 'true' : 'false');
  }
  let startingExport = false;
  async function doExport() {
    if (st.busy || startingExport) return;
    // The staff host refreshes authoritative rates at the export boundary.
    // A second press cannot race that read; capture only after it completes.
    startingExport = true;
    try {
      if (options.beforeExport) await options.beforeExport();
    } catch {
      set({status: 'Current prices could not be checked. Reconnect and download again.'}, 'ui');
      return;
    } finally { startingExport = false; }
    if (destroyed) return;
    const D = derive();
    if (D.exportOff) return;
    if (raf) { cancelAnimationFrame(raf); paint(); }
    // snapshot everything the file and its metadata describe before rendering starts
    const at = rev;
    const meta = { rateCard: D.K === 'fact' && st.rates ? (st.rates.version || null) : null, fileName: D.fileName, width: 1080, height: D.H, kind: D.K, format: D.fmt, colourway: D.cw.label, material: D.mat, paw: D.paw,
      dog: D.K === 'fact' ? null : st.name, day: D.slateA || null, consent: D.needsChecks ? st.consent : null, verified: D.needsChecks ? st.verified : null,
      user: options.user || null, at: new Date().toISOString() };
    if (st.outUrl) URL.revokeObjectURL(st.outUrl);
    st.outUrl = ''; st.showOut = false;
    lock(true);
    set({ busy: true, status: 'Rendering the full-size file…' }, 'ui');
    let url = '';
    try {
      const blob = await exportPNG(post, 1080, D.H, assetBase, options.vendorUrl);
      if (destroyed) return;
      if (rev !== at) { // the post changed during the render: deliver nothing rather than a file that disagrees with its record
        lock(false);
        set({ busy: false, status: 'The post changed while the file was rendering, so nothing was downloaded. Download again.' }, 'ui');
        return;
      }
      url = URL.createObjectURL(blob);
      if (options.autoDownload !== false) {
        const a = h('a', { href: url, download: meta.fileName, rel: 'noopener' });
        document.body.appendChild(a); a.click(); a.remove();
      }
      try { options.onExport && options.onExport({ blob, fileName: meta.fileName, meta }); } catch (e) { console.error(e); }
      st.outUrl = url;
      lock(false);
      st.busy = false;
      st.status = 'Downloaded at 1080 × ' + meta.height + '. Press View file to check it.';
      update();
    } catch (err) {
      if (url) URL.revokeObjectURL(url);
      if (destroyed) return;
      lock(false);
      set({ busy: false, status: 'Could not create the file: ' + (err && err.message ? err.message : 'unknown error') + ' Try again.' }, 'ui');
    } finally {
      // a rate card that took effect during the render applies now; it changes the post, so the shown file is cleared
      if (!destroyed && pendingRates !== undefined) { const r = pendingRates; pendingRates = undefined; applyRates(r); }
    }
  }
  function applyRates(r) {
    rev++;
    st.rates = r || null;
    if (st.outUrl) { URL.revokeObjectURL(st.outUrl); st.outUrl = ''; st.showOut = false; }
    update();
  }

  update();
  fit();

  return {
    destroy() {
      destroyed = true;
      if (raf) cancelAnimationFrame(raf);
      if (ro) ro.disconnect(); else window.removeEventListener('resize', fit);
      if (st.photo) URL.revokeObjectURL(st.photo.url);
      if (st.outUrl) URL.revokeObjectURL(st.outUrl);
      app.remove();
    },
    setRates(r) { if (st.busy) { pendingRates = r; return; } applyRates(r); },
    setAvailable(available) {
      if (!available && st.available) {
        rev++;
        if (st.outUrl) URL.revokeObjectURL(st.outUrl);
        st.outUrl = ''; st.showOut = false;
      }
      st.available = available === true;
      update();
    },
    getState() { return JSON.parse(JSON.stringify(Object.assign({}, st, { photo: st.photo ? { width: st.photo.width, height: st.photo.height } : null }))); }
  };
}
