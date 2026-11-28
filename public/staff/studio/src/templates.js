// GENERATED from the approved Stay Log v3 templates (LogOpen, LogFrame, LogNote, LogFact).
// Do not edit by hand: the markup and logic are the approved designs. Regenerate with tools/generate-templates.py.
// Asset paths use the token @ASSET@, replaced with the module asset base at render time.
class DCLogic { constructor(props) { this.props = props || {}; this.state = {}; } }
// Prices in the Fact template come from the authoritative rate card when one is passed as props.rates;
// without it they fall back to the approved card (Standard 2,500, camera cage 3,000, 30-day discount 10,000).
function __rates(r) { r = r || {}; const f = (n) => Math.round(Number(n)).toLocaleString('en-US'); const std = r.std ?? 2500, cam = r.cam ?? 3000, disc = r.pkgDisc ?? 10000; return { std: f(std), cam: f(cam), disc: f(disc), p: f(std * 30 - disc), pc: f(cam * 30 - disc) }; }

// ---- LogOpen
class LogOpen extends DCLogic {
  renderVals() {
    const p = this.props;
    const format = p.format ?? 'feed';
    const F = {
      feed:   { W: 1080, H: 1350, m: 64, inset: 64,  tick: 48,  ts: 210, ls: 36, ss: 26 },
      story:  { W: 1080, H: 1920, m: 72, inset: 300, tick: 270, ts: 220, ls: 40, ss: 28 },
      reel:   { W: 1080, H: 1920, m: 72, inset: 330, tick: 290, ts: 210, ls: 38, ss: 27 },
      square: { W: 1080, H: 1080, m: 56, inset: 56,  tick: 42,  ts: 160, ls: 32, ss: 24 }
    };
    const f = F[format] || F.feed;
    const top = (p.align ?? 'bottom') === 'top';
    const quiet = (p.nameMode ?? 'name') === 'quiet';

    let t = String(p.title ?? 'Coco').trim();
    let stop = '.';
    if (/[.]$/.test(t)) t = t.slice(0, -1);
    else if (/[!?]$/.test(t)) stop = '';
    if (!t) stop = '';
    const len = t.length + stop.length;
    const ts = len > 7 ? Math.max(Math.round(f.ts * .42), Math.round(f.ts * 7 / len)) : f.ts;

    const line = String(p.line ?? 'Supervised evening playtime rather than joining in. Her call.').trim();
    const a = String(p.slateA ?? 'Day 03 / 05').trim();
    const b = String(p.slateB ?? 'Evening playtime').trim();
    const photo = String(p.photo ?? '').trim();
    const mark = String(p.mark ?? 'VISUAL STAND-IN · NOT AN APEX DOG').trim();
    const showName = !quiet && !!t;
    const showLine = !quiet && !!line;

    const hLines = [], vLines = [];
    if (format === 'feed') vLines.push({ x: 34 }, { x: 1043 });
    if (format === 'story') hLines.push({ y: 250, label: 'APP BAR · KEEP CLEAR ABOVE', labelTop: -42 }, { y: 1670, label: 'REPLY BAR · KEEP CLEAR BELOW', labelTop: 12 });
    if (format === 'reel') hLines.push({ y: 240, label: 'GRID CROP 3:4', labelTop: 12 }, { y: 1680, label: 'GRID CROP 3:4', labelTop: -42 });

    const tickY = top ? f.H - f.tick - 40 : f.tick;
    const cwRaw = String(p.colourway ?? 'Raven + Poppy').toLowerCase();
    const cw = (cwRaw.includes('coral') || cwRaw.startsWith('powder')) ? 'powder' : (cwRaw.includes('poppy') ? 'poppy' : 'raven');
    const card = cw === 'powder';
    const C = {
      poppy:  { acc: '#FF4D55', nameInk: '#fff',    stopColor: '#FF4D55', lineInk: '#E4ECF0', slateInk: '#BCCED8' },
      raven:  { acc: '#BFE3F4', nameInk: '#BFE3F4', stopColor: '#EEF6FA', lineInk: '#E4ECF0', slateInk: '#BCCED8' },
      powder: { acc: '#FD6E6E', nameInk: '#120709', stopColor: '#FD6E6E', lineInk: '#3C3236', slateInk: '#41373B' }
    }[cw];
    const cardPadY = card ? Math.round(f.ls * 1.25) : 0;
    const cardPadX = card ? Math.round(f.ls * 1.35) : 0;
    return {
      W: f.W, H: f.H, m: f.m,
      hasPhoto: !!photo, noPhoto: !photo, photo,
      alt: mark ? 'Visual stand-in photo of a dog, not an Apex dog' : (t ? 'Photo of ' + t : 'Dog photo'),
      fx: p.focusX ?? 42, fy: p.focusY ?? 30, zoom: p.zoom ?? 1,
      brief: String(p.brief ?? 'One dog filling the frame, daylight. Post only with the owner’s written consent and checked stay details.'),
      briefTop: top ? Math.round(f.H * .62) : f.tick + 90,
      scrimEdge: top ? 'top' : 'bottom', scrimDir: top ? 'to bottom' : 'to top',
      scrimH: Math.round(f.H * (quiet ? .26 : .5)), scrimA: quiet ? .7 : .88, scrimMid: quiet ? .3 : .58,
      grain: (p.grain ?? true) && !card, grainFilter: cw === 'raven' ? 'saturate(.15) brightness(1.15)' : 'none',
      hasScrim: !card, photoTick: !card, isCard: card,
      acc: C.acc, nameInk: C.nameInk, stopColor: C.stopColor, lineInk: C.lineInk, slateInk: C.slateInk,
      shadow: card ? 'none' : '0 2px 30px rgba(14,8,9,.35)',
      textRight: card ? 'auto' : (f.m + 'px'), textMax: f.W - 2 * f.m,
      cardPadY, cardPadX, cardBg: card ? '#BFE3F4' : 'transparent', cardR: card ? 30 : 0, tkx: card ? Math.round(cardPadY * .38) : -18, tky: card ? Math.round(cardPadY * .38) : -Math.round(f.ls * 1.25), tks: card ? 34 : 40, tkw: card ? 4 : 5,
      tickX: f.m - 16, tickY,
      hasMark: !!mark, mark,
      textEdge: top ? 'top' : 'bottom', textInset: top ? f.tick + 70 : f.inset,
      gap: Math.round(f.ls * .5),
      showName, titleText: t, stop, ts: card ? Math.round(ts * .74) : ts,
      hasLine: showLine, line, ls: f.ls,
      hasA: !!a, hasB: !!b, hasBoth: !!a && !!b, slateA: a, slateB: b,
      ss: f.ss, slashH: Math.round(f.ss * 1.2), count: String(p.count ?? ''),
      guides: p.guides === true || p.guides === 'true', hLines, vLines
    };
  }
}
const LogOpen_MARKUP = "<div style=\"position: relative; width: {{W}}px; height: {{H}}px; overflow: hidden; background: #0E0809; color: #fff; font-family: 'Inter Tight', ui-sans-serif, system-ui, sans-serif; -webkit-font-smoothing: antialiased\">\n\n  <sc-if value=\"{{hasPhoto}}\" hint-placeholder-val=\"{{ false }}\">\n    <img src=\"{{photo}}\" alt=\"{{alt}}\" style=\"position: absolute; inset: 0; display: block; width: 100%; height: 100%; object-fit: cover; object-position: {{fx}}% {{fy}}%; transform: scale({{zoom}}); transform-origin: {{fx}}% {{fy}}%\">\n  </sc-if>\n  <sc-if value=\"{{noPhoto}}\" hint-placeholder-val=\"{{ true }}\">\n    <div style=\"position: absolute; inset: 0; background: linear-gradient(160deg, #3A2E33 0%, #1B1215 100%)\">\n      <div style=\"position: absolute; left: 33.333%; top: 0; bottom: 0; width: 1px; background: rgba(255,255,255,.09)\"></div>\n      <div style=\"position: absolute; left: 66.666%; top: 0; bottom: 0; width: 1px; background: rgba(255,255,255,.09)\"></div>\n      <div style=\"position: absolute; top: 33.333%; left: 0; right: 0; height: 1px; background: rgba(255,255,255,.09)\"></div>\n      <div style=\"position: absolute; top: 66.666%; left: 0; right: 0; height: 1px; background: rgba(255,255,255,.09)\"></div>\n      <div style=\"position: absolute; left: {{m}}px; right: {{m}}px; top: {{briefTop}}px; color: #DCE8EE\">\n        <span style=\"display: inline-block; padding: 9px 16px; border-radius: 9px; background: #BFE3F4; color: #120709; font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 22px; font-weight: 700; letter-spacing: .2em\">PHOTO SLOT</span>\n        <div style=\"margin-top: 20px; max-width: 820px; font-size: 32px; line-height: 1.32; font-weight: 500\">{{brief}}</div>\n      </div>\n    </div>\n  </sc-if>\n\n  <sc-if value=\"{{hasScrim}}\" hint-placeholder-val=\"{{ true }}\">\n  <div style=\"position: absolute; left: 0; right: 0; {{scrimEdge}}: 0; height: {{scrimH}}px; background: linear-gradient({{scrimDir}}, rgba(14,8,9,{{scrimA}}) 0%, rgba(14,8,9,{{scrimMid}}) 42%, rgba(14,8,9,0) 100%); pointer-events: none\"></div>\n  </sc-if>\n  <sc-if value=\"{{grain}}\" hint-placeholder-val=\"{{ true }}\">\n    <img src=\"@ASSET@img/raven-grain-corner.webp\" alt=\"\" style=\"position: absolute; right: -120px; {{scrimEdge}}: -120px; width: 900px; height: auto; mix-blend-mode: screen; opacity: .28; filter: {{grainFilter}}; pointer-events: none\">\n  </sc-if>\n\n\n\n  <sc-if value=\"{{hasMark}}\" hint-placeholder-val=\"{{ false }}\">\n    <div style=\"position: absolute; right: {{tickX}}px; top: {{tickY}}px; padding: 10px 16px; border-radius: 10px; background: rgba(14,8,9,.78); color: #fff; font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 21px; font-weight: 700; letter-spacing: .14em; white-space: nowrap\">{{mark}}</div>\n  </sc-if>\n\n  <div style=\"position: absolute; left: {{m}}px; right: {{textRight}}; {{textEdge}}: {{textInset}}px; max-width: {{textMax}}px; box-sizing: border-box; display: flex; flex-direction: column; gap: {{gap}}px; padding: {{cardPadY}}px {{cardPadX}}px; background: {{cardBg}}; border-radius: {{cardR}}px\">\n    <span style=\"position: absolute; left: {{tkx}}px; top: {{tky}}px; width: {{tks}}px; height: {{tks}}px; box-sizing: border-box; border-top: {{tkw}}px solid {{acc}}; border-left: {{tkw}}px solid {{acc}}\"></span>\n    <sc-if value=\"{{showName}}\" hint-placeholder-val=\"{{ true }}\">\n      <h2 style=\"margin: 0; font-size: {{ts}}px; line-height: .86; font-weight: 900; letter-spacing: -.058em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-bottom: 8px; color: {{nameInk}}; text-shadow: {{shadow}}\">{{titleText}}<span style=\"color: {{stopColor}}\">{{stop}}</span></h2>\n    </sc-if>\n    <sc-if value=\"{{hasLine}}\" hint-placeholder-val=\"{{ true }}\">\n      <p style=\"margin: 0; max-width: 900px; font-size: {{ls}}px; line-height: 1.3; font-weight: 500; color: {{lineInk}}; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden\">{{line}}</p>\n    </sc-if>\n    <div style=\"display: flex; align-items: center; justify-content: space-between; gap: 24px; font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: {{ss}}px; line-height: 1.2; font-weight: 600; letter-spacing: .22em; text-transform: uppercase; color: {{slateInk}}; white-space: nowrap\">\n      <span style=\"display: flex; align-items: center\">\n        <sc-if value=\"{{hasA}}\" hint-placeholder-val=\"{{ true }}\"><span>{{slateA}}</span></sc-if>\n        <sc-if value=\"{{hasBoth}}\" hint-placeholder-val=\"{{ true }}\"><span style=\"display: inline-block; width: 4px; height: {{slashH}}px; margin: 0 20px; background: {{acc}}; transform: skewX(-20deg)\"></span></sc-if>\n        <sc-if value=\"{{hasB}}\" hint-placeholder-val=\"{{ true }}\"><span>{{slateB}}</span></sc-if>\n      </span>\n      <span>{{count}}</span>\n    </div>\n  </div>\n\n  <sc-if value=\"{{guides}}\" hint-placeholder-val=\"{{ false }}\">\n    <sc-for list=\"{{hLines}}\" as=\"g\" hint-placeholder-count=\"2\">\n      <div style=\"position: absolute; left: 0; right: 0; top: {{g.y}}px; border-top: 3px dashed rgba(191,227,244,.9); pointer-events: none\">\n        <span style=\"position: absolute; right: 16px; top: {{g.labelTop}}px; padding: 5px 10px; border-radius: 6px; background: #BFE3F4; color: #120709; font-family: 'JetBrains Mono', monospace; font-size: 18px; font-weight: 700; letter-spacing: .14em\">{{g.label}}</span>\n      </div>\n    </sc-for>\n    <sc-for list=\"{{vLines}}\" as=\"g\" hint-placeholder-count=\"2\">\n      <div style=\"position: absolute; top: 0; bottom: 0; left: {{g.x}}px; border-left: 3px dashed rgba(191,227,244,.9); pointer-events: none\"></div>\n    </sc-for>\n  </sc-if>\n</div>";

