import { apexDogFx } from "./shepherd.js";

const hero = document.querySelector(".dog97");
const hover = matchMedia("(hover: hover) and (pointer: fine)");
if (hover.matches) {
  const lighting = apexDogFx(hero);
  hero.addEventListener("pointermove", lighting.move);
  hero.addEventListener("pointerleave", lighting.leave);
  lighting.cue();
}

const toggle = document.querySelector(".mb");
const navigation = document.getElementById(
  toggle.getAttribute("aria-controls"),
);

function showNavigation(open) {
  navigation.hidden = !open;
  toggle.setAttribute("aria-expanded", String(open));
  toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
}

toggle.addEventListener("click", () => showNavigation(navigation.hidden));
navigation.addEventListener("click", (event) => {
  const link = event.target.closest("a");
  if (!link) return;
  showNavigation(false);
  const target = link.hash && document.getElementById(link.hash.slice(1));
  if (target) target.focus({ preventScroll: true });
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !navigation.hidden) {
    showNavigation(false);
    toggle.focus();
  }
});

const bookingLinks = document.querySelectorAll(".cta-97");
for (const link of bookingLinks) {
  link.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "touch") link.setAttribute("data-pressed", "");
  });
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) {
    link.addEventListener(event, () => link.removeAttribute("data-pressed"));
  }
}

if (!CSS.supports("d", 'path("M0 0")')) {
  const { animateRouteArrow } = await import("./route-arrow.js");
  bookingLinks.forEach(animateRouteArrow);
}
