import {Client, neon} from '@neondatabase/serverless';
import {
  cardAt, karachiDay, parseCardDraft, planPublish,
  type CardDraft, type PublishRequest, type RateCard,
} from './rate-card.ts';

const cardColumns = `
  version, effective_from::text AS "effectiveFrom", std_daily AS "stdDaily",
  camera_daily AS "cameraDaily", package_days AS "packageDays", package_discount AS "packageDiscount",
  km_per_litre::float8 AS "kmPerLitre", markup_pct AS "markupPct", freshness_hours AS "freshnessHours",
  fuel_mode AS "fuelMode", fixed_fuel_pkr::float8 AS "fixedFuelPkr", fixed_until::text AS "fixedUntil",
  fixed_reason AS "fixedReason", summary, created_by AS "createdBy", created_at::text AS "createdAt",
  withdrawn_at::text AS "withdrawnAt", withdrawn_by AS "withdrawnBy", replaced_by AS "replacedBy"`;

export async function readEffectiveRateCard(databaseUrl: string, at: string | null = null): Promise<RateCard | null> {
  const query = neon(databaseUrl);
  const rows = await query.query(
    `SELECT ${cardColumns} FROM public.rate_cards
     WHERE withdrawn_at IS NULL AND effective_from <= COALESCE($1::timestamptz, statement_timestamp())
     ORDER BY effective_from DESC, version DESC LIMIT 1`, [at],
  );
  return (rows[0] as RateCard | undefined) ?? null;
}

export class RateCardMutationError extends Error {
  readonly status: 409 | 422;
  readonly code: string;
  readonly fields?: Record<string, string>;

