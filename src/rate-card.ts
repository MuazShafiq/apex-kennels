// Version selection, settings validation and pricing rules for Apex rate cards.

export type FuelMode = 'published' | 'fixed';

export interface RateTerms extends CardDraft {
  version: number;
  effectiveFrom: string;
  packageDays: 30;
}

export interface RateCard extends RateTerms {
  createdBy: string;
  createdAt: string;
  summary: string;
  replacedBy?: number | null;
  withdrawnAt?: string | null;
}

export function rateTerms(card: RateTerms): RateTerms {
  const {version, effectiveFrom, packageDays, stdDaily, cameraDaily, packageDiscount, kmPerLitre, markupPct,
    freshnessHours, fuelMode, fixedFuelPkr, fixedUntil, fixedReason} = card;
  return {version,effectiveFrom,packageDays,stdDaily,cameraDaily,packageDiscount,kmPerLitre,markupPct,
    freshnessHours,fuelMode,fixedFuelPkr,fixedUntil,fixedReason};
}

export function transportFigures(
  card: Pick<RateTerms, 'kmPerLitre'|'markupPct'>, km: number, pkrPerLitre: number
) {
  const litres = km / card.kmPerLitre;
  const fuelCost = litres * pkrPerLitre;
  const exact = fuelCost * (1 + card.markupPct / 100);
  return {litres, fuelCost, exact, charge:Math.ceil(exact - 1e-9)};
}

/**
 * The card in effect at `at`. Withdrawn cards are ignored. Among the rest whose effectiveFrom ≤ at, the latest
 * effectiveFrom wins; a tie (two cards from the same instant) goes to the higher version. Because only one card can be
 * scheduled at a time and publishing replaces it explicitly (planPublish), ties do not arise in practice.
 */
export function cardAt(cards: RateCard[], at: Date): RateCard {
  const t = at.getTime();
  const ok = cards.filter((c) => !c.withdrawnAt && new Date(c.effectiveFrom).getTime() <= t);
  if (!ok.length) throw new Error('No rate card in effect');
  return ok.reduce((a, b) => {
    const ta = new Date(a.effectiveFrom).getTime(), tb = new Date(b.effectiveFrom).getTime();
    return tb > ta || (tb === ta && b.version > a.version) ? b : a;
  });
}

/** The scheduled card, if any: not withdrawn and effectiveFrom after `now`. At most one exists. */
export function scheduledCard(cards: RateCard[], now: Date): RateCard | null {
  const s = cards.filter((c) => !c.withdrawnAt && new Date(c.effectiveFrom).getTime() > now.getTime());
  if (s.length > 1) throw new Error('Invariant broken: more than one scheduled rate card');
  return s[0] || null;
}

export interface PublishRequest {
  expectedLatestVersion: number;        // the highest version the page loaded, scheduled cards included
  effectiveFrom: 'now' | string;        // 'now' or an Asia/Karachi calendar date (YYYY-MM-DD) after today
  replacesScheduledVersion?: number;    // required when a card is scheduled: names the card this one withdraws
  confirmed: boolean;
}
export type PublishPlan =
  | { ok: true; version: number; effectiveFrom: string; withdraw: number | null }
  | { ok: false; status: 409 | 422; code: 'stale' | 'scheduled_card_pending' | 'wrong_scheduled_card' | 'date_not_future' | 'date_too_far' | 'not_confirmed'; message: string };

export const karachiDay = (d: Date) => new Date(d.getTime() + 5 * 3600e3).toISOString().slice(0, 10);

/**
 * Decide what a publish request does, inside the transaction (after locking the rate_cards table or an advisory lock).
 * - Versions are allocated from the highest version ever created, withdrawn cards included, so numbers are never reused.
 * - One scheduled card at a time. Publishing now or scheduling while one is pending must name it in
 *   replacesScheduledVersion; it is withdrawn in the same transaction (audited as rate_card.withdraw).
 * - A dated card starts at 00:00 Asia/Karachi on that date, which must be after today and within 365 days.
 */
