import { mountCurrentRates } from "./current-rates.js";
import "./apex-cine.js";
import { animateRouteArrow } from "../route-arrow.js";
import { mountPlaqueLighting, setPlaqueName } from "./plaque.js";
import { mountStayCounter } from "./stay-counter.js";

const root = document.querySelector('[data-apex-site="home"]');
const motion = matchMedia("(prefers-reduced-motion: reduce)");
const bar = root.querySelector("[data-bar]");
const sheet = root.querySelector("[data-sheet]");
const triggers = [...root.querySelectorAll("[data-menu-open]")];
const main = root.querySelector("main");
const footer = root.querySelector("footer");
const heroAction = root.querySelector("[data-hero-act]");
let opener;
let barVisible = false;

function updateBar() {
  bar.classList.toggle("on", barVisible);
  bar.inert = !barVisible || !sheet.hidden;
}
function setMenu(open, restore) {
  sheet.hidden = !open;
  main.inert = footer.inert = !sheet.hidden;
  document.documentElement.classList.toggle("menu-open", open);
  for (const trigger of triggers)
    trigger.setAttribute("aria-expanded", String(open));
  updateBar();
  if (open) sheet.querySelector("nav a").focus();
  else if (restore)
    (opener?.closest("[inert]")
      ? triggers.find((button) => !button.closest("[inert]"))
      : opener
    )?.focus();
}
for (const trigger of triggers)
  trigger.addEventListener("click", () => {
    opener = trigger;
    setMenu(true, false);
  });
sheet
  .querySelector("[data-menu-close]")
  .addEventListener("click", () => setMenu(false, true));
for (const anchor of sheet.querySelectorAll("[data-close]"))
  anchor.addEventListener("click", () => {
    setMenu(false, false);
    document.querySelector(anchor.hash)?.focus({ preventScroll: true });
  });
sheet.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    setMenu(false, true);
  }
  if (event.key !== "Tab") return;
  const focusable = [
    ...sheet.querySelectorAll("a[href],button:not([disabled])"),
  ];
  const first = focusable[0],
    last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});
matchMedia("(min-width: 1100px)").addEventListener("change", (event) => {
  if (event.matches && !sheet.hidden) {
    setMenu(false, false);
    document.getElementById("top").focus({ preventScroll: true });
  }
});
updateBar();
if ("IntersectionObserver" in window) {
  new IntersectionObserver(([entry]) => {
    barVisible = !entry.isIntersecting && entry.boundingClientRect.top < 0;
    updateBar();
  }).observe(heroAction);

  if (!motion.matches && !window.ApexCine) {
    const reveal = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            reveal.unobserve(entry.target);
          }
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    for (const element of root.querySelectorAll("[data-rv]")) {
      if (element.getBoundingClientRect().top <= innerHeight) continue;
      element.classList.add("pre");
      reveal.observe(element);
    }
  }
}

// The supplied cinematic engine owns the registered shepherd lighting and scroll scenes.
const portrait = matchMedia("(max-aspect-ratio: 1/1)");
const finePointer = matchMedia("(hover: hover) and (pointer: fine)");
function mountCinematic() {
  root.__disposeCine?.();
  window.ApexCine(root, {
    plate: "/site/v106/hero-landscape.webp",
    plateP: "/site/v106/hero-portrait.webp",
    ears: {
      land: { bg: "/site/v106/hero-ear-landscape.webp", matte: "/site/v106/hero-ear-landscape.png", crop: [1323,42,211,158], piv: [[1388,172],[1474,186]] },
      port: { bg: "/site/v106/hero-ear-portrait.webp", matte: "/site/v106/hero-ear-portrait.png", crop: [274,59,188,133], piv: [[330.4,166.52],[406.08,178.84]] },
    },
    layers: ["/site/v106/shepherd-key.webp", "/site/v106/shepherd-rim.webp", "/site/v106/shepherd-eye.webp"],
  });
}
mountCinematic();
let landscape = getComputedStyle(root.querySelector("[data-stage]")).display !== "none";
addEventListener("resize", () => {
  const next = getComputedStyle(root.querySelector("[data-stage]")).display !== "none";
  if (next !== landscape) { landscape = next; mountCinematic(); }
});
for (const preference of [motion, portrait, finePointer]) preference.addEventListener("change", mountCinematic);
const plaque = root.querySelector("[data-plaque]");
const dogName = root.querySelector("[data-np-in]");
dogName.addEventListener("input", () => {
  const value = dogName.value
    .toUpperCase()
    .replace(/[^\p{L}\p{N} ’'-]/gu, "")
    .slice(0, 10)
    .trim();
  setPlaqueName(plaque, value || "BRUNO");
});
mountPlaqueLighting(plaque);
const updateCounterRates = mountStayCounter(
  root.querySelector("[data-counter]"),
  root.querySelector("[data-np-date]"),
);

mountCurrentRates(root, updateCounterRates);

const route = root.querySelector("[data-route]");
const messages = {
  pick: "We collect your dog from your confirmed gate.",
  drop: "We bring your dog back to your confirmed gate.",
  both: "Pickup and drop-off at the same gate.",
  two: "Choose separate gates for pickup and drop-off.",
  none: "Bring your dog to the kennel and collect them after the stay.",
};
const modes = [...route.querySelectorAll("[data-m]")];
for (const choice of modes)
  choice.addEventListener("click", () => {
    const mode = choice.dataset.m;
    route.dataset.mode = mode;
    for (const button of modes)
      button.setAttribute("aria-pressed", String(button === choice));
    route.querySelector("[data-rt-say]").textContent = messages[mode];
  });

for (const button of root.querySelectorAll(".cta:has(.ar-b)")) {
  button.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "touch") button.setAttribute("data-pressed", "");
  });
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) {
    button.addEventListener(event, () =>
      button.removeAttribute("data-pressed"),
    );
  }
  if (!CSS.supports("d", 'path("M0 0")')) animateRouteArrow(button);
}

const van = root.querySelector("[data-van]");
if (van && "IntersectionObserver" in window) {
  new IntersectionObserver(([entry]) => {
    van.classList.toggle("is-idle", !entry.isIntersecting);
  }).observe(van);
}
