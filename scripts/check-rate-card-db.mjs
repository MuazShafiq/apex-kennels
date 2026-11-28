/** Disposable loopback PostgreSQL proof. Uses the same optional pg driver as the invoice checks. */
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Client} from 'pg';
import {karachiDay} from '../src/rate-card.ts';
import {prepareStaffDraftReview} from '../src/staff-invoice-draft.ts';
import {makeReviewSnapshot,saveReviewDraft} from '../src/staff-saved-review.ts';
import {renderBrandedStaffPdf} from '../src/branded-invoice-pdf.ts';
import {publishRateCard, withdrawRateCard} from '../src/rate-card-store.ts';
import {handleStaffStudio, recordStudioExport} from '../src/staff-studio.ts';

const raw = process.env.APEX_RATE_TEST_POSTGRES_URL;
if (!raw) throw new Error('Explicit disposable loopback /postgres required');
const url = new URL(raw);
if (!['postgres:', 'postgresql:'].includes(url.protocol)
  || !['127.0.0.1','localhost','[::1]'].includes(url.hostname)
  || url.pathname !== '/postgres' || url.search || url.hash) throw new Error('Loopback /postgres only');
const database = 'apex_rate_test_' + randomUUID().replaceAll('-', '');
const factory = connectionString => new Client({connectionString});
const admin = factory(url.toString());
await admin.connect();
try { await admin.query('CREATE DATABASE ' + database + " WITH TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'"); } finally { await admin.end(); }
url.pathname = '/' + database;
const connection = url.toString();
const db = factory(connection);
await db.connect();

const actor = 'fixture-owner@example.test';
const card = {
  stdDaily: 2700, cameraDaily: 3200, packageDiscount: 10000, kmPerLitre: 12,
  markupPct: 25, freshnessHours: 24, fuelMode: 'published',
  fixedFuelPkr: null, fixedUntil: null, fixedReason: null,
};
const tomorrow = karachiDay(new Date(Date.now() + 864e5));
const publish = (expectedLatestVersion, effectiveFrom, extra = {}) =>
  publishRateCard(connection, actor, {expectedLatestVersion, effectiveFrom, confirmed:true, card, ...extra}, factory);
const effective = async at => (await db.query(`
  SELECT version FROM public.rate_cards WHERE withdrawn_at IS NULL AND effective_from <= $1
  ORDER BY effective_from DESC, version DESC LIMIT 1`, [at])).rows[0].version;

