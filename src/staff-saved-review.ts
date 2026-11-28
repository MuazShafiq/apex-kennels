import type {PricingSnapshot} from './apex-invoice-draft.ts';
import type {InvoiceDb} from './invoice-approval-store.ts';
import {validateOwnerQuote,type OwnerOverride} from './owner-invoice-pricing.ts';
import {Client} from '@neondatabase/serverless';
import {isSyntheticBooking} from './synthetic-booking.ts';
import type {StaffDraftReview} from './staff-invoice-draft.ts';
import type {Quote} from './pricing.ts';
import {renderInvoiceHtml} from './invoice.ts';

export class DraftSaveError extends Error {
  readonly status:number;
  constructor(message:string,status=409){super(message);this.status=status;}
}
export type ReviewSnapshot={
  version:1;
  booking:{id:string;customerName:string;petNames:string;petBreeds?:string;startDate:string;endDate:string;synthetic:boolean};
  packageChoice:'daily'|'monthly';
  rateVersion:string;
  pricingSnapshot?:PricingSnapshot;
  quote:Quote;
  ownerOverride?:OwnerOverride;
  /** Immutable transport route + petrol evidence for priced transport drafts. */
  transport?:NonNullable<StaffDraftReview['transport']>;
  /** Exact selected service; older saved estimates must be refreshed for approval. */
  transportService?:'pickup'|'dropoff'|'both';
  transportLocationSource?:'customer_record'|'staff_confirmed';
};
export type SavedReview={snapshot:ReviewSnapshot;revision:number;updatedBy:string;updatedAt:string};
export type SaveReviewResult={revision:number};
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

export function makeReviewSnapshot(review:StaffDraftReview):ReviewSnapshot {
  const source=review.booking;
  if(!review.draft||
     !['requested','reviewing','approved'].includes(source.status))
    throw new DraftSaveError('This booking needs staff review before saving an estimate');
  const quote=review.draft.quote;
  const hasTransport=quote.lines.some(l=>l.label==='Pet transport'&&l.totalPkr>0);
  if(source.transportRequested===true?(!hasTransport||!review.transport):
     (hasTransport||!!review.transport))
    throw new DraftSaveError('A verified transport price is required before saving',409);
  if(!Number.isSafeInteger(quote.totalPkr)||quote.totalPkr<0||
     !Number.isSafeInteger(quote.subtotalPkr)||quote.subtotalPkr<0||
     !Number.isSafeInteger(quote.billedDays)||quote.billedDays<1||
     quote.discounts.some(d=>!Number.isSafeInteger(d.amountPkr)||d.amountPkr<0)||
     !quote.lines.length||quote.lines.some(l=>
       !Number.isSafeInteger(l.quantity)||l.quantity<1||
       !Number.isSafeInteger(l.unitPricePkr)||l.unitPricePkr<0||
       !Number.isSafeInteger(l.totalPkr)||l.totalPkr!==l.quantity*l.unitPricePkr))
    throw new DraftSaveError('Invoice totals must be verified before saving',422);
  const discount=quote.discounts.reduce((sum,x)=>sum+x.amountPkr,0);
  if(quote.subtotalPkr-discount!==quote.totalPkr||
     quote.lines.reduce((sum,x)=>sum+x.totalPkr,0)!==quote.subtotalPkr)
    throw new DraftSaveError('Invoice arithmetic failed validation',422);
  return {
    version:1,
    booking:{id:source.bookingId,customerName:source.customerName,
      petNames:source.petNames,petBreeds:source.petBreeds,startDate:source.startDate,endDate:source.endDate,
      synthetic:source.synthetic||isSyntheticBooking({customerName:source.customerName,petName:source.petNames})},
    packageChoice:review.packageChoice,
    rateVersion:review.draft.rateVersion,
    quote:structuredClone(quote),
    ...(review.draft.pricingSnapshot?{pricingSnapshot:structuredClone(review.draft.pricingSnapshot)}:{}),
    ...(review.transport?{transport:structuredClone(review.transport)}:{})
  };
}

