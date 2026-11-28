/** Public display prices only. The server owns effective-card selection and private settings. */
const money = (value) => "Rs " + new Intl.NumberFormat("en-PK").format(value);
function validBoardingPrices(card) {
  return card && [card.stdDaily, card.cameraDaily].every(value => Number.isSafeInteger(value) && value >= 500 && value <= 50_000) &&
    card.packageDays === 30 && Number.isSafeInteger(card.packageDiscount) && card.packageDiscount >= 0 &&
    card.packageDiscount <= 200_000 && card.packageDiscount < Math.min(card.stdDaily, card.cameraDaily) * card.packageDays;
}
export function validPublicCard(card, now = Date.now()) {
  return validBoardingPrices(card) && Number.isSafeInteger(card.version) && card.version > 0 &&
    typeof card.effectiveFrom === "string" && Number.isFinite(Date.parse(card.effectiveFrom)) && Date.parse(card.effectiveFrom) <= now;
}
export function mountCurrentRates(root, updateCounter) {
  const status = root.querySelector("[data-rate-status]");
  let seenLive = false;
  try { seenLive = sessionStorage.getItem("apex-current-rates-live") === "1"; } catch {}
  function display(card) {
    updateCounter(card);
    const values = card ? {
      stdDaily: money(card.stdDaily), cameraDaily: money(card.cameraDaily),
      stdPackage: money(card.stdDaily * 30 - card.packageDiscount), cameraPackage: money(card.cameraDaily * 30 - card.packageDiscount),
      stdOriginal: money(card.stdDaily * 30), cameraOriginal: money(card.cameraDaily * 30),
      stdLabel: money(card.stdDaily) + " a day", cameraLabel: money(card.cameraDaily) + " a day",
      savings: card.packageDiscount ? "Save " + money(card.packageDiscount) + " compared with the daily rate." : "Exactly 30 billed days; package selection is confirmed by staff.",
      counterSavings: "30-day package estimate. Staff confirm the package before booking.",
    } : null;
    for (const node of root.querySelectorAll("[data-rate]")) {
      node.textContent = values ? values[node.dataset.rate] : (node.matches("s") ? "" : "Ask us for current rates");
      if (node.matches("s")) node.hidden = !card || card.packageDiscount === 0;
    }
    status.hidden = Boolean(card);
    status.textContent = card ? "" : "Current rates are unavailable. Contact us to confirm boarding prices.";
  }
  // Avoid showing an old rate card on return visits after this browser has used live pricing.
  if (seenLive) display(null);
  let pending = false;
  async function refresh() {
    if (pending) return;
    pending = true;
    try {
      const response = await fetch("/api/rate-card/current", { cache: "no-cache", credentials: "omit", signal: globalThis.AbortSignal?.timeout?.(8000) });
      const card = await response.json();
      if (response.status === 503 && card.code === "RATES_DISABLED" && !seenLive && validBoardingPrices(card.legacy)) { display(card.legacy); return; }
      if (!response.ok || !validPublicCard(card)) throw new Error("Current card unavailable");
      seenLive = true;
      try { sessionStorage.setItem("apex-current-rates-live", "1"); } catch {}
      display(card);
    } catch { display(null); }
    finally { pending = false; }
  }
  refresh();
  setInterval(() => { if (!document.hidden) refresh(); }, 60_000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
  addEventListener("pageshow", (event) => { if (event.persisted) refresh(); });
}