export function planPublish(cards: RateCard[], req: PublishRequest, now: Date): PublishPlan {
  if (req.confirmed !== true) return { ok: false, status: 422, code: 'not_confirmed', message: 'Tick “I’ve checked these figures” to publish.' };
  const latest = cards.reduce((m, c) => Math.max(m, c.version), 0);
  if (req.expectedLatestVersion !== latest) return { ok: false, status: 409, code: 'stale', message: 'Someone published a newer card. Reload to see it.' };
  const pending = scheduledCard(cards, now);
  if (pending && req.replacesScheduledVersion === undefined) return { ok: false, status: 409, code: 'scheduled_card_pending', message: 'Version ' + pending.version + ' is scheduled. Publishing this withdraws it; confirm that to continue.' };
  if (pending && req.replacesScheduledVersion !== pending.version) return { ok: false, status: 409, code: 'wrong_scheduled_card', message: 'The scheduled card has changed. Reload to see it.' };
  if (!pending && req.replacesScheduledVersion !== undefined) return { ok: false, status: 409, code: 'wrong_scheduled_card', message: 'The scheduled card has already taken effect or been withdrawn. Reload to see it.' };
  let effectiveFrom: string;
  if (req.effectiveFrom === 'now') effectiveFrom = now.toISOString();
  else {
    const today = karachiDay(now);
    if (!isIsoDate(req.effectiveFrom) || req.effectiveFrom <= today) return { ok: false, status: 422, code: 'date_not_future', message: 'Choose a date after today.' };
    const max = karachiDay(new Date(now.getTime() + 365 * 864e5));
    if (req.effectiveFrom > max) return { ok: false, status: 422, code: 'date_too_far', message: 'Choose a date within a year.' };
    effectiveFrom = req.effectiveFrom + 'T00:00:00+05:00';
  }
  return { ok: true, version: latest + 1, effectiveFrom, withdraw: pending ? pending.version : null };
}

/** A card can be withdrawn only while it is scheduled. After effectiveFrom, correct it by publishing a new card. */
export function canWithdraw(card: RateCard, now: Date): boolean {
  return !card.withdrawnAt && new Date(card.effectiveFrom).getTime() > now.getTime();
}

export function isIsoDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export interface FuelPrice { pkrPerLitre: number; source: 'published' | 'fixed'; effective: string; checkedAt: string; note: string }

/**
 * Fuel price for a calculation. Published mode needs a live published rate; there is no stored fallback.
 * Fixed mode is valid only until fixedUntil (inclusive, Asia/Karachi day) and must carry a reason.
 */
export function fuelFor(card: RateTerms, now: Date, published: FuelPrice | null): FuelPrice {
  if (card.fuelMode === 'fixed') {
    if (!card.fixedFuelPkr || !card.fixedUntil || !card.fixedReason) throw new Error('Fixed fuel price is incomplete');
    if (karachiDay(now) > card.fixedUntil) throw new Error('Fixed fuel price has expired; switch back to the published rate or set a new end date');
    return { pkrPerLitre: card.fixedFuelPkr, source: 'fixed', effective: card.effectiveFrom, checkedAt: now.toISOString(), note: 'Fixed by owner until ' + card.fixedUntil + ': ' + card.fixedReason };
  }
  if (!published) throw new Error('Published petrol rate unavailable; transport cannot be calculated');
  return published;
}

export interface Stay { dogs: number; billedDays: number; camera: boolean; package: 'daily' | 'monthly' }
export interface Loop { kind: 'pickup' | 'dropoff'; km: number }   // each a full loop: kennel → Bawli → gate → Bawli → kennel

export interface Figures {
  rateCardVersion: number;
  dailyRate: number; boarding: number; packageDiscount: number;
  transport: null | { loops: Loop[]; km: number; kmPerLitre: number; litres: number; fuel: FuelPrice; fuelCost: number; markupPct: number; exact: number; charge: number };
  total: number;
}

/** Everything an estimate revision or an invoice stores. Snapshot it; never recompute an issued invoice. */
export function price(card: RateCard, stay: Stay, loops: Loop[], fuel: FuelPrice | null): Figures {
  if (stay.package === 'monthly' && stay.billedDays !== card.packageDays) throw new Error('Only for exactly 30 billed days. This stay is ' + stay.billedDays + '.');
  const dailyRate = stay.camera ? card.cameraDaily : card.stdDaily;
  // defence in depth: validation and the database CHECK already forbid this
  if (stay.package === 'monthly' && Math.min(card.stdDaily, card.cameraDaily) * card.packageDays <= card.packageDiscount) throw new Error('Rate card ' + card.version + ' gives a package price of zero or less; it is invalid');
  const boarding = dailyRate * stay.billedDays * stay.dogs;
  const packageDiscount = stay.package === 'monthly' ? card.packageDiscount * stay.dogs : 0;
  let transport: Figures['transport'] = null;
  if (loops.length) {
    if (!fuel) throw new Error('Fuel price required for transport');
    const km = Math.round(loops.reduce((a, l) => a + l.km, 0) * 10) / 10;
    transport = { loops, km, kmPerLitre: card.kmPerLitre, fuel, markupPct: card.markupPct,
      ...transportFigures(card, km, fuel.pkrPerLitre) };
  }
  return { rateCardVersion: card.version, dailyRate, boarding, packageDiscount, transport, total: boarding - packageDiscount + (transport ? transport.charge : 0) };
}

export interface CardDraft { stdDaily: number; cameraDaily: number; packageDiscount: number; kmPerLitre: number; markupPct: number; freshnessHours: number; fuelMode: FuelMode; fixedFuelPkr: number | null; fixedUntil: string | null; fixedReason: string | null }