// ---- LogFrame
class LogFrame extends DCLogic {
  renderVals() {
    const p = this.props;
    const format = p.format ?? 'feed';
    const win = p.win ?? 'auto';
    const F = {
      feed:   { W: 1080, H: 1350, m: 56, py: 56,  ph: 900,  padTop: 44, bottom: 46,  ts: 168, ls: 34, ss: 26 },
      story:  { W: 1080, H: 1920, m: 56, py: 260, ph: 1090, padTop: 48, bottom: 250, ts: 176, ls: 38, ss: 28 },
      reel:   { W: 1080, H: 1920, m: 56, py: 296, ph: 1004, padTop: 40, bottom: 270, ts: 168, ls: 34, ss: 26 },
      square: { W: 1080, H: 1080, m: 48, py: 48,  ph: 720,  padTop: 34, bottom: 40,  ts: 128, ls: 30, ss: 24 }
    }[format] || null;
    const f = F || { W: 1080, H: 1350, m: 56, py: 56, ph: 900, padTop: 44, bottom: 46, ts: 168, ls: 34, ss: 26 };
    const W = f.W, H = f.H, m = f.m;
    let px = m, py = f.py, pw = W - 2 * m, ph = f.ph;
    if (win === 'wide') { ph = Math.round(pw * 9 / 16); }
    else if (win === 'square') { const s = Math.min(pw, ph); pw = s; ph = s; px = Math.round((W - s) / 2); }
    else if (win === 'inset') { pw = Math.round((W - 2 * m) * 0.62); ph = Math.min(f.ph, Math.round(pw * 1.25)); px = Math.round((W - pw) / 2); }

    let t = String(p.title ?? 'Bruno').trim();
    let stop = '.';
    if (/[.]$/.test(t)) t = t.slice(0, -1);
    else if (/[!?]$/.test(t)) stop = '';
    if (!t) { t = ''; stop = ''; }
    const len = t.length + stop.length;
    const ts = len > 8 ? Math.max(Math.round(f.ts * 0.42), Math.round(f.ts * 8 / len)) : f.ts;

    const line = String(p.line ?? 'Still not sharing the ball.').trim();
    const a = String(p.slateA ?? 'Day 03 / 07').trim();
    const b = String(p.slateB ?? 'Morning playtime').trim();
    const photo = String(p.photo ?? '').trim();
    const tone = p.tone ?? 'dark';
    const light = tone === 'light';
    const k = pw / 968;
    const cwRaw = String(p.colourway ?? 'Raven + Poppy').toLowerCase();
    const cw = (cwRaw.includes('coral') || cwRaw.startsWith('powder')) ? 'powder' : (cwRaw.includes('poppy') ? 'poppy' : 'raven');
    const C = {
      poppy:  { bg: '#0E0809', ink: '#fff',    acc: '#FF4D55', stopColor: '#FF4D55', lede: '#C9D7DE', label: '#9FB6C2' },
      raven:  { bg: '#0E0809', ink: '#BFE3F4', acc: '#BFE3F4', stopColor: '#EEF6FA', lede: '#C9D7DE', label: '#9FB6C2' },
      powder: { bg: '#BFE3F4', ink: '#120709', acc: '#FD6E6E', stopColor: '#FD6E6E', lede: '#3C3236', label: '#41373B' }
    }[cw];
    const useGrain = p.grain ?? true;

    const hLines = [], vLines = [];
    if (format === 'feed') { vLines.push({ x: 34 }, { x: 1043 }); hLines.push({ y: 0, label: 'GRID CROP 3:4 · SIDES', labelTop: 14 }); }
    if (format === 'story') { hLines.push({ y: 250, label: 'APP BAR · KEEP CLEAR ABOVE', labelTop: -42 }, { y: 1670, label: 'REPLY BAR · KEEP CLEAR BELOW', labelTop: 12 }); }
    if (format === 'reel') { hLines.push({ y: 240, label: 'GRID CROP 3:4', labelTop: 12 }, { y: 1680, label: 'GRID CROP 3:4', labelTop: -42 }, { y: 285, label: 'FEED 4:5', labelTop: 58 }, { y: 1635, label: 'FEED 4:5', labelTop: -96 }); }

    const mat = String(this.props.material ?? 'Cut'); const matCut = mat === 'Cut'; const matSilk = mat === 'Coral silk';
    const grainOn = String(this.props.grain ?? 'On') !== 'Off';
    return {
      matCut, matSilk, grainOn,
      W, H, m, px, py, pw, ph,
      bg: C.bg, ink: C.ink, acc: C.acc, stopColor: C.stopColor, lede: C.lede, label: C.label,
      darkGrain: useGrain && cw !== 'powder', grainFilter: cw === 'raven' ? 'saturate(.15) brightness(1.15)' : 'none', pigment: useGrain && cw === 'powder',
      grainW: Math.round(W * 1.15),
      hasPhoto: !!photo, noPhoto: !photo, photo,
      alt: String(p.mark ?? '').trim() ? 'Visual stand-in photo of a dog, not an Apex dog' : (t ? ('Photo of ' + t) : 'Dog photo'),
      zoom: p.zoom ?? 1, hasMark: !!String(p.mark ?? '').trim(), mark: String(p.mark ?? ''), markSize: Math.round(20 * Math.max(k, .8)),
      fx: p.focusX ?? 50, fy: p.focusY ?? 42,
      slotBg: light ? 'linear-gradient(160deg, #D9E7EE 0%, #A8BFCB 100%)' : 'linear-gradient(160deg, #3A2E33 0%, #1B1215 100%)',
      slotLine: light ? 'rgba(18,7,9,.14)' : 'rgba(255,255,255,.09)',
      slotInk: light ? '#1E1418' : '#DCE8EE',
      pillBg: light ? '#120709' : '#BFE3F4',
      pillInk: light ? '#BFE3F4' : '#120709',
      ret: Math.round(120 * k), retHalfNeg: -Math.round(60 * k),
      slotPad: Math.round(36 * Math.max(k, .6)),
      tagSize: Math.round(22 * Math.max(k, .7)), tagSmall: Math.round(19 * Math.max(k, .7)),
      briefSize: Math.round(30 * Math.max(k, .7)),
      brief: String(p.brief ?? 'One dog, eye level, daylight. Post only with the owner’s written consent and checked stay details.'),
      tlx: px - 14, trx: px + pw + 14 - 34, tty: py - 14, tby: py + ph + 14 - 34,
      footTop: py + ph + f.padTop, footBottom: f.bottom,
      titleText: t, stop, ts,
      hasLine: !!line, line, lineGap: Math.round(f.ls * 0.55), ls: f.ls,
      hasA: !!a, hasB: !!b, hasBoth: !!a && !!b, slateA: a, slateB: b,
      ss: f.ss, slashH: Math.round(f.ss * 1.2),
      count: String(p.count ?? ''),
      guides: p.guides === true || p.guides === 'true', hLines, vLines
    };
  }
}
const LogFrame_MARKUP = "<div style=\"position: relative; width: {{W}}px; height: {{H}}px; overflow: hidden; background: {{bg}}; color: {{ink}}; font-family: 'Inter Tight', ui-sans-serif, system-ui, sans-serif; -webkit-font-smoothing: antialiased\">\n\n  <sc-if value=\"{{pigment}}\" hint-placeholder-val=\"{{ false }}\">\n    <sc-if value=\"{{matCut}}\" hint-placeholder-val=\"{{ true }}\"><div aria-hidden=\"true\" style=\"position: absolute; right: 40px; bottom: calc({{footBottom}}px - 40px); width: 520px; height: 85px; pointer-events: none\"><img src=\"@ASSET@img/cut-powder-pigment.png\" alt=\"\" style=\"position: absolute; left: 0; top: -102px; width: 520px; height: 287px; mix-blend-mode: multiply; opacity: .55\"><img src=\"@ASSET@img/cut-highlight.png\" alt=\"\" style=\"position: absolute; left: 0; top: -102px; width: 520px; height: 287px; mix-blend-mode: screen; opacity: .5\"><span style=\"position: absolute; left: 224px; top: 25px; width: 41px; height: 34px; background: #2A2226; -webkit-mask: url(@ASSET@img/apex-shepherd-mark.svg) center bottom/contain no-repeat; mask: url(@ASSET@img/apex-shepherd-mark.svg) center bottom/contain no-repeat\"></span></div></sc-if>\n  </sc-if>\n  <sc-if value=\"{{darkGrain}}\" hint-placeholder-val=\"{{ true }}\">\n    <sc-if value=\"{{grainOn}}\" hint-placeholder-val=\"{{ true }}\"><img src=\"@ASSET@img/raven-grain-corner.webp\" alt=\"\" style=\"position: absolute; right: -90px; bottom: -70px; width: {{grainW}}px; height: auto; mix-blend-mode: screen; opacity: .5; filter: {{grainFilter}}; pointer-events: none\"></sc-if>\n  </sc-if>\n\n  <div style=\"position: absolute; left: {{px}}px; top: {{py}}px; width: {{pw}}px; height: {{ph}}px; overflow: hidden; background: {{slotBg}}\">\n    <sc-if value=\"{{hasPhoto}}\" hint-placeholder-val=\"{{ false }}\">\n      <img src=\"{{photo}}\" alt=\"{{alt}}\" style=\"display: block; width: 100%; height: 100%; object-fit: cover; object-position: {{fx}}% {{fy}}%; transform: scale({{zoom}}); transform-origin: {{fx}}% {{fy}}%\">\n    </sc-if>\n    <sc-if value=\"{{hasMark}}\" hint-placeholder-val=\"{{ false }}\">\n      <div style=\"position: absolute; right: {{slotPad}}px; top: {{slotPad}}px; padding: 10px 16px; border-radius: 10px; background: rgba(14,8,9,.78); color: #fff; font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: {{markSize}}px; font-weight: 700; letter-spacing: .14em; white-space: nowrap\">{{mark}}</div>\n    </sc-if>\n    <sc-if value=\"{{noPhoto}}\" hint-placeholder-val=\"{{ true }}\">\n      <div style=\"position: absolute; left: 33.333%; top: 0; bottom: 0; width: 1px; background: {{slotLine}}\"></div>\n      <div style=\"position: absolute; left: 66.666%; top: 0; bottom: 0; width: 1px; background: {{slotLine}}\"></div>\n      <div style=\"position: absolute; top: 33.333%; left: 0; right: 0; height: 1px; background: {{slotLine}}\"></div>\n      <div style=\"position: absolute; top: 66.666%; left: 0; right: 0; height: 1px; background: {{slotLine}}\"></div>\n      <div style=\"position: absolute; left: {{fx}}%; top: {{fy}}%; width: {{ret}}px; height: {{ret}}px; margin-left: {{retHalfNeg}}px; margin-top: {{retHalfNeg}}px; border-radius: 50%; border: 3px solid {{slotInk}}; opacity: .75; box-sizing: border-box\">\n        <div style=\"position: absolute; left: 50%; top: -22px; bottom: -22px; width: 3px; margin-left: -1.5px; background: {{slotInk}}\"></div>\n        <div style=\"position: absolute; top: 50%; left: -22px; right: -22px; height: 3px; margin-top: -1.5px; background: {{slotInk}}\"></div>\n      </div>\n      <div style=\"position: absolute; left: {{slotPad}}px; top: {{slotPad}}px; display: flex; align-items: center; gap: 16px; font-family: 'JetBrains Mono', ui-monospace, monospace; font-weight: 700; letter-spacing: .2em\">\n        <span style=\"padding: 9px 16px; border-radius: 9px; background: {{pillBg}}; color: {{pillInk}}; font-size: {{tagSize}}px\">PHOTO SLOT</span>\n        <span style=\"color: {{slotInk}}; opacity: .8; font-size: {{tagSmall}}px\">REAL APEX PHOTO ONLY</span>\n      </div>\n      <div style=\"position: absolute; left: {{slotPad}}px; right: {{slotPad}}px; bottom: {{slotPad}}px; color: {{slotInk}}\">\n        <div style=\"font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: {{tagSmall}}px; font-weight: 700; letter-spacing: .22em; opacity: .8\">SHOT BRIEF</div>\n        <div style=\"margin-top: 10px; max-width: 760px; font-size: {{briefSize}}px; line-height: 1.32; font-weight: 500\">{{brief}}</div>\n      </div>\n    </sc-if>\n  </div>\n\n  <span style=\"position: absolute; left: {{tlx}}px; top: {{tty}}px; width: 34px; height: 34px; box-sizing: border-box; border-top: 4px solid {{acc}}; border-left: 4px solid {{acc}}\"></span>\n  <span style=\"position: absolute; left: {{trx}}px; top: {{tty}}px; width: 34px; height: 34px; box-sizing: border-box; border-top: 4px solid {{acc}}; border-right: 4px solid {{acc}}\"></span>\n  <span style=\"position: absolute; left: {{tlx}}px; top: {{tby}}px; width: 34px; height: 34px; box-sizing: border-box; border-bottom: 4px solid {{acc}}; border-left: 4px solid {{acc}}\"></span>\n  <span style=\"position: absolute; left: {{trx}}px; top: {{tby}}px; width: 34px; height: 34px; box-sizing: border-box; border-bottom: 4px solid {{acc}}; border-right: 4px solid {{acc}}\"></span>\n\n  <div style=\"position: absolute; left: {{m}}px; right: {{m}}px; top: {{footTop}}px; bottom: {{footBottom}}px; display: flex; flex-direction: column\">\n    <h2 style=\"margin: 0; font-size: {{ts}}px; line-height: .9; font-weight: 900; letter-spacing: -.055em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: {{ink}}; padding-bottom: 6px\">{{titleText}}<span style=\"color: {{stopColor}}\">{{stop}}</span></h2>\n    <sc-if value=\"{{hasLine}}\" hint-placeholder-val=\"{{ true }}\">\n      <p style=\"margin: {{lineGap}}px 0 0; max-width: 880px; font-size: {{ls}}px; line-height: 1.3; font-weight: 500; color: {{lede}}; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden\">{{line}}</p>\n    </sc-if>\n    <div style=\"margin-top: auto; display: flex; align-items: center; justify-content: space-between; gap: 24px; font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: {{ss}}px; line-height: 1.2; font-weight: 600; letter-spacing: .22em; text-transform: uppercase; color: {{label}}; white-space: nowrap\">\n      <span style=\"display: flex; align-items: center\">\n        <sc-if value=\"{{hasA}}\" hint-placeholder-val=\"{{ true }}\"><span>{{slateA}}</span></sc-if>\n        <sc-if value=\"{{hasBoth}}\" hint-placeholder-val=\"{{ true }}\"><span style=\"display: inline-block; width: 4px; height: {{slashH}}px; margin: 0 20px; background: {{acc}}; transform: skewX(-20deg)\"></span></sc-if>\n        <sc-if value=\"{{hasB}}\" hint-placeholder-val=\"{{ true }}\"><span>{{slateB}}</span></sc-if>\n      </span>\n      <span>{{count}}</span>\n    </div>\n  </div>\n\n  <sc-if value=\"{{guides}}\" hint-placeholder-val=\"{{ false }}\">\n    <sc-for list=\"{{hLines}}\" as=\"g\" hint-placeholder-count=\"2\">\n      <div style=\"position: absolute; left: 0; right: 0; top: {{g.y}}px; border-top: 3px dashed rgba(191,227,244,.9); pointer-events: none\">\n        <span style=\"position: absolute; right: 16px; top: {{g.labelTop}}px; padding: 5px 10px; border-radius: 6px; background: #BFE3F4; color: #120709; font-family: 'JetBrains Mono', monospace; font-size: 18px; font-weight: 700; letter-spacing: .14em\">{{g.label}}</span>\n      </div>\n    </sc-for>\n    <sc-for list=\"{{vLines}}\" as=\"g\" hint-placeholder-count=\"2\">\n      <div style=\"position: absolute; top: 0; bottom: 0; left: {{g.x}}px; border-left: 3px dashed rgba(191,227,244,.9); pointer-events: none\"></div>\n    </sc-for>\n  </sc-if>\n</div>";