try {
  const files = ['schema.sql', ...[
    '003_invoice_draft_reviews', '004_invoice_approval', '011_rate_cards',
  ].map(name => 'migrations/' + name + '.sql')];
  for (const file of files) await db.query(await readFile(new URL('../db/' + file, import.meta.url), 'utf8'));
  const customer = randomUUID();
  const booking = randomUUID();
  const frozenBooking = randomUUID();
  await db.query('INSERT INTO public.customers(id,full_name,phone) VALUES ($1,$2,$3)',
    [customer,'SYNTHETIC Rate Card Fixture','0000000000']);
  for (const id of [booking,frozenBooking]) {
    await db.query("INSERT INTO public.booking_requests(id,customer_id,source,start_date,end_date) VALUES ($1,$2,'staff','2026-12-01','2026-12-03')",
      [id,customer]);
  }
  const example = {
    bookingId:booking,customerName:'SYNTHETIC Rate Card Fixture',petNames:'Fixture Dog',petCount:1,
    startDate:'2026-12-01',endDate:'2026-12-03',status:'requested',cameraCageRequested:false,transportRequested:false,synthetic:true,
  };
  const active = async () => {
    const {rows} = await db.query(`SELECT version, effective_from::text AS "effectiveFrom", package_days AS "packageDays",
      std_daily AS "stdDaily", camera_daily AS "cameraDaily", package_discount AS "packageDiscount",
      km_per_litre::float8 AS "kmPerLitre", markup_pct AS "markupPct", freshness_hours AS "freshnessHours",
      fuel_mode AS "fuelMode", fixed_fuel_pkr::float8 AS "fixedFuelPkr", fixed_until::text AS "fixedUntil", fixed_reason AS "fixedReason"
      FROM public.rate_cards WHERE withdrawn_at IS NULL AND effective_from <= statement_timestamp()
      ORDER BY effective_from DESC, version DESC LIMIT 1`);
    return rows[0];
  };
  const seed = await active();
  const review = makeReviewSnapshot(prepareStaffDraftReview(example,'daily',seed));
  await saveReviewDraft(connection,review,0,actor,factory);
  const frozen = makeReviewSnapshot(prepareStaffDraftReview({...example,bookingId:frozenBooking},'daily',seed));
  await saveReviewDraft(connection,frozen,0,actor,factory);
  // Exercise the actual approved-row freeze and stored artifact readback. The
  // fixture stores only a conspicuously nonpayable synthetic review PDF.
  const art = await readFile(new URL('../public/invoice/branded-artwork.pdf',import.meta.url));
  const pdf = Buffer.from(await renderBrandedStaffPdf(frozen,'2026-11-28',art));
  const hash = createHash('sha256').update(pdf).digest('hex');
  await db.query("INSERT INTO public.approved_invoices(booking_id,invoice_number,snapshot,status,issued_at,pdf_bytes,pdf_sha256) VALUES ($1,'0001',$2,'issued',clock_timestamp(),$3,$4)",
    [frozenBooking,JSON.stringify({review:frozen}),pdf,hash]);

  const next = await publish(3, tomorrow);
  assert.equal(next.version, 4);
  assert.equal(next.withdrew, null);
  assert.equal(await effective(new Date()), 3);
  assert.equal(await effective(next.effectiveFrom), 4);
  await assert.rejects(publish(4, 'now'), {code:'scheduled_card_pending', status:409});

  const replacement = await publish(4, 'now', {replacesScheduledVersion:4});
  assert.equal(replacement.withdrew, 4);
  assert.equal(await effective(next.effectiveFrom), 5);
  assert.deepEqual((await db.query('SELECT kind,payload FROM public.business_audit ORDER BY id')).rows.map(
    ({kind,payload}) => [kind, payload.version],
  ), [['rate_card.schedule',4],['rate_card.withdraw',4],['rate_card.publish',5]]);
  console.log('PASS scheduled precedence and atomic replacement/audit');
  const saved = async id => (await db.query(
    'SELECT revision, rate_card_version, pricing_snapshot, snapshot FROM public.invoice_draft_reviews WHERE booking_id=$1',[id])).rows[0];
  const unchanged = await saved(booking);
  assert.equal(unchanged.rate_card_version,3);
  assert.equal(unchanged.snapshot.quote.totalPkr,7500);
  const fresh = makeReviewSnapshot(prepareStaffDraftReview(example,'daily',await active()));
  assert.equal(fresh.quote.totalPkr,8100);
  await assert.rejects(saveReviewDraft(connection,review,1,actor,factory),{status:409});
  await saveReviewDraft(connection,fresh,1,actor,factory);
  const resaved = await saved(booking);
  assert.deepEqual([resaved.revision,resaved.rate_card_version,resaved.pricing_snapshot.total],[2,5,8100]);
  assert.deepEqual((await db.query('SELECT rate_card_version FROM public.invoice_rate_revisions WHERE booking_id=$1 ORDER BY revision',[booking])).rows,
    [{rate_card_version:3},{rate_card_version:5}]);
  const issued = (await db.query('SELECT rate_card_version,pricing_snapshot,pdf_bytes,pdf_sha256 FROM public.approved_invoices WHERE booking_id=$1',[frozenBooking])).rows[0];
  assert.deepEqual([issued.rate_card_version,issued.pricing_snapshot.total,issued.pdf_sha256],[3,7500,hash]);
  assert.deepEqual(issued.pdf_bytes,pdf);
  await assert.rejects(db.query('UPDATE public.approved_invoices SET rate_card_version=5 WHERE booking_id=$1',[frozenBooking]));
  console.log('PASS saved revision preservation, fresh re-save and byte-identical frozen PDF');



  const races = await Promise.allSettled([publish(5, 'now'), publish(5, 'now')]);
  const wins = races.filter(result => result.status === 'fulfilled');
  assert.equal(wins.length, 1);
  assert.equal(wins[0].value.version, 6);
  assert.equal(races.find(result => result.status === 'rejected').reason.code, 'stale');
  const pending = await publish(6, tomorrow);
  await withdrawRateCard(connection, actor, pending.version, factory);
  assert.equal(await effective(pending.effectiveFrom), 6);
  await assert.rejects(withdrawRateCard(connection, actor, 6, factory), {code:'already_effective', status:409});
  assert.equal((await publish(7, 'now')).version, 8);
  console.log('PASS concurrent publish, withdrawal cutoff and version retention');

  await assert.rejects(publish(8, tomorrow, {
    card:{...card, fuelMode:'fixed', fixedFuelPkr:350, fixedUntil:karachiDay(new Date()), fixedReason:'Fixture override'},
  }), {code:'invalid_card', status:422});
  const fixed = await publish(8, tomorrow, {
    card:{...card, fuelMode:'fixed', fixedFuelPkr:350.25, fixedUntil:tomorrow, fixedReason:'Fixture override'},
  });
  assert.equal(await effective(new Date()), 8);
  assert.equal(await effective(fixed.effectiveFrom), 9);
  assert.deepEqual((await db.query('SELECT fixed_fuel_pkr, fixed_until::text FROM public.rate_cards WHERE version=9')).rows,
    [{fixed_fuel_pkr:'350.25', fixed_until:tomorrow}]);
  const studioUrl = 'https://staff.example.test/staff/studio/audit';
  const fact = {
    rateCard:3, kind:'fact', format:'feed', width:1080, height:1350,
    colourway:'Raven + Powder', material:'None', paw:'none', consent:null, verified:null,
  };
  const studioActor = 'fixture-staff@example.test';
  const audit = body => handleStaffStudio(new Request(studioUrl, {
    method:'POST',
    headers:{origin:new URL(studioUrl).origin, 'content-type':'application/json', 'x-apex-studio':'export'},
    body:JSON.stringify({...body, actor:'client identity', caption:'private text', filename:'private.png'}),
  }), {DATABASE_URL:connection}, {email:studioActor}, {
    rates:async () => { throw new Error('Audit must use the rate card captured at export'); },
    record:(url, email, meta) => recordStudioExport(url, email, meta,
      async (statement, params) => (await db.query(statement, params)).rowCount > 0),
  });
  const note = {...fact, kind:'note', rateCard:null, consent:true, verified:true};
  assert.equal((await audit(fact)).status, 200, 'Previously effective card survives supersession');
  assert.equal((await audit(note)).status, 200);
  for (const unacceptedVersion of [4, fixed.version, 99]) {
    assert.equal((await audit({...fact, rateCard:unacceptedVersion})).status, 409);
  }
  assert.deepEqual((await db.query("SELECT actor, payload FROM public.business_audit WHERE kind='studio.export' ORDER BY id")).rows,
    [{actor:studioActor, payload:fact}, {actor:studioActor, payload:note}]);
  await assert.rejects(db.query("UPDATE public.business_audit SET payload='{}' WHERE kind='studio.export'"));
  console.log('PASS Studio audit persistence, privacy, immutable records and rate eligibility');

  await assert.rejects(db.query('UPDATE public.rate_cards SET std_daily=500 WHERE version=3'));
  await assert.rejects(db.query('TRUNCATE public.business_audit'));
  assert.deepEqual((await db.query(`SELECT relname,relrowsecurity FROM pg_class
    WHERE relname IN ('business_audit','invoice_rate_revisions','rate_cards') ORDER BY relname`)).rows,
    [{relname:'business_audit',relrowsecurity:true},{relname:'invoice_rate_revisions',relrowsecurity:true},{relname:'rate_cards',relrowsecurity:true}]);
  console.log('PASS fixed fuel, private tables and immutable history');
  console.log('Disposable loopback PostgreSQL database: ' + database);
} finally {
  await db.end();
}