export function validateSnapshot(snapshot:unknown):ReviewSnapshot {
  if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot))
    throw new DraftSaveError('Invalid saved draft',422);
  const value=snapshot as Partial<ReviewSnapshot>;
  if(value.version!==1||!value.booking||!UUID.test(value.booking.id)||
     typeof value.booking.customerName!=='string'||
     typeof value.booking.petNames!=='string'||
     typeof value.booking.synthetic!=='boolean'||
     !/^\d{4}-\d{2}-\d{2}$/.test(value.booking.startDate)||
     !/^\d{4}-\d{2}-\d{2}$/.test(value.booking.endDate)||
     !value.quote||!Array.isArray(value.quote.lines)||!Array.isArray(value.quote.discounts)||
     (value.packageChoice!=='daily'&&value.packageChoice!=='monthly'))
    throw new DraftSaveError('Invalid saved draft',422);
  if(value.ownerOverride){
    const o=value.ownerOverride;
    if(o.version!==1||!o.sourceQuote||!Array.isArray(o.history)||o.history.length>20||o.history.some(h=>!Number.isSafeInteger(h.revision)||h.revision<1||typeof h.actor!=='string'||h.actor.length>254||!Number.isFinite(Date.parse(h.at))||!['edit','reset','undo'].includes(h.action)||!Number.isSafeInteger(h.totalPkr)||h.totalPkr<0))throw new DraftSaveError('Invalid owner edit history',422);
    validateOwnerQuote(value.quote,o.sourceQuote);
    if(o.previousQuote)validateOwnerQuote(o.previousQuote,o.sourceQuote);
  }
  const priced=(value.ownerOverride?.sourceQuote??value.quote).lines.some(l=>l.label==='Pet transport'&&l.totalPkr>0);
  if(priced){
    const t=value.transport;
    if(!t||!t.route||t.route.status!=='ROUTE_REVIEW_REQUIRED'||
       !Number.isFinite(t.route.totalDrivenKm)||t.route.totalDrivenKm<=0||
       ![1,2].includes(t.route.plannedRoundTrips)||
       (t.fuelRate ? !Number.isFinite(t.fuelRate.pricePkrPerLitre) : value.pricingSnapshot?.transport?.fuel.source!=='fixed'))
      throw new DraftSaveError('Saved transport estimate lacks route or fuel evidence',422);
  }else if(value.transport)throw new DraftSaveError('Transport evidence without a priced line',422);
  // Preserve saved amounts and the original object; older false flags cannot
  // erase a synthetic marker when this snapshot is read for review/issuance.
  return {...value,booking:{...value.booking,synthetic:value.booking.synthetic||isSyntheticBooking({customerName:value.booking.customerName,petName:value.booking.petNames})}} as ReviewSnapshot;
}

export function savedReviewStatement(snapshot:ReviewSnapshot,expectedRevision:number,updatedBy:string):{
  sql:string;params:(string|number)[]
}{
  const json=JSON.stringify(snapshot);
  if(expectedRevision===0){
    return {
      sql:'INSERT INTO public.invoice_draft_reviews '+
        '(booking_id,snapshot,revision,updated_by) VALUES ($1,$2::jsonb,1,$3) '+
        'ON CONFLICT (booking_id) DO NOTHING RETURNING revision',
      params:[snapshot.booking.id,json,updatedBy]
    };
  }
  return {
    sql:'UPDATE public.invoice_draft_reviews SET snapshot=$2::jsonb, '+
      'revision=revision+1,updated_by=$3,updated_at=now() '+
      'WHERE booking_id=$1 AND revision=$4 RETURNING revision',
    params:[snapshot.booking.id,json,updatedBy,expectedRevision]
  };
}