// ---- LogNote
class LogNote extends DCLogic {
  renderVals() {
    const p = this.props;
    const format = p.format ?? 'feed';
    const T = {
      feed:   { W: 1080, H: 1350, pad: 80, top: 80,  bottom: 80,  ms: 26, fs: 96, ss: 26 },
      square: { W: 1080, H: 1080, pad: 68, top: 68,  bottom: 68,  ms: 24, fs: 82, ss: 24 },
      story:  { W: 1080, H: 1920, pad: 84, top: 290, bottom: 290, ms: 28, fs: 104, ss: 28 }
    };
    const f = T[format] || T.feed;
    const g0 = p.ground ?? 'powder';
    const cwRaw = String(p.colourway ?? 'From ground').toLowerCase();
    let cw;
    if (cwRaw.includes('coral') || cwRaw.startsWith('powder')) cw = 'powder';
    else if (cwRaw.includes('poppy')) cw = 'poppy';
    else if (cwRaw.startsWith('raven')) cw = 'raven';
    else cw = g0 === 'raven' ? 'poppy' : 'powder';
    const g = cw === 'powder' ? (g0 === 'mist' ? 'mist' : 'powder') : 'raven';
    const raven = g === 'raven';
    let body = String(p.text ?? 'Rex has decided the water bowl is a paddling pool. We have decided to refill it more often.').trim();
    let stop = '';
    if (/[.]$/.test(body)) { body = body.slice(0, -1); stop = '.'; }
    const n = body.length;
    const fs = n > 90 ? Math.max(Math.round(f.fs * .6), Math.round(f.fs * Math.sqrt(90 / n))) : f.fs;
    const a = String(p.slateA ?? 'Day 02 / 04').trim();
    const b = String(p.slateB ?? 'Afternoon').trim();
    const mat = String(this.props.material ?? 'Cut'); const matCut = mat === 'Cut'; const matSilk = mat === 'Coral silk';
    const grainOn = String(this.props.grain ?? 'On') !== 'Off';
    return {
      matCut, matSilk, grainOn,
      W: f.W, H: f.H, pad: f.pad, top: f.top, bottom: f.bottom, ms: f.ms, ss: f.ss, slashH: Math.round(f.ss * 1.2),
      bg: raven ? '#120709' : (g === 'mist' ? '#EEF6FA' : '#BFE3F4'),
      ink: raven ? (cw === 'raven' ? '#BFE3F4' : '#fff') : '#120709',
      label: raven ? '#9FB6C2' : '#41373B',
      stopColor: raven ? (cw === 'raven' ? '#EEF6FA' : '#FF4D55') : '#FD6E6E',
      grainFilter: cw === 'raven' ? 'saturate(.15) brightness(1.15)' : 'none',
      raven, powder: g === 'powder',
      kicker: String(p.kicker ?? 'From the log'), corner: String(p.corner ?? 'Sample'),
      body, stop, fs,
      hasA: !!a, hasB: !!b, hasBoth: !!a && !!b, slateA: a, slateB: b
    };
  }
}
const LogNote_MARKUP = "<div style=\"position: relative; width: {{W}}px; height: {{H}}px; overflow: hidden; background: {{bg}}; color: {{ink}}; font-family: 'Inter Tight', ui-sans-serif, system-ui, sans-serif; -webkit-font-smoothing: antialiased; box-sizing: border-box; padding: {{top}}px {{pad}}px {{bottom}}px; display: flex; flex-direction: column\">\n  <sc-if value=\"{{raven}}\" hint-placeholder-val=\"{{ false }}\">\n    <sc-if value=\"{{grainOn}}\" hint-placeholder-val=\"{{ true }}\"><img src=\"@ASSET@img/raven-grain-corner.webp\" alt=\"\" style=\"position: absolute; right: -100px; bottom: -80px; width: 1200px; height: auto; mix-blend-mode: screen; opacity: .45; filter: {{grainFilter}}; pointer-events: none\"></sc-if>\n  </sc-if>\n  <sc-if value=\"{{powder}}\" hint-placeholder-val=\"{{ true }}\">\n    <sc-if value=\"{{matCut}}\" hint-placeholder-val=\"{{ true }}\"><div aria-hidden=\"true\" style=\"position: absolute; left: calc({{pad}}px - 18px); top: calc({{top}}px + {{ms}}px + 40px); width: 600px; height: 99px; pointer-events: none\"><img src=\"@ASSET@img/cut-powder-pigment.png\" alt=\"\" style=\"position: absolute; left: 0; top: -118px; width: 600px; height: 331px; mix-blend-mode: multiply; opacity: .55\"><img src=\"@ASSET@img/cut-highlight.png\" alt=\"\" style=\"position: absolute; left: 0; top: -118px; width: 600px; height: 331px; mix-blend-mode: screen; opacity: .5\"><span style=\"position: absolute; left: 258px; top: 29px; width: 47px; height: 40px; background: #2A2226; -webkit-mask: url(@ASSET@img/apex-shepherd-mark.svg) center bottom/contain no-repeat; mask: url(@ASSET@img/apex-shepherd-mark.svg) center bottom/contain no-repeat\"></span></div></sc-if><sc-if value=\"{{matSilk}}\" hint-placeholder-val=\"{{ false }}\"><img src=\"@ASSET@img/silk-corner-clean.png\" alt=\"\" aria-hidden=\"true\" style=\"position: absolute; bottom: 0; right: 0; transform: scaleY(-1); width: 500px; height: auto; pointer-events: none\"></sc-if>\n  </sc-if>\n\n  <div style=\"position: relative; flex: none; display: flex; align-items: center; justify-content: space-between; font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: {{ms}}px; font-weight: 600; letter-spacing: .28em; text-transform: uppercase; color: {{label}}; white-space: nowrap\">\n    <span style=\"display: flex; align-items: center; gap: 20px\">{{kicker}}<span style=\"display: inline-block; width: 96px; height: 2px; background: {{label}}; opacity: .4\"></span></span>\n    <span style=\"letter-spacing: .2em\">{{corner}}</span>\n  </div>\n\n  <p style=\"position: relative; margin: auto 0; font-size: {{fs}}px; line-height: 1.02; font-weight: 850; letter-spacing: -.045em; white-space: pre-line\">{{body}}<span style=\"color: {{stopColor}}\">{{stop}}</span></p>\n\n  <div style=\"position: relative; flex: none; display: flex; align-items: center; font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: {{ss}}px; font-weight: 600; letter-spacing: .22em; text-transform: uppercase; color: {{label}}; white-space: nowrap\">\n    <sc-if value=\"{{hasA}}\" hint-placeholder-val=\"{{ true }}\"><span>{{slateA}}</span></sc-if>\n    <sc-if value=\"{{hasBoth}}\" hint-placeholder-val=\"{{ true }}\"><span style=\"display: inline-block; width: 4px; height: {{slashH}}px; margin: 0 20px; background: {{stopColor}}; transform: skewX(-20deg)\"></span></sc-if>\n    <sc-if value=\"{{hasB}}\" hint-placeholder-val=\"{{ true }}\"><span>{{slateB}}</span></sc-if>\n  </div>\n</div>";

