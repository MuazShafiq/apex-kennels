// Approved worked examples from board 17 and the staff implementation handoff.
import assert from 'node:assert/strict';
import test from 'node:test';
import { type PublishPlan, price, cardAt, validate, fuelFor, parseCardDraft, planPublish, scheduledCard, canWithdraw, type RateCard } from './rate-card.ts';

function errorCode(plan: PublishPlan) {
  assert.equal(plan.ok, false);
  if (!plan.ok) return plan.code;
}

const v3: RateCard = { version: 3, effectiveFrom: '2026-11-01T00:00:00+05:00', stdDaily: 2500, cameraDaily: 3000, packageDays: 30, packageDiscount: 10000, kmPerLitre: 12, fuelMode: 'published', fixedFuelPkr: null, fixedUntil: null, fixedReason: null, markupPct: 20, freshnessHours: 24, createdBy: 'Fatima', createdAt: '2026-10-28T18:10:00+05:00', summary: 'Camera cage 2,800 → 3,000' };
const pub = { pkrPerLitre: 330, source: 'published' as const, effective: '2026-11-16', checkedAt: '2026-11-22T10:40:00+05:00', note: 'national rate' };

test('approved boarding and independently measured transport examples', () => {
  // Bruno · camera · 12 days · pickup + drop-off, different gates → 38,726
  const bruno = price(v3, { dogs: 1, billedDays: 12, camera: true, package: 'daily' }, [{ kind: 'pickup', km: 38.4 }, { kind: 'dropoff', km: 44.2 }], pub);
  assert.equal(bruno.boarding, 36000); assert.equal(bruno.transport!.charge, 2726); assert.equal(bruno.total, 38726);
  // Mishka · standard · exactly 30 days · package → 65,000; camera would be 80,000
  assert.equal(price(v3, { dogs: 1, billedDays: 30, camera: false, package: 'monthly' }, [], null).total, 65000);
  assert.equal(price(v3, { dogs: 1, billedDays: 30, camera: true, package: 'monthly' }, [], null).total, 80000);
  assert.throws(() => price(v3, { dogs: 1, billedDays: 29, camera: false, package: 'monthly' }, [], null), /exactly 30/);
  // Rocket & Luna · standard · 2 dogs · 4 days · pickup only → boarding 20,000, transport 1,743
  const rl = price(v3, { dogs: 2, billedDays: 4, camera: false, package: 'daily' }, [{ kind: 'pickup', km: 52.8 }], pub);
  assert.equal(rl.boarding, 20000); assert.equal(rl.transport!.charge, 1743);
});

test('effective cards price new work and preserve previously calculated figures', () => {
  const stay = { dogs: 1, billedDays: 12, camera: true, package: 'daily' } as const;
  const loops = [{ kind: 'pickup', km: 38.4 }, { kind: 'dropoff', km: 44.2 }] as const;
  const previous = price(v3, stay, [...loops], pub);
// A newer card never changes figures already computed with v3 (they are snapshots)
  const v4: RateCard = { ...v3, version: 4, effectiveFrom: '2026-12-01T00:00:00+05:00', cameraDaily: 3200, markupPct: 25 };
  assert.equal(cardAt([v3, v4], new Date('2026-11-28T12:00:00+05:00')).version, 3);
  assert.equal(cardAt([v3, v4], new Date('2026-12-01T00:00:01+05:00')).version, 4);
  assert.equal(previous.total, 38726);
  assert.equal(price(v4, stay, [...loops], pub).total, 38400 + 2840);
});

test('fixed fuel expires at Karachi midnight and published fuel is required', () => {

// Fuel: no published rate → no calculation; fixed price expires and needs a reason
  assert.throws(() => fuelFor(v3, new Date(), null), /unavailable/);
  const fx: RateCard = { ...v3, fuelMode: 'fixed', fixedFuelPkr: 345, fixedUntil: '2026-12-05', fixedReason: 'Published rate lookup down' };
  assert.equal(fuelFor(fx, new Date('2026-12-05T20:00:00+05:00'), null).pkrPerLitre, 345);
  assert.throws(() => fuelFor(fx, new Date('2026-12-06T08:00:00+05:00'), null), /expired/);

  assert.equal(fuelFor(fx, new Date('2026-12-05T23:59:59.999+05:00'), null).pkrPerLitre, 345);
});

