/* Preserve the V9.7 route motion where CSS cannot interpolate SVG's d property. */
export function animateRouteArrow(button) {
  const lines = [...button.querySelectorAll(".ar-b g > path:first-child")];
  const heads = [...button.querySelectorAll(".ar-b g > path:nth-child(2)")];
  const hover = matchMedia("(hover: hover)");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const rest = [11, 12.4, 6.4, 17, 21, 22.4, 31.4, 0];
  const extended = [11.4, 13, 6.15, 17.8, 22, 23.6, 34.4, 3];
  const pressed = [11.1, 12.6, 6.35, 17.3, 21.4, 22.8, 32.4, 1];
  let current = rest;
  let target = rest;
  let frame;

  function render(values) {
    current = values;
    const [curveStart, climb, crest, peak, fall, exit, end, headOffset] =
      values;
    const route = `M6.8 12.35 C${curveStart} 12.35 ${climb} ${crest} ${peak} ${crest} C${fall} ${crest} ${exit} 9 ${end} 9`;
    for (const line of lines) line.setAttribute("d", route);
    for (const head of heads)
      head.setAttribute("transform", `translate(${headOffset} 0)`);
  }

  function update() {
    const active = button.matches(":active, [data-pressed]");
    const highlighted =
      button.matches(":focus-visible") ||
      (hover.matches && button.matches(":hover"));
    const next = active ? pressed : highlighted ? extended : rest;
    if (target === next) return;
    target = next;
    cancelAnimationFrame(frame);
    if (reducedMotion.matches) {
      render(target);
      return;
    }
    const from = current;
    const started = performance.now();
    const duration = active ? 90 : 460;
    function step(now) {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - (1 - progress) ** 4;
      render(
        from.map((value, index) => value + (target[index] - value) * eased),
      );
      if (progress < 1) frame = requestAnimationFrame(step);
    }
    frame = requestAnimationFrame(step);
  }

  for (const event of [
    "pointerenter",
    "pointerleave",
    "pointerdown",
    "pointerup",
    "pointercancel",
    "lostpointercapture",
    "focus",
    "blur",
    "keydown",
    "keyup",
  ]) {
    button.addEventListener(event, () => requestAnimationFrame(update));
  }
}