  constructor(status: 409 | 422, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

const countImpacts = `SELECT
  (SELECT count(*)::int FROM public.approved_invoices WHERE status='issued') AS issued,
  (SELECT count(*)::int FROM public.invoice_draft_reviews) AS saved,
  (SELECT count(*)::int FROM public.booking_requests b WHERE b.status IN ('requested', 'reviewing', 'approved')
    AND NOT EXISTS (SELECT 1 FROM public.invoice_draft_reviews d WHERE d.booking_id=b.id)
    AND NOT EXISTS (SELECT 1 FROM public.approved_invoices i WHERE i.booking_id=b.id)) AS open`;

export async function readBusinessSettings(databaseUrl: string) {
  const query = neon(databaseUrl);
  const [row] = await query.query(`SELECT statement_timestamp()::text AS now,
    (SELECT jsonb_agg(to_jsonb(cards) ORDER BY version DESC)
      FROM (SELECT ${cardColumns} FROM public.rate_cards) AS cards) AS cards,
    (SELECT to_jsonb(impact) FROM (${countImpacts}) AS impact) AS impact,
    (SELECT max(n) FROM (
      SELECT invoice_number::integer AS n FROM public.invoices WHERE invoice_number ~ '^[0-9]{4}$'
      UNION ALL SELECT invoice_number::integer FROM public.approved_invoices
      UNION ALL SELECT replacement_number::integer FROM public.invoice_corrections
    ) AS numbers) AS reserved_number`);
  const now = new Date(String(row.now));
  const cards = row.cards as RateCard[];
  return {
    now, current: cardAt(cards, now), cards, impact: row.impact as {issued:number; saved:number; open:number},
    highestReservedNumber: Number(row.reserved_number ?? 0),
  };
}

type QueryClient = {
  connect(): Promise<unknown>;
  end(): Promise<unknown>;
  query(sql: string, values?: unknown[]): Promise<{rows: Record<string, unknown>[]}>;
};
type ClientFactory = (url: string) => QueryClient;
const connect: ClientFactory = url => new Client(url);

async function withRateCardLock<T>(url: string, factory: ClientFactory, apply: (db: QueryClient) => Promise<T>): Promise<T> {
  const db = factory(url);
  await db.connect();
  try {
    await db.query('BEGIN ISOLATION LEVEL READ COMMITTED');
    try {
      await db.query("SELECT pg_advisory_xact_lock(hashtext('rate_cards'))");
      const result = await apply(db);
      await db.query('COMMIT');
      return result;
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  } finally {
    await db.end();
  }
}

function parsePublish(input: unknown): PublishRequest & {card: unknown} {
  const invalid = () => new RateCardMutationError(422, 'invalid_request', 'Check the publishing fields.');
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid();
  const data = input as Record<string, unknown>;
  const fields = ['expectedLatestVersion', 'effectiveFrom', 'replacesScheduledVersion', 'confirmed', 'card'];
  const validVersion = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0 && v <= 2147483647;
  if (Object.keys(data).some(key => !fields.includes(key))
    || !validVersion(data.expectedLatestVersion)
    || typeof data.effectiveFrom !== 'string'
    || ![undefined, true, false].includes(data.confirmed as boolean | undefined)
    || (data.replacesScheduledVersion !== undefined && !validVersion(data.replacesScheduledVersion))) throw invalid();
  return {
    expectedLatestVersion: data.expectedLatestVersion, effectiveFrom: data.effectiveFrom,
    replacesScheduledVersion: data.replacesScheduledVersion, confirmed: data.confirmed === true, card: data.card,
  };
}

async function audit(db: QueryClient, kind: string, actor: string, payload: object) {
  await db.query('INSERT INTO public.business_audit(kind, actor, payload) VALUES ($1, $2, $3::jsonb)',
    [kind, actor, JSON.stringify(payload)]);
}

async function withdraw(db: QueryClient, version: number, actor: string, replacedBy: number | null) {
  let changes;
  const inactive = () => new RateCardMutationError(409, 'already_effective', 'Only a scheduled card can be withdrawn.');
  try {
    changes = await db.query(
      `UPDATE public.rate_cards SET withdrawn_at=clock_timestamp(), withdrawn_by=$2, replaced_by=$3
       WHERE version=$1 AND withdrawn_at IS NULL AND effective_from > clock_timestamp()
       RETURNING effective_from::text`, [version, actor, replacedBy]);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P0011') throw inactive();
    throw error;
  }
  if (!changes.rows.length) throw inactive();
  await audit(db, 'rate_card.withdraw', actor, {version, effective_from: changes.rows[0].effective_from, replaced_by: replacedBy});
}

const settingLabels: Record<keyof CardDraft, string> = {
  stdDaily: 'Standard boarding', cameraDaily: 'Camera cage', packageDiscount: '30-day package discount',
  kmPerLitre: 'Fuel economy', markupPct: 'Markup on fuel cost', freshnessHours: 'Route and fuel freshness',
  fuelMode: 'Fuel price source', fixedFuelPkr: 'Fixed fuel price', fixedUntil: 'Fixed price end date', fixedReason: 'Fixed price reason',
};
const displayValue = (v: CardDraft[keyof CardDraft]) => typeof v === 'number' ? v.toLocaleString('en-US') : v ?? '—';

export async function publishRateCard(databaseUrl: string, actor: string, body: unknown, factory = connect) {
  const request = parsePublish(body);
  return withRateCardLock(databaseUrl, factory, async db => {
    const {rows} = await db.query(`SELECT ${cardColumns} FROM public.rate_cards`);
    const impacts = await db.query(countImpacts);
    const clock = await db.query('SELECT clock_timestamp()::text AS now');
    const now = new Date(String(clock.rows[0].now));
    const cards = rows as unknown as RateCard[];
    const plan = planPublish(cards, request, now);
    if (!plan.ok) throw new RateCardMutationError(plan.status, plan.code, plan.message);
    const draft = parseCardDraft(request.card, karachiDay(new Date(plan.effectiveFrom)));
    if (!draft.ok) throw new RateCardMutationError(422, 'invalid_card', 'Check the rate card fields.', draft.errors);

    const current = cardAt(cards, now);
    const card = draft.card;
    const changes = (Object.keys(settingLabels) as (keyof CardDraft)[])
      .filter(key => card[key] !== current[key])
      .map(key => [key, current[key], card[key]] as const);
    const summary = changes.map(([key, old, next]) =>
      settingLabels[key] + ' ' + displayValue(old) + ' → ' + displayValue(next)).join(' · ') || 'No rate changes';
    if (plan.withdraw !== null) await withdraw(db, plan.withdraw, actor, plan.version);

    const inserted = await db.query(`INSERT INTO public.rate_cards (
      version, effective_from, std_daily, camera_daily, package_discount, km_per_litre, markup_pct,
      freshness_hours, fuel_mode, fixed_fuel_pkr, fixed_until, fixed_reason, summary, created_by
    ) VALUES ($1, COALESCE($2::timestamptz, clock_timestamp()), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    RETURNING effective_from::text`, [
      plan.version, request.effectiveFrom === 'now' ? null : plan.effectiveFrom,
      card.stdDaily, card.cameraDaily, card.packageDiscount, card.kmPerLitre, card.markupPct,
      card.freshnessHours, card.fuelMode, card.fixedFuelPkr, card.fixedUntil, card.fixedReason, summary, actor,
    ]);
    const effectiveFrom = new Date(String(inserted.rows[0].effective_from)).toISOString();
    await audit(db, request.effectiveFrom === 'now' ? 'rate_card.publish' : 'rate_card.schedule', actor,
      {version: plan.version, effective_from: effectiveFrom, changes, impact: impacts.rows[0]});
    return {version: plan.version, effectiveFrom, summary, withdrew: plan.withdraw};
  });
}

export async function withdrawRateCard(databaseUrl: string, actor: string, version: number, factory = connect) {
  return withRateCardLock(databaseUrl, factory, async db => {
    await withdraw(db, version, actor, null);
    return {version};
  });
}
