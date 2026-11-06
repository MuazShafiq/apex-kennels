/** Pure, deterministic pricing engine. All money amounts are integer PKR. */
export type DayCountingRule = 'inclusive_days' | 'elapsed_nights';
export type Discount =
  | { kind: 'fixed'; amountPkr: number }
  | { kind: 'percent'; basisPoints: number }; // 1000 = 10.00%
export type Promotion = {
  code: string;
  discount: Discount;
  active: boolean;
  startsOn?: string;
  endsOn?: string;
  minimumSubtotalPkr?: number;
  usageLimit?: number;
  usageCount: number; // snapshot only; redemption must be atomic in DB
};
export type PriceConfig = {
  dayCountingRule: DayCountingRule;
  accommodation: Record<string, { label: string; pricePerDayPkr: number }>;
  allowPromoWithManualDiscount: boolean;
};
export type Extra = { label: string; quantity: number; unitPricePkr: number };
export type BookingQuoteInput = {
  startDate: string;
  endDate: string;
  accommodationType: string;
  petCount: number;
  extras?: Extra[];
  promoCode?: string;
  manualDiscount?: Discount;
};
export type QuoteLine = { label: string; quantity: number; unitPricePkr: number; totalPkr: number };
export type AppliedDiscount = { source: 'promo' | 'manual' | 'package'; label: string; amountPkr: number };
export type Quote = {
  startDate: string;
  endDate: string;
  billedDays: number;
  lines: QuoteLine[];
  subtotalPkr: number;
  discounts: AppliedDiscount[];
  totalPkr: number;
  currency: 'PKR';
  // Snapshots are deliberate: price changes must not alter historical invoices.
};

const ensureMoney = (n: number, label: string) => {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`${label} must be a non-negative integer PKR amount`);
};
const ensureCount = (n: number, label: string) => {
  if (!Number.isSafeInteger(n) || n < 1) throw new Error(`${label} must be a positive integer`);
};
const dateMs = (date: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Invalid date: ${date}`);
  const [y, m, d] = date.split('-').map(Number);
  const ts = Date.UTC(y, m - 1, d);
  const check = new Date(ts).toISOString().slice(0, 10);
  if (check !== date) throw new Error(`Invalid date: ${date}`);
  return ts;
};
export function countBilledDays(start: string, end: string, mode: DayCountingRule): number {
  const diff = (dateMs(end) - dateMs(start)) / 86_400_000;
  if (diff < 0) throw new Error('End date cannot be before start date');
  const count = diff + (mode === 'inclusive_days' ? 1 : 0);
  if (count < 1) throw new Error('Stay must include at least one billable day/night');
  return count;
}
function computeDiscount(d: Discount, basePkr: number): number {
  if (d.kind === 'fixed') {
    ensureMoney(d.amountPkr, 'Discount');
    return Math.min(d.amountPkr, basePkr);
  }
  if (!Number.isSafeInteger(d.basisPoints) || d.basisPoints < 0 || d.basisPoints > 10_000) {
    throw new Error('Percentage discount must be between 0% and 100%');
  }
  return Math.min(Math.floor((basePkr * d.basisPoints + 5_000) / 10_000), basePkr);
}
export function calculateQuote(
  input: BookingQuoteInput,
  config: PriceConfig,
  promotions: Promotion[] = [],
  calculationDate = new Date().toISOString().slice(0, 10),
): Quote {
  const billedDays = countBilledDays(input.startDate, input.endDate, config.dayCountingRule);
  ensureCount(input.petCount, 'Pet count');
  const rate = config.accommodation[input.accommodationType];
  if (!rate) throw new Error(`Unknown accommodation type: ${input.accommodationType}`);
  ensureMoney(rate.pricePerDayPkr, 'Boarding rate');
  const quantity = billedDays * input.petCount;
  if (!Number.isSafeInteger(quantity)) throw new Error('Boarding quantity overflow');
  const lines: QuoteLine[] = [{ label: rate.label, quantity, unitPricePkr: rate.pricePerDayPkr, totalPkr: quantity * rate.pricePerDayPkr }];
  for (const extra of input.extras ?? []) {
    ensureCount(extra.quantity, `Quantity for ${extra.label}`);
    ensureMoney(extra.unitPricePkr, `Price for ${extra.label}`);
    const totalPkr = extra.quantity * extra.unitPricePkr;
    if (!Number.isSafeInteger(totalPkr)) throw new Error('Amount overflow');
    lines.push({ ...extra, totalPkr });
  }
  const subtotalPkr = lines.reduce((sum, line) => sum + line.totalPkr, 0);
  if (!Number.isSafeInteger(subtotalPkr)) throw new Error('Subtotal overflow');
  if (input.promoCode && input.manualDiscount && !config.allowPromoWithManualDiscount) {
    throw new Error('Promo code and manual discount cannot be combined under these rules');
  }
  const discounts: AppliedDiscount[] = [];
  let remaining = subtotalPkr;
  if (input.promoCode) {
    const code = input.promoCode.trim().toUpperCase();
    const promo = promotions.find(p => p.code.trim().toUpperCase() === code);
    if (!promo || !promo.active) throw new Error('Invalid promo code');
    if (promo.startsOn && dateMs(calculationDate) < dateMs(promo.startsOn)) throw new Error('Promo code has not started');
    if (promo.endsOn && dateMs(calculationDate) > dateMs(promo.endsOn)) throw new Error('Promo code has expired');
    if (promo.usageLimit !== undefined && promo.usageCount >= promo.usageLimit) throw new Error('Promo code usage limit reached');
    if (promo.minimumSubtotalPkr !== undefined && subtotalPkr < promo.minimumSubtotalPkr) throw new Error('Minimum booking amount not met');
    const amountPkr = computeDiscount(promo.discount, remaining);
    discounts.push({ source: 'promo', label: code, amountPkr });
    remaining -= amountPkr;
  }
  if (input.manualDiscount) {
    const amountPkr = computeDiscount(input.manualDiscount, remaining);
    discounts.push({ source: 'manual', label: 'Manual adjustment', amountPkr });
    remaining -= amountPkr;
  }
  return { startDate: input.startDate, endDate: input.endDate, billedDays, lines, subtotalPkr, discounts, totalPkr: remaining, currency: 'PKR' };
}
