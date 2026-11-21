import field from "./shepherd-distance.js";

/* Three silhouette layers use the same registered coordinates as the approved hero plate. */
export function mountShepherd(root) {
  const $ = (selector) => root.querySelector(selector);
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  var stage = $("[data-stage]"),
    key = $("[data-key]"),
    hero = $("[data-hero]");
  if (stage && key && hero && fine) {
    const F = atob(field.f);
    const FW = field.w;
    const FH = field.h;
    const CELL = field.cell;
    const BW = 740;
    var dist = function (x, y) {
      var i = Math.floor(x / CELL),
        j = Math.floor(y / CELL);
      if (i < 0 || j < 0 || i >= FW || j >= FH) return 250;
      return F.charCodeAt(j * FW + i);
    };
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
      k: 1,
    };
    var put = function () {
      var s = stage.style,
        k = S.k;
      s.setProperty("--mx", (S.x * k).toFixed(1) + "px");
      s.setProperty("--my", (S.y * k).toFixed(1) + "px");
      s.setProperty("--rx", (S.rx * k).toFixed(1) + "px");
      s.setProperty("--ry", (S.ry * k).toFixed(1) + "px");
      s.setProperty("--la", S.a.toFixed(3));
      s.setProperty("--lrim", Math.max(S.a * 0.85, S.cue).toFixed(3));
      s.setProperty("--le", S.e.toFixed(3));
      s.setProperty("--lr", (S.lr * k).toFixed(1) + "px");
      s.setProperty("--lr2", (S.lr * 2.6 * k).toFixed(1) + "px");
      s.setProperty("--rr", (300 * k).toFixed(1) + "px");
    };
    var spring = function (p, v, t, kk, dt) {
      var c = 2 * Math.sqrt(kk);
      S[v] += (-kk * (S[p] - t) - c * S[v]) * dt;
      S[p] += S[v] * dt;
    };
    var ease = function (p, t, tin, tout, dt) {
      S[p] += (t - S[p]) * (1 - Math.exp(-dt / (t > S[p] ? tin : tout)));
    };
    var settled = function () {
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
    };
    var snap = function () {
      S.x = S.rx = S.tx;
      S.y = S.ry = S.ty;
      S.vx = S.vy = S.rvx = S.rvy = 0;
      S.a = S.ta;
      S.e = S.te;
      S.lr = S.tlr = 150;
    };
    var step = function (ts) {
      if (motion.matches) {
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
        S.x = S.rx = S.tx;
        S.y = S.ry = S.ty;
        S.vx = S.vy = S.rvx = S.rvy = 0;
      }
      put();
      if (settled()) {
        S.raf = 0;
        S.last = 0;
        return;
      }
      S.raf = requestAnimationFrame(step);
    };
    var kick = function () {
      if (motion.matches) {
        snap();
        put();
        return;
      }
      if (!S.raf) S.raf = requestAnimationFrame(step);
    };
    hero.addEventListener("pointermove", function (e) {
      if (e.pointerType === "touch") return;
      if (getComputedStyle(stage).display === "none") return;
      var r = key.getBoundingClientRect();
      if (!r.width) return;
      S.k = r.width / BW;
      S.cue = 0;
      var px = (e.clientX - r.left) / S.k,
        py = (e.clientY - r.top) / S.k,
        d = dist(px, py);
      S.ta = d <= 0 ? 1 : d < 110 ? 0.5 * Math.pow(1 - d / 110, 2) : 0;
      S.te = d <= 0 ? 1 : 0;
      S.tx = px;
      S.ty = py;
      if (S.a < 0.02) {
        S.x = S.rx = px;
        S.y = S.ry = py;
        S.vx = S.vy = S.rvx = S.rvy = 0;
      }
      kick();
    });
    hero.addEventListener("pointerleave", function () {
      S.ta = 0;
      S.te = 0;
      if (!motion.matches) S.ty -= 14;
      kick();
    });
    /* one-time cue per session: a soft rim sweep down the back of the dog */
    if (!motion.matches) {
      var seen = false;
      try {
        seen = !!sessionStorage.getItem("apexCue10");
        sessionStorage.setItem("apexCue10", "1");
      } catch (e) {}
      if (!seen)
        setTimeout(function () {
          if (S.a > 0 || S.ta > 0 || getComputedStyle(stage).display === "none")
            return;
          var r = key.getBoundingClientRect();
          if (!r.width) return;
          S.k = r.width / BW;
          var P = [
              281, 30, 283, 50, 293, 70, 297, 90, 297, 110, 299, 130, 296, 150,
              297, 170, 315, 190, 328, 210, 328, 230, 335, 250, 351, 270, 360,
              290, 383, 310, 387, 330, 405, 350, 411, 370, 455, 390, 475, 410,
              503, 430, 521, 450,
            ],
            n = P.length / 2,
            t0 = 0,
            D = 2400;
          var f = function (ts) {
            if (S.a > 0.02) {
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
            }
          };
          requestAnimationFrame(f);
        }, 1400);
    }
  }
}
