/* Apex · living shepherd (v5). One WebGL pass over the approved plate, which is shown exactly as it is
   whenever nothing moves. Life comes from three things only: blinks (the lid over the eye), brief ear
   twitches (each ear and its own rim light turn on its base; the mosaic behind never moves, and only the
   sliver an ear uncovers shows matching mosaic), and the approved pointer light. The backlight itself
   breathes and, now and then, a slow sheen crosses it: light changes, the mosaic stays put. */
(function () {
  var VS = 'attribute vec2 a;varying vec2 v;void main(){v=a*.5+.5;v.y=1.-v.y;gl_Position=vec4(a,0.,1.);}';
  var FS = [
    'precision highp float;varying vec2 v;',
    'uniform sampler2D uPlate,uKey,uRim,uEye,uEarBg,uEarM;uniform vec2 uPlateSize,uCoverS,uCoverO;',
    'uniform float uMapS;uniform vec2 uMapO;uniform float uLayers;',
    'uniform vec4 uEarCrop;uniform vec2 uPiv1,uPiv2;',
    'uniform float uEar1,uEar2,uBlink,uLa,uLe,uBreath,uSheen;uniform vec2 uM;',
    'const vec2 E=vec2(1283.,243.);',
    'vec2 rot(vec2 p,vec2 c,float a){float s=sin(a),k=cos(a);p-=c;return c+vec2(k*p.x-s*p.y,s*p.x+k*p.y);}',
    'vec3 screen(vec3 a,vec3 b){return 1.-(1.-a)*(1.-b);}',
    'vec3 light(vec3 c,vec2 sl){',
    '  if(uLayers<.5)return c;vec2 lu=(sl-vec2(1050.,45.))/vec2(1110.,1035.);',
    '  if(lu.x<0.||lu.y<0.||lu.x>1.||lu.y>1.)return c;vec2 dm=sl-uM;float r2=dot(dm,dm);',
    '  float kw=uLa*exp(-r2/(2.*170.*170.)),rw=uLa*.85*exp(-r2/(2.*300.*300.));',
    '  c=screen(c,texture2D(uKey,lu).rgb*kw);c=screen(c,texture2D(uRim,lu).rgb*rw);return screen(c,texture2D(uEye,lu).rgb*uLe);}',
    'vec3 P(vec2 p){return texture2D(uPlate,p/uPlateSize).rgb;}',
    'float M(vec2 p){vec2 u=(p-uEarCrop.xy)/uEarCrop.zw;return (u.x>0.&&u.y>0.&&u.x<1.&&u.y<1.)?texture2D(uEarM,u).r:0.;}',
    'void main(){',
    '  vec2 pp=uCoverO+v*uCoverS;',                                            /* plate pixel */
    '  vec2 pl=E+(pp-uMapO)/uMapS;',                                          /* landmark space */
    '  vec3 c=P(pp);',
    /* ear twitch: only while an ear is actually turned */
    '  float act=max(abs(uEar1),abs(uEar2));',
    '  vec2 eu=(pp-uEarCrop.xy)/uEarCrop.zw;',
    '  if(act>.002&&eu.x>-.05&&eu.y>-.05&&eu.x<1.05&&eu.y<1.05){',
    '    float xm=(uPiv1.x+uPiv2.x)*.5;bool one=abs(uEar1)>=abs(uEar2);',            /* only the ear that flicks is touched */
    '    vec2 pv=one?uPiv1:uPiv2;float ang=one?uEar1:uEar2;',
    '    bool side=one?(pp.x<xm):(pp.x>=xm);',
    '    if(side){',
    '      float k=smoothstep(pv.y+4.*uMapS,pv.y-40.*uMapS,pp.y);',                 /* the ear bends from its base: no seam */
    '      vec2 s=rot(pp,pv,-ang*k);',
    '      float a=((one?s.x<xm:s.x>=xm))?M(s):0.;float m0=M(pp);',
    '      vec4 f=texture2D(uEarBg,clamp(eu,0.,1.));',
    '      vec3 bg=mix(c,f.rgb,m0);',                                            /* behind the ear: matching mosaic, only where the ear was */
    '      c=mix(c,mix(bg,P(s),a),smoothstep(.002,.02,abs(ang))*smoothstep(0.,.2,k));',
    '    }',
    '  }',
    '  float de=length(pl-E);',
    '  c*=mix(1.,.12,uBlink*(1.-smoothstep(5.,13.,de)));',                     /* blink: the lid over the eye */
    /* the backlight: breathing intensity and an occasional sheen, on the red light only */
    '  float red=smoothstep(.08,.45,(c.r-max(c.g,c.b))/max(c.r,.02))*smoothstep(.06,.2,c.r);',
    '  float d=dot(pl,vec2(.94,.34));float band=exp(-pow((d-uSheen)/170.,2.));',
    '  c*=1.+red*(uBreath+.42*band);',
    '  gl_FragColor=vec4(light(c,pl),1.);}'
  ].join('\n');

  function mk(gl, t, s) { var o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; }

  window.ApexShepherd = function (canvas, opts) {
    var gl = canvas.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
    if (!gl) return null;
    var pr = gl.createProgram();
    gl.attachShader(pr, mk(gl, gl.VERTEX_SHADER, VS)); gl.attachShader(pr, mk(gl, gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return null;
    gl.useProgram(pr);
    var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var al = gl.getAttribLocation(pr, 'a'); gl.enableVertexAttribArray(al); gl.vertexAttribPointer(al, 2, gl.FLOAT, false, 0, 0);
    var U = {}; ['uPlate', 'uKey', 'uRim', 'uEye', 'uEarBg', 'uEarM', 'uPlateSize', 'uCoverS', 'uCoverO', 'uMapS', 'uMapO', 'uLayers', 'uEarCrop', 'uPiv1', 'uPiv2', 'uEar1', 'uEar2', 'uBlink', 'uLa', 'uLe', 'uBreath', 'uSheen', 'uM'].forEach(function (n) { U[n] = gl.getUniformLocation(pr, n); });
    var ready = 0, need = 3 + (opts.layers ? 3 : 0);
    function load(i, url, rgba) {
      var t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      var im = new Image(); im.crossOrigin = 'anonymous';
      im.onload = function () { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, rgba ? gl.RGBA : gl.RGB, rgba ? gl.RGBA : gl.RGB, gl.UNSIGNED_BYTE, im);
        ready++; if (ready === need && opts.onReady) opts.onReady(); };
      im.src = url;
    }
    load(0, opts.plate); load(4, opts.ears.bg, true); load(5, opts.ears.matte);
    if (opts.layers) { load(1, opts.layers[0]); load(2, opts.layers[1]); load(3, opts.layers[2]); }
    gl.uniform1i(U.uPlate, 0); gl.uniform1i(U.uKey, 1); gl.uniform1i(U.uRim, 2); gl.uniform1i(U.uEye, 3); gl.uniform1i(U.uEarBg, 4); gl.uniform1i(U.uEarM, 5);
    gl.uniform2f(U.uPlateSize, opts.size[0], opts.size[1]);
    gl.uniform1f(U.uMapS, opts.mapS); gl.uniform2f(U.uMapO, opts.mapO[0], opts.mapO[1]);
    gl.uniform1f(U.uLayers, opts.layers ? 1 : 0);
    var e = opts.ears; gl.uniform4f(U.uEarCrop, e.crop[0], e.crop[1], e.crop[2], e.crop[3]);
    gl.uniform2f(U.uPiv1, e.piv[0][0], e.piv[0][1]); gl.uniform2f(U.uPiv2, e.piv[1][0], e.piv[1][1]);
    var cover = { s: [opts.size[0], opts.size[1]], o: [0, 0] };
    return {
      ready: function () { return ready === need; },
      destroy: function () { var extension = gl.getExtension('WEBGL_lose_context'); if (extension) extension.loseContext(); },
      setCover: function (sx, sy, ox, oy) { cover = { s: [sx, sy], o: [ox, oy] }; },
      resize: function (w, h) { if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; } gl.viewport(0, 0, w, h); },
      draw: function (s) {
        gl.uniform2f(U.uCoverS, cover.s[0], cover.s[1]); gl.uniform2f(U.uCoverO, cover.o[0], cover.o[1]);
        gl.uniform1f(U.uEar1, s.ear1); gl.uniform1f(U.uEar2, s.ear2); gl.uniform1f(U.uBlink, s.blink);
        gl.uniform1f(U.uLa, s.la); gl.uniform1f(U.uLe, s.le); gl.uniform2f(U.uM, s.mx, s.my);
        gl.uniform1f(U.uBreath, s.breath || 0); gl.uniform1f(U.uSheen, s.sheen == null ? -9999 : s.sheen);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    };
  };
})();

/* Apex · cinematic journey (v2). One scroll clock drives the homepage. The hero holds while Boarding is
   painted over it in Mist, a broad dry brush leading the sheet; the night recedes beneath and the shepherd
   watches the paint arrive. Every later scene is scrubbed by scroll position. Reduced motion: the approved
   static page. */
(function () {
  var clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };
  var sat = function (x) { return clamp(x, 0, 1); };
  var ease = function (t) { t = sat(t); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  var easeOut = function (t) { t = sat(t); return 1 - Math.pow(1 - t, 3); };
  var smooth = function (a, b, x) { var t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };

  window.ApexCine = function (root, opt) {
    if (root.__cine) return; root.__cine = 1;
    // Keep a reversible enhancement: media changes restore the accessible static composition.
    var controller = new AbortController(), timers = [], running = true;
    var saved = Array.from(root.querySelectorAll('.cine-hero,.cine-cam,.hero-low,.boarding,.cine-wash,.cine-dim,.rates .rate,.swell-win,.paw-trail span,.plq-fig,.cine-sweep,.cine-scan,.van-fig svg.van,.req .cut,.req-seal,.ct-card')).map(function (el) { return [el, el.getAttribute('style'), el.inert]; });
    function listen(el, name, fn, options) { el.addEventListener(name, fn, Object.assign({}, options, {signal:controller.signal})); }
    root.__disposeCine = function () {
      running = false; controller.abort(); timers.forEach(clearTimeout);
      if (sh) sh.destroy(); if (canvas) canvas.remove();
      root.classList.remove('cine-on', 'cine-still');
      saved.forEach(function (item) { if (item[1] === null) item[0].removeAttribute('style'); else item[0].setAttribute('style', item[1]); item[0].inert = item[2]; });
      root.__cine = 0;
    };
    var mm = function (q) { try { return matchMedia(q).matches; } catch (e) { return false; } };
    var reduce = mm('(prefers-reduced-motion: reduce)');
    var fine = mm('(hover: hover)') && mm('(pointer: fine)');
    var $ = function (s, el) { return (el || root).querySelector(s); };
    var $$ = function (s, el) { return Array.prototype.slice.call((el || root).querySelectorAll(s)); };
    var scene = $('[data-cine-hero]'), hero = $('.hero', scene), cam = $('[data-cine-cam]'), stage = $('[data-stage]'), plateP = $('.plate-p');
    var low = $('.hero-low'), bar = $('[data-bar]'), board = $('.sec.boarding'), wash = $('.cine-wash'), dim = $('.cine-dim');
    var claws = $$('s.claw:not(.was)');
    if (reduce) {
      root.classList.add('cine-still');

      return;
    }
    root.classList.add('cine-on');

    /* ---------------- the living shepherd ---------------- */
    var land = getComputedStyle(stage).display !== 'none';
    var canvas = document.createElement('canvas'); canvas.className = land ? 'shep' : 'shep shep-p'; canvas.setAttribute('aria-hidden', 'true');
    (land ? stage : cam).appendChild(canvas);
    var EARS = opt.ears;
    var P = land ? { plate: opt.plate, size: [2160, 1080], mapS: 1, mapO: [1283, 243], layers: opt.layers, ears: EARS.land }
                 : { plate: opt.plateP, size: [780, 1688], mapS: .88, mapO: [238, 229], layers: null, ears: EARS.port };
    var sh = null;
    if (!opt.static) {
      try { P.onReady = function () { canvas.classList.add('live'); }; sh = window.ApexShepherd(canvas, P); } catch (e) { sh = null; }
    }
    if (!sh) {
      canvas.remove();
      root.classList.remove('cine-on');
      root.classList.add('cine-still');
      if (fine && land) {
        var original = stage.getAttribute('style');
        function resetLight() {
          if (original === null) stage.removeAttribute('style');
          else stage.setAttribute('style', original);
        }
        var dispose = root.__disposeCine;
        root.__disposeCine = function () { resetLight(); dispose(); };
        listen(hero, 'pointermove', function (event) {
          var box = stage.getBoundingClientRect();
          var x = event.clientX - box.left - box.width * .486111;
          var y = event.clientY - box.top - box.height * .041667;
          var eye = Math.hypot(event.clientX - box.left - box.width * 1283/2160,
            event.clientY - box.top - box.height * 243/1080);
          for (var pair of [['--mx',x+'px'],['--my',y+'px'],['--rx',x+'px'],['--ry',y+'px'],['--la','.68'],
            ['--lrim','.4'],['--le',String(Math.exp(-eye*eye/12000)*.55)]]) stage.style.setProperty(pair[0],pair[1]);
        });
        listen(hero, 'pointerleave', resetLight);
      }
      return;
    }
    listen(canvas, 'webglcontextlost', function () {
      root.__disposeCine();
      window.ApexCine(root, Object.assign({}, opt, {static:true}));
    });
    var geo = { w: 1, h: 1, k: 1, ox: 0, oy: 0, ex: 0, ey: 0, left: 0, top: 0 };
    function layout() {
      var r = (land ? stage : hero).getBoundingClientRect();
      geo.w = r.width; geo.h = r.height;
      if (land) { geo.k = r.width / 2160; geo.ox = 0; geo.oy = 0; if (sh) sh.setCover(2160, 1080, 0, 0); }
      else { var k = Math.max(r.width / 780, r.height / 1688); geo.k = k; geo.ox = (r.width - 780 * k) / 2; geo.oy = 0; if (sh) sh.setCover(r.width / k, r.height / k, -geo.ox / k, 0); }
      geo.ex = geo.ox + P.mapO[0] * geo.k; geo.ey = geo.oy + P.mapO[1] * geo.k;     /* eye, in the element's own box */
      var hr = hero.getBoundingClientRect(); geo.left = r.left - hr.left; geo.top = r.top - hr.top;
      /* render at the plate's own resolution so the camera push stays as sharp as the source allows */
      if (sh) { var pw = land ? 2160 : r.width / geo.k, ph = land ? 1080 : r.height / geo.k, cap = Math.min(1, 2200 / Math.max(pw, ph)); sh.resize(Math.round(pw * cap), Math.round(ph * cap)); }
    }
    /* behaviour */
    var S = { ear1: 0, ve1: 0, ear2: 0, ve2: 0, blink: 0, la: 0, le: 0, mx: -999, my: -999, breath: 0, sheen: -9999 };
    var pointer = { x: -1, y: -1, t: -1e9, still: 0, speed: 0, px: 0, py: 0 }, cta = false, tap = null, cover = 0;
    var now = performance.now(), nextBlink = now + 1800, blinkT = -1, dbl = false, nextEar = now + 3000, earT = -1, earSide = 1;
    var sheenT = now + 2600;
    function spring(p, v, t, k, dt) { var c = 2 * Math.sqrt(k) * .9; S[v] += (-k * (S[p] - t) - c * S[v]) * dt; S[p] += S[v] * dt; }
    function follow(p, t, tau, dt) { S[p] += (t - S[p]) * (1 - Math.exp(-dt / tau)); }
    function toLandmark(cx, cy) { /* client → landmark space */ var r = (land ? stage : hero).getBoundingClientRect(); var px = (cx - r.left - geo.ox) / geo.k, py = (cy - r.top - geo.oy) / geo.k; return [1283 + (px - P.mapO[0]) / P.mapS, 243 + (py - P.mapO[1]) / P.mapS]; }
    if (opt.debug) window.__shep = { S: S, think: function (t, dt) { think(t, dt); } };
    if (fine) {
      listen(hero, 'pointermove', function (e) { var t = performance.now(); pointer.inside = true; var dx = e.clientX - pointer.px, dy = e.clientY - pointer.py, dtt = Math.max(16, t - pointer.t); pointer.speed = pointer.speed * .8 + .2 * Math.hypot(dx, dy) / dtt * 1000; pointer.px = e.clientX; pointer.py = e.clientY; pointer.x = e.clientX; pointer.y = e.clientY; pointer.t = t; });
      listen(hero, 'pointerleave', function () { pointer.t = -1e9; pointer.inside = false; pointer.still = 0; });
      /* leaving the page entirely (into the browser chrome or another window) also counts as leaving */
      listen(document, 'pointerout', function (e) { if (!e.relatedTarget) { pointer.t = -1e9; pointer.inside = false; pointer.still = 0; } });
      listen(window, 'blur', function () { pointer.inside = false; pointer.still = 0; });
      $$('.hero .cta, .hero a[href*="Book"]').forEach(function (a) { listen(a, 'pointerenter', function () { cta = true; }); listen(a, 'pointerleave', function () { cta = false; }); listen(a, 'focus', function () { cta = true; }); listen(a, 'blur', function () { cta = false; }); });
    } else {
      listen(hero, 'pointerdown', function (e) { tap = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    }
    function think(t, dt) {
      var active = fine && pointer.inside;
      if (active) { var lm = toLandmark(pointer.x, pointer.y); S.mx = lm[0]; S.my = lm[1]; }
      /* ears: a brief, independent flick now and then; nothing held, nothing tracked */
      var e1 = 0, e2 = 0;
      if (t > nextEar) { earT = t; earSide = Math.random() < .5 ? 1 : 2; nextEar = t + 3200 + Math.random() * 5200; }
      if (earT > 0 && t - earT < 200) { if (earSide === 1) e1 = -.13; else e2 = .13; }
      spring('ear1', 've1', e1, 140, dt); spring('ear2', 've2', e2, 140, dt);
      if (!e1 && Math.abs(S.ear1) < .0015 && Math.abs(S.ve1) < .02) { S.ear1 = 0; S.ve1 = 0; }
      if (!e2 && Math.abs(S.ear2) < .0015 && Math.abs(S.ve2) < .02) { S.ear2 = 0; S.ve2 = 0; }
      /* blinks: 110 ms close, 140 ms open, sometimes doubled */
      if (t > nextBlink && blinkT < 0) { blinkT = t; dbl = Math.random() < .2; }
      S.blink = 0;
      if (blinkT > 0) { var b = t - blinkT; S.blink = b < 110 ? b / 110 : b < 250 ? 1 - (b - 110) / 140 : 0; if (b >= 250) { if (dbl) { dbl = false; blinkT = t + 90; } else { blinkT = -1; nextBlink = t + 2600 + Math.random() * 4400; } } }
      /* the backlight breathes, slowly; every so often a sheen crosses it, left to right */
      S.breath = .055 * Math.sin(t / 5200 * Math.PI * 2);
      var st = (t - sheenT) / 2600;
      if (st > 1) { sheenT = t + 8000 + Math.random() * 6000; st = -1; }
      S.sheen = st >= 0 ? -300 + 2700 * (st * st * (3 - 2 * st)) : -9999;
      follow('la', active ? 1 : 0, active ? .25 : .9, dt);
      var de = active ? Math.hypot(S.mx - 1283, S.my - 243) : 999;
      follow('le', active ? Math.exp(-de * de / (2 * 160 * 160)) * .9 : 0, .2, dt);
    }

    /* ---------------- the journey ---------------- */
    var vh = innerHeight, sceneTop = 0, heroH = 1;
    function measure() {
      vh = innerHeight; heroH = hero.offsetHeight;
      /* the hero holds for exactly one hero height while Boarding slides over it: total page height is unchanged */
      scene.style.paddingBottom = heroH + 'px'; if (board) board.style.marginTop = -heroH + 'px';
      sceneTop = scene.getBoundingClientRect().top + scrollY; layout();
    }
    function prog(el, a, b) { var r = el.getBoundingClientRect(); var t = (vh - r.top) / (vh + r.height); return sat((t - a) / (b - a)); }
    var S2 = {
      rates: $$('.rates .rate'), ratesBox: $('.rates'), swell: $('.swell-win'),
      trailB: $$('.boarding .paw-trail span'), trailC: $$('.cam .paw-trail span'), cam: $('.sec.cam'),
      plq: $('.plq-fig'), sweep: $('.cine-sweep'), scan: $('.cine-scan'),
      van: $('.van-fig svg.van'), vanFig: $('.van-fig'), cut: $('.req .cut'), seal: $('.req-seal'), ct: $('.ct-card')
    };
    var trail = S2.trailB.concat(S2.trailC);
    function frameJourney() {
      var c = sat((scrollY - sceneTop) / Math.max(1, heroH)); cover = c;
      var ec = ease(c);
      /* the night recedes beneath the paint: a slow pull back, never a push in */
      cam.style.transform = 'translate3d(0,' + (-2.5 * ec).toFixed(3) + '%,0) scale(' + (1 - .06 * ec).toFixed(4) + ')';
      if (dim) dim.style.opacity = (.62 * ec).toFixed(3);
      var q = sat(c / .42);
      low.style.transform = 'translate3d(0,' + (-90 * easeOut(q)).toFixed(1) + 'px,0)';
      low.style.opacity = (1 - easeOut(q)).toFixed(3); low.style.pointerEvents = q > .5 ? 'none' : ''; low.inert = q > .5;
      /* the brush lays the leading edge left to right as it enters, its bristles still dragging */
      if (wash) { var wp = easeOut(sat(c / .2)); wash.style.clipPath = 'inset(0 ' + ((1 - wp) * 100).toFixed(2) + '% 0 0)'; wash.style.setProperty('--drag', (-c * 320).toFixed(1) + 'px'); }

      /* Boarding: rates rise out of depth in sequence */
      if (S2.ratesBox) S2.rates.forEach(function (el, i) { var e = easeOut(prog(S2.ratesBox, .04 + i * .045, .3 + i * .045)); el.style.transform = 'translate3d(0,' + ((1 - e) * 64).toFixed(1) + 'px,0) rotateX(' + ((1 - e) * -16).toFixed(2) + 'deg)'; el.style.opacity = (.15 + .85 * e).toFixed(3); });
      /* the Swell paints itself, left to right, as it crosses the screen */
      if (S2.swell) { var sw = ease(prog(S2.swell, .2, .5)); S2.swell.style.clipPath = 'inset(-40% ' + ((1 - sw) * 100).toFixed(2) + '% -40% -10%)'; S2.swell.style.setProperty('--press', sw.toFixed(3)); }
      /* footsteps from Boarding into Camera cage, one print per step of scroll */
      if (S2.cam && trail.length) { var ct = S2.cam.getBoundingClientRect().top; var st = sat((vh * .92 - ct) / (vh * .7)) * (trail.length + .5); trail.forEach(function (el, i) { var s = sat(st - i); el.style.opacity = (s * .9).toFixed(3); el.style.scale = (.8 + .2 * easeOut(s)).toFixed(3); }); }
      /* the Suite Plaque settles out of the dark; light crosses its silk; the camera scan passes */
      if (S2.plq) { var e = easeOut(prog(S2.plq, .08, .46)); S2.plq.style.transform = 'perspective(1400px) translate3d(0,' + ((1 - e) * 110).toFixed(1) + 'px,0) rotateX(' + ((1 - e) * 40).toFixed(2) + 'deg) rotateY(' + ((1 - e) * -24).toFixed(2) + 'deg) scale(' + (.84 + .16 * e).toFixed(4) + ')';
        var sp = prog(S2.plq, .3, .74); if (S2.sweep) S2.sweep.style.transform = 'translate3d(' + (-130 + 280 * sp).toFixed(1) + '%,0,0) skewX(-18deg)'; if (S2.scan) { S2.scan.style.transform = 'translate3d(0,' + (-10 + 120 * sat((sp - .1) / .8)).toFixed(1) + '%,0)'; S2.scan.style.opacity = (Math.sin(Math.PI * sat((sp - .1) / .8)) * .9).toFixed(3); } }
      /* the van drives in on the scroll and parks */
      if (S2.van) { var vv = ease(prog(S2.vanFig, .06, .48)); S2.van.style.transform = 'translate3d(' + ((1 - vv) * -64).toFixed(2) + 'vw,0,0)'; }
      /* Request: the Cut paints, the deboss is pressed in */
      if (S2.cut) { var c = ease(prog(S2.cut, .16, .42)); S2.cut.style.clipPath = 'inset(-120% ' + ((1 - c) * 100).toFixed(2) + '% -120% -4%)'; }
      if (S2.seal) { var sl = easeOut(prog(S2.seal, .22, .52)); S2.seal.style.transform = 'rotate(-6deg) scale(' + (1.34 - .34 * sl).toFixed(4) + ')'; S2.seal.style.opacity = sl.toFixed(3); }
      /* discounted prices: a claw rakes through the old price once it is properly in view */
      claws.forEach(function (el) { if (!el.classList.contains('clawed')) { var r = el.getBoundingClientRect(); if (r.top < vh * .82 && r.bottom > 0 && r.width) el.classList.add('clawed'); } });
      /* Contact: the silk slides in from the card's corners */
      if (S2.ct) { var k = easeOut(prog(S2.ct, .08, .42)); S2.ct.style.setProperty('--sk', (1 - k).toFixed(4)); }
    }

    var last = performance.now(), live = true, dirty = true;
    function loop(t) {
      if (!running) return;
      var dt = Math.min(.05, (t - last) / 1000); last = t;
      if (dirty) { frameJourney(); dirty = false; }
      if (sh && sh.ready() && live && cover < .999) { think(t, dt);
        if (opt.debug && window.__dbg) { var D = window.__dbg; for (var k in D) S[k] = D[k]; }
        sh.draw(S); }
      requestAnimationFrame(loop);
    }
    listen(window, 'scroll', function () { dirty = true; }, { passive: true });
    listen(window, 'resize', function () { measure(); dirty = true; });
    listen(document, 'visibilitychange', function () { live = !document.hidden; last = performance.now(); });
    measure(); timers.push(setTimeout(function () { measure(); dirty = true; }, 400), setTimeout(function () { measure(); dirty = true; }, 1600));
    requestAnimationFrame(loop);
  };
})();
