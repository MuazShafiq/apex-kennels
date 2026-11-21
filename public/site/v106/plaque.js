export function setPlaqueName(plaque, name) {
  const label = plaque.querySelector("[data-np-name]");
  const shownName = name.trim().toLocaleUpperCase();
  label.textContent = shownName;
  const characters = [...shownName].length;
  label.style.setProperty(
    "--nf",
    Math.min(6.1, 36.6 / Math.max(1, characters)).toFixed(2) + "em",
  );
}

export function mountPlaqueLighting(plaque) {
  if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const surface = plaque.parentElement;
  surface.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch" || reduced.matches) return;
    const bounds = surface.getBoundingClientRect();
    const x = Math.max(
      0,
      Math.min(1, (event.clientX - bounds.left) / bounds.width),
    );
    const y = Math.max(
      0,
      Math.min(1, (event.clientY - bounds.top) / bounds.height),
    );
    const edge = Math.max(Math.abs(x - 0.5), Math.abs(y - 0.5)) * 2;
    plaque.classList.add("live");
    plaque.style.setProperty("--ty", ((x - 0.5) * 7).toFixed(2) + "deg");
    plaque.style.setProperty("--tx", ((0.5 - y) * 5).toFixed(2) + "deg");
    plaque.style.setProperty("--px", (x * 100).toFixed(1) + "%");
    plaque.style.setProperty("--py", (y * 100).toFixed(1) + "%");
    plaque.style.setProperty("--sg", (0.25 + 0.45 * edge).toFixed(2));
    plaque.style.setProperty("--sp", "1");
  });
  function resetLight() {
    plaque.classList.remove("live");
    for (const property of ["--ty", "--tx", "--sg", "--sp"])
      plaque.style.removeProperty(property);
  }
  surface.addEventListener("pointerleave", resetLight);
  reduced.addEventListener("change", resetLight);
}
