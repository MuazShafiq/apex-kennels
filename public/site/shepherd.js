export function apexDogFx(root) {
  if (root.__dogfx) return root.__dogfx;
  var el = root.querySelector(".dl");
  var none = {
    move: function () {},
    leave: function () {},
    cue: function () {},
  };
  if (!el) return none;
  /* V9.7 shepherd light: three silhouette-confined layers (key: fur and form; rim: inner backlight wrap that trails the key;
   eye: the plate's own catchlight) driven by critically damped springs. Attention comes from a coarse distance field of the
   dog, so the light answers the shepherd, not the headline. No idle loop: frames stop when everything settles. */
  var mm = function (q) {
    try {
      return !!(window.matchMedia && window.matchMedia(q).matches);
    } catch (e) {
      return false;
    }
  };
  var rm = mm("(prefers-reduced-motion: reduce)"),
    hov = mm("(hover: hover)") && mm("(pointer: fine)");
  var F = atob(
      "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",
    ),
    FW = 74,
    FH = 69,
    CELL = 10;
  function dist(x, y) {
    var i = Math.floor(x / CELL),
      j = Math.floor(y / CELL);
    if (i < 0 || j < 0 || i >= FW || j >= FH) return 250;
    return F.charCodeAt(j * FW + i);
  }
  var S = {
    tx: -600,
    ty: -600,
    x: -600,
    y: -600,
    vx: 0,
    vy: 0,
    rx: -600,
    ry: -600,
    rvx: 0,
    rvy: 0,
    a: 0,
    ta: 0,
    e: 0,
    te: 0,
    lr: 150,
    tlr: 150,
    cue: 0,
    raf: 0,
    last: 0,
  };
  function put() {
    var s = root.style;
    s.setProperty("--mx", S.x.toFixed(1) + "px");
    s.setProperty("--my", S.y.toFixed(1) + "px");
    s.setProperty("--rx", S.rx.toFixed(1) + "px");
    s.setProperty("--ry", S.ry.toFixed(1) + "px");
    s.setProperty("--la", S.a.toFixed(3));
    s.setProperty("--lrim", Math.max(S.a * 0.85, S.cue).toFixed(3));
    s.setProperty("--le", S.e.toFixed(3));
    s.setProperty("--lr", S.lr.toFixed(1) + "px");
  }
  function spring(p, v, t, k, dt) {
    var c = 2 * Math.sqrt(k);
    S[v] += (-k * (S[p] - t) - c * S[v]) * dt;
    S[p] += S[v] * dt;
  }
  function ease(p, t, tin, tout, dt) {
    S[p] += (t - S[p]) * (1 - Math.exp(-dt / (t > S[p] ? tin : tout)));
  }
  function settled() {
    return (
      Math.abs(S.x - S.tx) < 0.3 &&
      Math.abs(S.y - S.ty) < 0.3 &&
      Math.abs(S.vx) + Math.abs(S.vy) < 4 &&
      Math.abs(S.rx - S.x) < 0.4 &&
      Math.abs(S.ry - S.y) < 0.4 &&
      Math.abs(S.rvx) + Math.abs(S.rvy) < 4 &&
      Math.abs(S.a - S.ta) < 0.003 &&
      Math.abs(S.e - S.te) < 0.003 &&
      Math.abs(S.lr - S.tlr) < 0.3
    );
  }
  function snap() {
    S.x = S.tx;
    S.y = S.ty;
    S.rx = S.tx;
    S.ry = S.ty;
    S.vx = S.vy = S.rvx = S.rvy = 0;
    S.a = S.ta;
    S.e = S.te;
    S.lr = S.tlr = 150;
  }
  function step(ts) {
    if (rm) {
      snap();
      put();
      S.raf = 0;
      return;
    }
    var dt = S.last ? Math.min(0.05, (ts - S.last) / 1000) : 1 / 60;
    S.last = ts;
    var n = Math.max(1, Math.ceil(dt / 0.008)),
      h = dt / n;
    for (var i = 0; i < n; i++) {
      spring("x", "vx", S.tx, 190, h);
      spring("y", "vy", S.ty, 190, h);
      spring("rx", "rvx", S.x, 46, h);
      spring("ry", "rvy", S.y, 46, h);
    }
    ease("a", S.ta, 0.2, 0.62, dt);
    ease("e", S.te, 0.42, 0.6, dt);
    S.tlr = 150 + Math.min(34, Math.sqrt(S.vx * S.vx + S.vy * S.vy) * 0.03);
    ease("lr", S.tlr, 0.12, 0.35, dt);
    if (S.ta === 0 && S.a < 0.012 && S.e < 0.012) {
      S.a = 0;
      S.e = 0;
      S.x = S.tx;
      S.y = S.ty;
      S.rx = S.tx;
      S.ry = S.ty;
      S.vx = S.vy = S.rvx = S.rvy = 0;
    }
    put();
    if (settled()) {
      S.raf = 0;
      S.last = 0;
      return;
    }
    S.raf = requestAnimationFrame(step);
  }
  function kick() {
    if (rm) {
      snap();
      put();
      return;
    }
    if (!S.raf) S.raf = requestAnimationFrame(step);
  }
  function local(e) {
    var r = root.getBoundingClientRect();
    var k = root.offsetWidth / r.width;
    return [
      (e.clientX - r.left) * k - el.offsetLeft,
      (e.clientY - r.top) * k - el.offsetTop,
    ];
  }
  var fx = {
    move: function (e) {
      if (e.pointerType === "touch" || !hov) return;
      S.cue = 0;
      var p = local(e),
        d = dist(p[0], p[1]);
      S.ta = d <= 0 ? 1 : d < 110 ? 0.5 * Math.pow(1 - d / 110, 2) : 0;
      S.te = d <= 0 ? 1 : 0;
      S.tx = p[0];
      S.ty = p[1];
      if (S.a < 0.02) {
        S.x = S.rx = p[0];
        S.y = S.ry = p[1];
        S.vx = S.vy = S.rvx = S.rvy = 0;
      }
      kick();
    },
    leave: function () {
      S.ta = 0;
      S.te = 0;
      if (!rm) S.ty -= 14;
      kick();
    },
    cue: function () {
      if (rm || !hov) return;
      try {
        if (sessionStorage.getItem("apexCue97")) return;
        sessionStorage.setItem("apexCue97", "1");
      } catch (e) {}
      var P = [
          281, 30, 283, 50, 293, 70, 297, 90, 297, 110, 299, 130, 296, 150, 297,
          170, 315, 190, 328, 210, 328, 230, 335, 250, 351, 270, 360, 290, 383,
          310, 387, 330, 405, 350, 411, 370, 455, 390, 475, 410, 503, 430, 521,
          450,
        ],
        n = P.length / 2,
        t0 = 0,
        D = 2400,
        live = 1;
      function f(ts) {
        if (!live || S.a > 0.02) {
          S.cue = 0;
          put();
          return;
        }
        if (!t0) t0 = ts;
        var u = Math.min((ts - t0) / D, 1),
          s = u * (n - 1),
          i = Math.min(Math.floor(s), n - 2),
          w = s - i;
        S.rx = P[2 * i] + (P[2 * i + 2] - P[2 * i]) * w - 8;
        S.ry = P[2 * i + 1] + (P[2 * i + 3] - P[2 * i + 1]) * w;
        S.cue = 0.5 * Math.pow(Math.sin(Math.PI * u), 1.6);
        put();
        if (u < 1) requestAnimationFrame(f);
        else {
          S.cue = 0;
          put();
          live = 0;
        }
      }
      setTimeout(function () {
        if (S.a === 0 && S.ta === 0) requestAnimationFrame(f);
      }, 1200);
    },
  };
  root.__dogfx = fx;
  return fx;
}