const DRAFT_KEYS = ['stdDaily', 'cameraDaily', 'packageDiscount', 'kmPerLitre', 'markupPct', 'freshnessHours', 'fuelMode', 'fixedFuelPkr', 'fixedUntil', 'fixedReason'] as const;
const decimals = (v: number) => { const t = String(v); if (/e/i.test(t)) return 99; const i = t.indexOf('.'); return i < 0 ? 0 : t.length - i - 1; };

/**
 * Strict parse of the POST /staff/settings/rate-cards `card` body. Use this, not a cast: it rejects unknown keys,
 * strings where numbers belong ("2,500", "12"), NaN/Infinity, excess precision (the database NUMERIC columns would
 * otherwise round silently), bad enums, impossible dates and fixed-price fields sent with the published mode.
 * `today` is the Asia/Karachi calendar date (YYYY-MM-DD). Messages are the ones the page shows.
 */
export function parseCardDraft(input: unknown, today: string): { ok: true; card: CardDraft } | { ok: false; errors: Record<string, string> } {
  const e: Record<string, string> = Object.create(null);
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, errors: { _: 'Expected a rate card object.' } };
  const o = input as Record<string, unknown>;
  for (const k of Object.keys(o)) if (!(DRAFT_KEYS as readonly string[]).includes(k)) e[k] = 'Unknown field.';
  const num = (k: string, min: number, max: number, dp: number, unit: 'PKR' | 'n') => {
    const v = o[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) { e[k] = 'Enter a number.'; return NaN; }
    if (dp === 0 && !Number.isInteger(v)) { e[k] = unit === 'PKR' ? 'Whole rupees only.' : 'Whole numbers only.'; return NaN; }
    if (dp > 0 && decimals(v) > dp) { e[k] = 'Up to ' + dp + ' decimal place' + (dp > 1 ? 's.' : '.'); return NaN; }
    if (v < min || v > max) { e[k] = 'Between ' + min.toLocaleString('en-US') + ' and ' + max.toLocaleString('en-US') + '.'; return NaN; }
    return v;
  };
  const std = num('stdDaily', 500, 50000, 0, 'PKR'), cam = num('cameraDaily', 500, 50000, 0, 'PKR'), disc = num('packageDiscount', 0, 200000, 0, 'PKR');
  const kmpl = num('kmPerLitre', 3, 40, 1, 'n'), mk = num('markupPct', 0, 100, 0, 'n'), fresh = num('freshnessHours', 1, 168, 0, 'n');
  if (!e.packageDiscount && !e.stdDaily && !e.cameraDaily) {
    const lo = Math.min(std, cam);
    if (disc >= lo * 30) e.packageDiscount = 'Must be less than 30 days at the ' + (std <= cam ? 'standard' : 'camera-cage') + ' rate (' + (lo * 30).toLocaleString('en-US') + '), so neither package price reaches zero.';
  }
  const mode = o.fuelMode;
  let fixedFuelPkr: number | null = null, fixedUntil: string | null = null, fixedReason: string | null = null;
  if (mode !== 'published' && mode !== 'fixed') e.fuelMode = 'Choose the published rate or a fixed price.';
  else if (mode === 'published') {
    for (const k of ['fixedFuelPkr', 'fixedUntil', 'fixedReason']) if (o[k] !== null) e[k] = 'Only with a fixed price.';
  } else {
    const f = num('fixedFuelPkr', 100, 1000, 2, 'n'); fixedFuelPkr = Number.isNaN(f) ? null : f;
    if (!isIsoDate(o.fixedUntil)) e.fixedUntil = 'Choose an end date.';
    else if ((o.fixedUntil as string) < today) e.fixedUntil = 'The end date has passed.';
    else fixedUntil = o.fixedUntil as string;
    const reason = typeof o.fixedReason === 'string' ? o.fixedReason : '';
    const r = reason.trim();
    if (/[\u0000-\u001f\u007f]/.test(reason)) e.fixedReason = 'Use plain text.';
    else if ([...r].length < 5) e.fixedReason = 'Say why the published rate isn’t used.';
    else if ([...r].length > 120) e.fixedReason = 'Keep it to 120 characters.';
    else fixedReason = r;
  }
  if (Object.keys(e).length) return { ok: false, errors: { ...e } };
  return { ok: true, card: { stdDaily: std, cameraDaily: cam, packageDiscount: disc, kmPerLitre: kmpl, markupPct: mk, freshnessHours: fresh, fuelMode: mode as FuelMode, fixedFuelPkr, fixedUntil, fixedReason } };
}

/** Errors only (for the page). Same rules as parseCardDraft. */
export function validate(d: unknown, today: string): Record<string, string> {
  const r = parseCardDraft(d, today);
  return r.ok ? {} : r.errors;
}