test('validation rejects invalid and unknown inputs and protects both package prices', () => {
  assert.deepEqual(validate({ stdDaily: 2500, cameraDaily: 3000, packageDiscount: 10000, kmPerLitre: 12, markupPct: 20, freshnessHours: 24, fuelMode: 'published', fixedFuelPkr: null, fixedUntil: null, fixedReason: null }, '2026-11-22'), {});
  assert.equal(validate({ stdDaily: 2500.5, cameraDaily: 3000, packageDiscount: 80000, kmPerLitre: 2, markupPct: 120, freshnessHours: 24, fuelMode: 'fixed', fixedFuelPkr: 345, fixedUntil: '2026-11-01', fixedReason: '' }, '2026-11-22').stdDaily, 'Whole rupees only.');

  // Package prices: the discount must leave BOTH cage types above zero (checked against the cheaper daily rate)
  const base = { stdDaily: 2500, cameraDaily: 3000, packageDiscount: 10000, kmPerLitre: 12, markupPct: 20, freshnessHours: 24, fuelMode: 'published', fixedFuelPkr: null, fixedUntil: null, fixedReason: null };
  assert.match(validate({ ...base, cameraDaily: 2000, packageDiscount: 65000 }, '2026-11-22').packageDiscount, /camera-cage rate \(60,000\)/);
  assert.match(validate({ ...base, packageDiscount: 75000 }, '2026-11-22').packageDiscount, /standard rate \(75,000\)/);
  assert.deepEqual(validate({ ...base, cameraDaily: 2000, packageDiscount: 59999 }, '2026-11-22'), {});
  assert.throws(() => price({ ...v3, cameraDaily: 2000, packageDiscount: 60000 }, { dogs: 1, billedDays: 30, camera: true, package: 'monthly' }, [], null), /zero or less/);

  // Strict input: types, precision, enums, unknown keys, fixed fields only with a fixed price, real dates, reason length
  assert.equal(validate({ ...base, stdDaily: '2,500' }, '2026-11-22').stdDaily, 'Enter a number.');
  assert.equal(validate({ ...base, kmPerLitre: 12.25 }, '2026-11-22').kmPerLitre, 'Up to 1 decimal place.');
  assert.equal(validate({ ...base, kmPerLitre: Infinity }, '2026-11-22').kmPerLitre, 'Enter a number.');
  assert.equal(validate({ ...base, fuelMode: 'cheap' }, '2026-11-22').fuelMode, 'Choose the published rate or a fixed price.');
  assert.equal(validate({ ...base, discountPct: 5 }, '2026-11-22').discountPct, 'Unknown field.');
  assert.equal(validate({ ...base, fixedFuelPkr: 345 }, '2026-11-22').fixedFuelPkr, 'Only with a fixed price.');
  const fixed = { ...base, fuelMode: 'fixed', fixedFuelPkr: 345.5, fixedUntil: '2026-12-05', fixedReason: 'Published rate lookup down' };
  assert.equal(parseCardDraft(fixed, '2026-11-22').ok, true);
  assert.equal(validate({ ...fixed, fixedFuelPkr: 345.555 }, '2026-11-22').fixedFuelPkr, 'Up to 2 decimal places.');
  assert.equal(validate({ ...fixed, fixedUntil: '2026-02-30' }, '2026-11-22').fixedUntil, 'Choose an end date.');
  assert.equal(validate({ ...fixed, fixedUntil: '2026-11-21' }, '2026-11-22').fixedUntil, 'The end date has passed.');
  assert.equal(validate({ ...fixed, fixedReason: 'x'.repeat(121) }, '2026-11-22').fixedReason, 'Keep it to 120 characters.');
  assert.equal(validate([], '2026-11-22')._, 'Expected a rate card object.');

  assert.equal(validate({ ...base, ['__proto__']: true }, '2026-11-22')['__proto__'], 'Unknown field.');
});

test('publishing and withdrawal respect version order and schedule boundaries', () => {
  const now = new Date('2026-11-22T10:52:00+05:00');
  const v4s: RateCard = { ...v3, version: 4, effectiveFrom: '2026-12-01T00:00:00+05:00', cameraDaily: 3200 };
  assert.equal(scheduledCard([v3, v4s], now)!.version, 4);
  assert.equal(cardAt([v3, v4s], now).version, 3);
  const req = { expectedLatestVersion: 4, effectiveFrom: 'now', confirmed: true } as const;
  assert.equal(errorCode(planPublish([v3, v4s], req, now)), 'scheduled_card_pending');
  assert.equal(errorCode(planPublish([v3, v4s], { ...req, expectedLatestVersion: 3 }, now)), 'stale');
  assert.equal(errorCode(planPublish([v3, v4s], { ...req, replacesScheduledVersion: 9 }, now)), 'wrong_scheduled_card');
  const plan = planPublish([v3, v4s], { ...req, replacesScheduledVersion: 4 }, now);
  assert.deepEqual(plan.ok && [plan.version, plan.withdraw], [5, 4]);
  assert.equal(errorCode(planPublish([v3], { expectedLatestVersion: 3, effectiveFrom: '2026-11-22', confirmed: true }, now)), 'date_not_future');
  assert.equal(errorCode(planPublish([v3], { expectedLatestVersion: 3, effectiveFrom: '2026-12-01', confirmed: false }, now)), 'not_confirmed');
  const dated = planPublish([v3], { expectedLatestVersion: 3, effectiveFrom: '2026-12-01', confirmed: true }, now);
  assert.equal(dated.ok && dated.effectiveFrom, '2026-12-01T00:00:00+05:00');
  // after withdrawal (and replacement by v5 now), v4 never applies and its number stays used
  const v4w: RateCard = { ...v4s, withdrawnAt: now.toISOString() };
  const v5: RateCard = { ...v3, version: 5, effectiveFrom: now.toISOString(), markupPct: 25 };
  assert.equal(cardAt([v3, v4w, v5], new Date('2026-12-02T00:00:00+05:00')).version, 5);
  const next = planPublish([v3, v4w, v5], { expectedLatestVersion: 5, effectiveFrom: 'now', confirmed: true }, now);
  assert.equal(next.ok && next.version, 6);
  assert.equal(canWithdraw(v4s, now), true);
  assert.equal(canWithdraw(v4s, new Date('2026-12-01T00:00:01+05:00')), false);
  assert.equal(canWithdraw(v4w, now), false);
  // precedence: latest effectiveFrom wins, not the highest version
  const v6later: RateCard = { ...v3, version: 6, effectiveFrom: '2026-12-10T00:00:00+05:00' };
  const v7earlier: RateCard = { ...v3, version: 7, effectiveFrom: '2026-12-05T00:00:00+05:00' };
  assert.equal(cardAt([v3, v6later, v7earlier], new Date('2026-12-11T00:00:00+05:00')).version, 6);
});
