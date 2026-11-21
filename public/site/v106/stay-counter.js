const DAY = 86_400_000;
const PACKAGES = { 2500: 65000, 3000: 80000 };
const money = new Intl.NumberFormat("en-PK");
const dateFormat = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const stampFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const iso = (time) => new Date(time).toISOString().slice(0, 10);
const rupees = (amount) => "Rs " + money.format(amount);

function dateValue(field) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(field.value)) return NaN;
  const timestamp = Date.parse(field.value + "T00:00:00Z");
  return Number.isFinite(timestamp) && iso(timestamp) === field.value
    ? timestamp
    : NaN;
}

export function mountStayCounter(counter, plaqueDate) {
  const part = (name) => counter.querySelector(`[data-c-${name}]`);
  const arrival = part("in");
  const collection = part("out");
  const error = part("err");
  const duration = part("mid");
  const startLabel = part("a");
  const endLabel = part("b");
  const strip = part("strip");
  const calculation = part("eq");
  const original = part("was");
  const total = part("tot");
  const savings = part("win");
  const lengths = [...counter.querySelectorAll("[data-len]")];
  const todayInIslamabad = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Karachi",
  })
    .formatToParts()
    .filter((part) => part.type !== "literal");
  const date = Object.fromEntries(
    todayInIslamabad.map((part) => [part.type, part.value]),
  );
  const midnight = Date.parse(
    `${date.year}-${date.month}-${date.day}T00:00:00Z`,
  );
  const weekday = new Date(midnight).getUTCDay();
  const nextFriday = midnight + ((5 - weekday + 7) % 7 || 7) * DAY;
  arrival.min = collection.min = iso(midnight);
  arrival.value ||= iso(nextFriday);
  collection.value ||= iso(nextFriday + 11 * DAY);

  function recalculate(updatePlaque = false) {
    const start = dateValue(arrival);
    const end = dateValue(collection);
    const valid =
      Number.isFinite(start) &&
      Number.isFinite(end) &&
      start >= midnight &&
      end >= start;
    const days = valid ? (end - start) / DAY + 1 : 0;
    for (const choice of lengths)
      choice.setAttribute("aria-pressed", String(+choice.dataset.len === days));
    const outOfOrder =
      Number.isFinite(start) && Number.isFinite(end) && end < start;
    const past = Number.isFinite(start) && start < midnight;
    error.hidden = !(outOfOrder || past);
    error.textContent = past
      ? "Arrival must be today or later."
      : "Collection must be on or after arrival.";
    strip.hidden = !valid;
    if (!valid) {
      calculation.textContent = "Choose both dates";
      total.textContent = "—";
      savings.hidden = original.hidden = true;
      return;
    }

    const packageStay = days === 30;
    const rate = +counter.querySelector('input[name="apx-c-space"]:checked')
      .value;
    const billedDays = days + (days === 1 ? " billed day" : " billed days");
    duration.textContent = billedDays;
    startLabel.textContent = dateFormat.format(start).replace(",", "");
    endLabel.textContent = dateFormat.format(end).replace(",", "");
    strip.classList.toggle("dense", days > 40);
    strip.classList.toggle("p30", packageStay);
    strip.style.setProperty("--n", Math.min(days, 40));
    strip.style.setProperty("--g", days > 20 ? "2px" : "3px");
    calculation.textContent =
      billedDays + (packageStay ? "" : " × " + rupees(rate));
    original.textContent = rupees(days * rate);
    total.textContent = rupees(packageStay ? PACKAGES[rate] : days * rate);
    savings.hidden = original.hidden = !packageStay;
    if (updatePlaque && plaqueDate) {
      plaqueDate.textContent = (
        stampFormat.format(start) +
        " – " +
        stampFormat.format(end)
      ).toUpperCase();
      plaqueDate.classList.remove("neutral");
    }
  }

  arrival.addEventListener("change", () => {
    const start = dateValue(arrival);
    if (Number.isFinite(start)) {
      collection.min = iso(Math.max(midnight, start));
      if (dateValue(collection) < start) collection.value = arrival.value;
    }
    recalculate(true);
  });
  collection.addEventListener("change", () => recalculate(true));
  for (const choice of counter.querySelectorAll('input[type="radio"]'))
    choice.addEventListener("change", () => recalculate());
  for (const choice of lengths)
    choice.addEventListener("click", () => {
      const chosen = dateValue(arrival);
      const start =
        Number.isFinite(chosen) && chosen >= midnight ? chosen : nextFriday;
      arrival.value = iso(start);
      collection.min = arrival.value;
      collection.value = iso(start + (+choice.dataset.len - 1) * DAY);
      recalculate(true);
    });
  recalculate();
}