/** Compare-and-swap prevents two staff browsers overwriting each other. */
export async function saveReviewDraft(databaseUrl:string,snapshot:ReviewSnapshot,
  expectedRevision:number,updatedBy:string,factory:(url:string)=>InvoiceDb=url=>new Client(url) as unknown as InvoiceDb):Promise<SaveReviewResult>{
  if(!UUID.test(snapshot.booking.id)||!Number.isSafeInteger(expectedRevision)||
     expectedRevision<0||expectedRevision>1_000_000||
     !/^[^@\s]{1,80}@[^@\s]{1,160}$/.test(updatedBy))
    throw new DraftSaveError('Invalid draft save request',400);
  const db=factory(databaseUrl);
  await db.connect();
  try{
    await db.query('BEGIN');
    if(snapshot.pricingSnapshot){
      await db.query("SELECT pg_advisory_xact_lock(hashtext('rate_cards'))");
      const current=await db.query(`SELECT version FROM public.rate_cards
        WHERE withdrawn_at IS NULL AND effective_from <= statement_timestamp()
        ORDER BY effective_from DESC, version DESC LIMIT 1`);
      if(Number(current.rows[0]?.version)!==snapshot.pricingSnapshot.rateCardVersion)
        throw new DraftSaveError('The effective rate card changed. Reload and review the new estimate.',409);
    }
    await db.query('SELECT pg_advisory_xact_lock(617340024)');
    await db.query('SELECT id FROM public.booking_requests WHERE id=$1 FOR UPDATE',[snapshot.booking.id]);
    if((await db.query('SELECT id FROM public.approved_invoices WHERE booking_id=$1',[snapshot.booking.id])).rows.length)throw new DraftSaveError('Approved invoices are frozen; use the correction procedure',409);
    const existing=await db.query('SELECT snapshot FROM public.invoice_draft_reviews WHERE booking_id=$1 FOR UPDATE',[snapshot.booking.id]);
    if(!snapshot.pricingSnapshot&&(existing.rows[0]?.snapshot as ReviewSnapshot|undefined)?.pricingSnapshot)
      throw new DraftSaveError('Rate cards must be available to replace this estimate.',503);
    if((existing.rows[0]?.snapshot as ReviewSnapshot|undefined)?.ownerOverride&&(existing.rows[0].snapshot as ReviewSnapshot).ownerOverride!.history?.at(-1)?.action!=='reset')throw new DraftSaveError('This invoice has owner edits. Reset it in owner review before replacing the calculation.',409);
    const priorOverride=(existing.rows[0]?.snapshot as ReviewSnapshot|undefined)?.ownerOverride as OwnerOverride|undefined;
    const refreshedSnapshot=priorOverride?{...snapshot,ownerOverride:{version:1 as const,sourceQuote:structuredClone(snapshot.quote),history:structuredClone(priorOverride.history)}}:snapshot;
    const statement=savedReviewStatement(refreshedSnapshot,expectedRevision,updatedBy);
    const result=await db.query(statement.sql,statement.params);
    const row=result.rows[0];
    if(!row)throw new DraftSaveError('This estimate changed in another tab. Refresh and review it.',409);
    await db.query('COMMIT');
    return {revision:Number(row.revision)};
  }catch(error){await db.query('ROLLBACK');throw error;}finally{await db.end();}
}

export async function loadSavedReview(databaseUrl:string,bookingId:string):Promise<SavedReview|null>{
  if(!UUID.test(bookingId))throw new DraftSaveError('Invalid booking id',400);
  const db=new Client(databaseUrl);
  await db.connect();
  try{
    const result=await db.query<{snapshot:unknown;revision:number;updated_by:string;updated_at:string}>(
      'SELECT snapshot,revision,updated_by,updated_at::text AS updated_at FROM public.invoice_draft_reviews WHERE booking_id=$1',
      [bookingId]
    );
    const row=result.rows[0];
    if(!row)return null;
    const snapshot=validateSnapshot(row.snapshot);
    if(snapshot.booking.id.toLowerCase()!==bookingId.toLowerCase())
      throw new DraftSaveError('Saved booking reference mismatch',422);
    return {snapshot,revision:Number(row.revision),updatedBy:row.updated_by,updatedAt:row.updated_at};
  }finally{await db.end();}
}

export function renderSavedReview(saved:SavedReview):string {
  const data=validateSnapshot(saved.snapshot);
  if(!Number.isSafeInteger(saved.revision)||saved.revision<1)
    throw new DraftSaveError('Invalid draft revision',422);
  return renderInvoiceHtml({
    number:'REVIEW-'+data.booking.id.slice(0,8).toUpperCase(),
    issuedOn:new Date().toISOString().slice(0,10),
    billedTo:data.booking.customerName,petName:data.booking.petNames,
    petBreed:data.booking.petBreeds,
    status:'DRAFT',reviewOnly:true,demo:data.booking.synthetic
  },data.quote);
}