// ---- LogFact
class LogFact extends DCLogic {
  renderVals() {
    const RC = __rates(this.props.rates);
    const p = this.props;
    const format = p.format ?? 'feed';
    const T = {
      feed:   { W: 1080, H: 1350, pad: 80, top: 80,  bottom: 80,  k: 1 },
      square: { W: 1080, H: 1080, pad: 68, top: 68,  bottom: 68,  k: .84 },
      story:  { W: 1080, H: 1920, pad: 84, top: 290, bottom: 300, k: 1.06 },
      status: { W: 1080, H: 1920, pad: 84, top: 250, bottom: 290, k: 1.06 }
    };
    const f = T[format] || T.feed;
    const k = f.k;
    const R = (n) => Math.round(n * k);

    const cwRaw = String(p.colourway ?? 'Powder + Coral').toLowerCase();
    const cw = (cwRaw.includes('coral') || cwRaw.startsWith('powder')) ? 'powder' : (cwRaw.includes('poppy') ? 'poppy' : 'raven');
    const C = {
      powder: { bg: '#BFE3F4', ink: '#120709', headInk: '#120709', acc: '#FD6E6E', label: '#41373B', lede: '#3C3236', panel: 'rgba(238,246,250,.78)', rule: 'rgba(18,7,9,.14)' },
      raven:  { bg: '#120709', ink: '#EEF6FA', headInk: '#BFE3F4', acc: '#BFE3F4', label: '#9FB6C2', lede: '#C9D7DE', panel: 'rgba(191,227,244,.08)', rule: 'rgba(191,227,244,.2)' },
      poppy:  { bg: '#120709', ink: '#fff',    headInk: '#fff',    acc: '#FF4D55', label: '#9FB6C2', lede: '#C9D7DE', panel: 'rgba(255,255,255,.06)', rule: 'rgba(255,255,255,.16)' }
    }[cw];

    const S = {
      'Standard boarding': { head: 'Standard boarding', price: 'Rs ' + RC.std + '', unit: 'A day, per dog.', alt: 'Two meals daily, morning and evening playtime, weekly vet check-ups and free grooming.' },
      'Camera cage': { head: 'Camera cage', price: 'Rs ' + RC.cam + '', unit: 'A day, per dog.', alt: 'Everything in standard boarding, with 24/7 CCTV.' },
      'Exactly 30 days': { head: 'Exactly 30 days', price: 'Rs ' + RC.p + '', unit: 'Exactly 30 billed days, per dog.', alt: 'Saves Rs ' + RC.disc + ' against the daily rate. Rs ' + RC.pc + ' with the camera cage.' },
      'Exactly 30 days, camera cage': { head: '30 days, camera cage', price: 'Rs ' + RC.pc + '', unit: 'Exactly 30 billed days, per dog.', alt: 'Saves Rs ' + RC.disc + ' against the daily rate. Watched day and night.' },
      'Grooming': { head: 'Grooming', price: 'Free', unit: 'With every boarding stay.', alt: '' }
    };
    const svc = S[p.service ?? 'Standard boarding'] || S['Standard boarding'];
    const layoutRaw = String(p.layout ?? 'One price').toLowerCase();
    const layout = layoutRaw.startsWith('rate') ? 'list' : layoutRaw.startsWith('step') ? 'steps' : layoutRaw.startsWith('state') ? 'statement' : 'price';

    const defaults = { price: svc.head, list: 'Boarding at Apex', steps: 'Your gate, not your street', statement: 'Arrival and collection are both billed days' };
    let head = String(p.headline ?? '').trim() || defaults[layout];
    let stop = '.';
    if (/[.]$/.test(head)) head = head.slice(0, -1);
    else if (/[!?]$/.test(head)) stop = '';

    const n = head.length;
    const base = { price: 104, list: 104, steps: 112, statement: 132 }[layout];
    const limit = { price: 18, list: 18, steps: 22, statement: 34 }[layout];
    const hs = R(n > limit ? Math.max(base * .62, base * Math.sqrt(limit / n)) : base);

    const pr = String(svc.price);
    const hasRs = /^Rs\s/.test(pr);
    const priceNum = hasRs ? pr.replace(/^Rs\s+/, '') : pr;
    const psBase = Math.min(280, Math.round((hasRs ? 700 : 840) / (priceNum.length * 0.6)));

    const ctaRaw = String(p.cta ?? 'Link in bio').toLowerCase();
    const ctaText = ctaRaw.startsWith('whats') ? 'Message us your dates and your dog’s name. We confirm before anything is booked.' : 'Send your dates through the link in bio. We confirm before anything is booked.';
    const hasCta = !ctaRaw.startsWith('none');

    const rows = [
      { n: '01', name: 'Standard', sub: 'Two meals, two playtimes', price: 'Rs ' + RC.std + '', per: 'a day', border: 'none' },
      { n: '02', name: 'Camera cage', sub: 'The same care, with 24/7 CCTV', price: 'Rs ' + RC.cam + '', per: 'a day', border: '2px solid ' + C.rule },
      { n: '03', name: 'Exactly 30 days', sub: 'Saves Rs ' + RC.disc + ' on the daily rate', price: 'Rs ' + RC.p + '', per: 'Rs ' + RC.pc + ' camera cage', border: '2px solid ' + C.rule }
    ];
    const stepDefaults = ['Choose pickup, drop-off or both.', 'Share the exact gate our vehicle can reach.', 'We quote transport separately, after checking the route.'];
    const steps = [p.step1 ?? stepDefaults[0], p.step2 ?? stepDefaults[1], p.step3 ?? stepDefaults[2]].map((t, i) => ({ n: '0' + (i + 1), text: String(t ?? '').trim() })).filter(s => s.text);
    const note = String(p.note ?? '').trim();

    const mat = String(this.props.material ?? 'Cut'); const matCut = mat === 'Cut'; const matSilk = mat === 'Coral silk';
    const grainOn = String(this.props.grain ?? 'On') !== 'Off';
    return {
      matCut, matSilk, grainOn,
      W: f.W, H: f.H, pad: f.pad, top: f.top, bottom: f.bottom,
      bg: C.bg, ink: C.ink, headInk: C.headInk, acc: C.acc, numInk: cw === 'powder' ? '#9E122B' : C.acc, label: C.label, lede: C.lede, panel: C.panel, rule: C.rule,
      dark: cw !== 'powder', light: cw === 'powder', grainFilter: cw === 'raven' ? 'saturate(.15) brightness(1.15)' : 'none',
      ms: R(24), kicker: String(p.kicker ?? 'Boarding'), corner: String(p.corner ?? 'Per dog'),
      headline: head, stop, hs, headTop: layout === 'statement' ? 'auto' : (R(64) + 'px'), ctaTop: layout === 'statement' ? (R(56) + 'px') : 'auto',
      isPrice: layout === 'price', isList: layout === 'list', isSteps: layout === 'steps',
      blockGap: R(52), priceTop: hasCta ? 'auto' : (R(52) + 'px'), slabPad: R(44), hasRs, rsSize: R(64), ps: R(psBase), priceNum, us: R(34), bs: R(27),
      unit: svc.unit, alt: svc.alt, hasAlt: !!svc.alt,
      rows, rowPad: R(26), rowName: R(38), rowPrice: R(44),
      steps, stepSize: R(42),
      hasNote: !!note, note, noteGap: R(layout === 'statement' ? 40 : 30), noteSize: R(layout === 'statement' ? 38 : 30),
      hasCta, ctaText
    };
  }
}
const LogFact_MARKUP = "<div style=\"position: relative; width: {{W}}px; height: {{H}}px; overflow: hidden; background: {{bg}}; color: {{ink}}; font-family: 'Inter Tight', ui-sans-serif, system-ui, sans-serif; -webkit-font-smoothing: antialiased; box-sizing: border-box; padding: {{top}}px {{pad}}px {{bottom}}px; display: flex; flex-direction: column\">\n  <sc-if value=\"{{dark}}\" hint-placeholder-val=\"{{ true }}\">\n    <sc-if value=\"{{grainOn}}\" hint-placeholder-val=\"{{ true }}\"><img src=\"@ASSET@img/raven-grain-corner.webp\" alt=\"\" style=\"position: absolute; right: -120px; bottom: -100px; width: 1240px; height: auto; mix-blend-mode: screen; opacity: .42; filter: {{grainFilter}}; pointer-events: none\"></sc-if>\n  </sc-if>\n  <sc-if value=\"{{light}}\" hint-placeholder-val=\"{{ false }}\">\n    <sc-if value=\"{{matCut}}\" hint-placeholder-val=\"{{ true }}\"><div aria-hidden=\"true\" style=\"position: absolute; right: 40px; top: calc({{top}}px - 36px); width: 600px; height: 99px; pointer-events: none\"><img src=\"@ASSET@img/cut-powder-pigment.png\" alt=\"\" style=\"position: absolute; left: 0; top: -118px; width: 600px; height: 331px; mix-blend-mode: multiply; opacity: .55\"><img src=\"@ASSET@img/cut-highlight.png\" alt=\"\" style=\"position: absolute; left: 0; top: -118px; width: 600px; height: 331px; mix-blend-mode: screen; opacity: .5\"><span style=\"position: absolute; left: 258px; top: 29px; width: 47px; height: 40px; background: #2A2226; -webkit-mask: url(@ASSET@img/apex-shepherd-mark.svg) center bottom/contain no-repeat; mask: url(@ASSET@img/apex-shepherd-mark.svg) center bottom/contain no-repeat\"></span></div></sc-if><sc-if value=\"{{matSilk}}\" hint-placeholder-val=\"{{ false }}\"><img src=\"@ASSET@img/silk-corner-clean.png\" alt=\"\" aria-hidden=\"true\" style=\"position: absolute; top: 0; right: 0; width: 500px; height: auto; pointer-events: none\"></sc-if>\n  </sc-if>\n\n  <div style=\"position: relative; flex: none; display: flex; align-items: center; justify-content: space-between; font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: {{ms}}px; font-weight: 600; letter-spacing: .28em; text-transform: uppercase; color: {{label}}; white-space: nowrap\">\n    <span style=\"display: flex; align-items: center; gap: 20px\">{{kicker}}<span style=\"display: inline-block; width: 96px; height: 2px; background: {{label}}; opacity: .4\"></span></span>\n    <span style=\"letter-spacing: .2em\">{{corner}}</span>\n  </div>\n\n  <h2 style=\"position: relative; flex: none; margin: {{headTop}} 0 0; font-size: {{hs}}px; line-height: .94; font-weight: 900; letter-spacing: -.052em; color: {{headInk}}\">{{headline}}<span style=\"color: {{acc}}\">{{stop}}</span></h2>\n\n  <sc-if value=\"{{isPrice}}\" hint-placeholder-val=\"{{ true }}\">\n    <div style=\"position: relative; flex: none; margin-top: {{priceTop}}; padding: {{slabPad}}px; border-radius: 34px; background: {{panel}}\">\n      <div style=\"display: flex; align-items: baseline; gap: 18px; color: {{headInk}}\">\n        <sc-if value=\"{{hasRs}}\" hint-placeholder-val=\"{{ true }}\"><span style=\"font-size: {{rsSize}}px; font-weight: 850; letter-spacing: -.02em\">Rs</span></sc-if>\n        <span style=\"font-size: {{ps}}px; line-height: .86; font-weight: 900; letter-spacing: -.06em\">{{priceNum}}</span>\n      </div>\n      <p style=\"margin: 18px 0 0; font-size: {{us}}px; line-height: 1.3; font-weight: 600; color: {{ink}}\">{{unit}}</p>\n      <sc-if value=\"{{hasAlt}}\" hint-placeholder-val=\"{{ true }}\">\n        <p style=\"margin: 14px 0 0; padding-top: 18px; border-top: 2px solid {{rule}}; font-size: {{bs}}px; line-height: 1.4; color: {{lede}}\">{{alt}}</p>\n      </sc-if>\n    </div>\n  </sc-if>\n\n  <sc-if value=\"{{isList}}\" hint-placeholder-val=\"{{ false }}\">\n    <div style=\"position: relative; flex: none; margin-top: {{blockGap}}px; border-radius: 34px; background: {{panel}}; padding: 8px {{slabPad}}px\">\n      <sc-for list=\"{{rows}}\" as=\"r\" hint-placeholder-count=\"3\">\n        <div style=\"display: flex; align-items: flex-start; gap: 22px; padding: {{rowPad}}px 0; border-top: {{r.border}}\">\n          <span style=\"flex: none; width: 52px; padding-top: 6px; font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: {{ms}}px; font-weight: 700; letter-spacing: .1em; color: {{numInk}}\">{{r.n}}</span>\n          <span style=\"flex: 1 1 auto; min-width: 0\">\n            <span style=\"display: block; font-size: {{rowName}}px; line-height: 1.1; font-weight: 850; letter-spacing: -.02em; color: {{headInk}}\">{{r.name}}</span>\n            <span style=\"display: block; margin-top: 8px; font-size: {{bs}}px; line-height: 1.35; color: {{lede}}\">{{r.sub}}</span>\n          </span>\n          <span style=\"flex: none; text-align: right\">\n            <span style=\"display: block; font-size: {{rowPrice}}px; line-height: 1; font-weight: 900; letter-spacing: -.04em; color: {{headInk}}; white-space: nowrap\">{{r.price}}</span>\n            <span style=\"display: block; margin-top: 8px; font-size: {{bs}}px; color: {{lede}}; white-space: nowrap\">{{r.per}}</span>\n          </span>\n        </div>\n      </sc-for>\n    </div>\n    <p style=\"position: relative; flex: none; margin: 26px 0 0; font-size: {{bs}}px; line-height: 1.45; color: {{lede}}\">Per dog. Two meals daily, morning and evening playtime, weekly vet check-ups and free grooming.</p>\n  </sc-if>\n\n  <sc-if value=\"{{isSteps}}\" hint-placeholder-val=\"{{ false }}\">\n    <div style=\"position: relative; flex: none; margin-top: {{blockGap}}px; display: flex; flex-direction: column\">\n      <sc-for list=\"{{steps}}\" as=\"st\" hint-placeholder-count=\"3\">\n        <div style=\"display: flex; align-items: baseline; gap: 26px; padding: {{rowPad}}px 0; border-top: 2px solid {{rule}}\">\n          <span style=\"flex: none; width: 60px; font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: {{ms}}px; font-weight: 700; letter-spacing: .1em; color: {{numInk}}\">{{st.n}}</span>\n          <span style=\"flex: 1 1 auto; font-size: {{stepSize}}px; line-height: 1.22; font-weight: 650; letter-spacing: -.015em; color: {{ink}}\">{{st.text}}</span>\n        </div>\n      </sc-for>\n    </div>\n  </sc-if>\n\n  <sc-if value=\"{{hasNote}}\" hint-placeholder-val=\"{{ false }}\">\n    <p style=\"position: relative; flex: none; margin: {{noteGap}}px 0 0; max-width: 860px; font-size: {{noteSize}}px; line-height: 1.38; font-weight: 500; color: {{lede}}\">{{note}}</p>\n  </sc-if>\n\n  <sc-if value=\"{{hasCta}}\" hint-placeholder-val=\"{{ true }}\">\n    <div style=\"position: relative; flex: none; margin-top: {{ctaTop}}; padding-top: 26px; border-top: 2px solid {{rule}}; display: flex; align-items: center; gap: 18px\">\n      <span style=\"flex: none; width: 18px; height: 18px; border-radius: 4px; background: {{acc}}\"></span>\n      <span style=\"font-size: {{bs}}px; line-height: 1.38; font-weight: 600; color: {{ink}}\">{{ctaText}}</span>\n    </div>\n  </sc-if>\n</div>";

export const TEMPLATES = {LogOpen: { Logic: LogOpen, markup: LogOpen_MARKUP }, LogFrame: { Logic: LogFrame, markup: LogFrame_MARKUP }, LogNote: { Logic: LogNote, markup: LogNote_MARKUP }, LogFact: { Logic: LogFact, markup: LogFact_MARKUP }};
