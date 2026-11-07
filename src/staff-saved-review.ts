import {Client} from '@neondatabase/serverless';
import type {StaffDraftReview} from './staff-invoice-draft.ts';
import type {Quote} from './pricing.ts';
import {renderInvoiceHtml} from './invoice.ts';

export class DraftSaveError extends Error {
  readonly status:number;
  constructor(message:string,status=409){super(message);this.status=status;}
}
export type ReviewSnapshot={
  version:1;
  booking:{id:string;customerName:string;petNames:string;startDate:string;endDate:string};
  packageChoice:'daily'|'monthly';
  rateVersion:string;
  quote:Quote;
};
export type SavedReview={snapshot:ReviewSnapshot;revision:number;updatedBy:string;updatedAt:string};
export type SaveReviewResult={revision:number};
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

export function makeReviewSnapshot(review:StaffDraftReview):ReviewSnapshot {
  const source=review.booking;
  if(!review.draft||source.synthetic||source.transportRequested!==false||
     !['requested','reviewing','approved'].includes(source.status))
    throw new DraftSaveError('This booking needs staff review before saving an estimate');
  const quote=review.draft.quote;
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
      petNames:source.petNames,startDate:source.startDate,endDate:source.endDate},
    packageChoice:review.packageChoice,
    rateVersion:review.draft.rateVersion,
    quote:structuredClone(quote)
  };
}

export function validateSnapshot(snapshot:unknown):ReviewSnapshot {
  if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot))
    throw new DraftSaveError('Invalid saved draft',422);
  const value=snapshot as Partial<ReviewSnapshot>;
  if(value.version!==1||!value.booking||!UUID.test(value.booking.id)||
     typeof value.booking.customerName!=='string'||
     typeof value.booking.petNames!=='string'||
     !/^\d{4}-\d{2}-\d{2}$/.test(value.booking.startDate)||
     !/^\d{4}-\d{2}-\d{2}$/.test(value.booking.endDate)||
     !value.quote||!Array.isArray(value.quote.lines)||!Array.isArray(value.quote.discounts)||
     (value.packageChoice!=='daily'&&value.packageChoice!=='monthly'))
    throw new DraftSaveError('Invalid saved draft',422);
  return value as ReviewSnapshot;
}

/** Compare-and-swap prevents two staff browsers overwriting each other. */
export async function saveReviewDraft(databaseUrl:string,snapshot:ReviewSnapshot,
  expectedRevision:number,updatedBy:string):Promise<SaveReviewResult>{
  if(!UUID.test(snapshot.booking.id)||!Number.isSafeInteger(expectedRevision)||
     expectedRevision<0||expectedRevision>1_000_000||
     !/^[^@\s]{1,80}@[^@\s]{1,160}$/.test(updatedBy))
    throw new DraftSaveError('Invalid draft save request',400);
  const db=new Client(databaseUrl);
  await db.connect();
  try{
    const sql=expectedRevision===0
      ?'INSERT INTO public.invoice_draft_reviews '+
       '(booking_id,snapshot,revision,updated_by) VALUES ($1,$2::jsonb,1,$3) '+
       'ON CONFLICT (booking_id) DO NOTHING RETURNING revision'
      :'UPDATE public.invoice_draft_reviews SET snapshot=$2::jsonb, '+
       'revision=revision+1,updated_by=$3,updated_at=now() '+
       'WHERE booking_id=$1 AND revision=$4 RETURNING revision';
    const result=await db.query<{revision:number}>(sql,
      [snapshot.booking.id,JSON.stringify(snapshot),updatedBy,expectedRevision]);
    const row=result.rows[0];
    if(!row)throw new DraftSaveError('This estimate changed in another tab. Refresh and review it.',409);
    return {revision:Number(row.revision)};
  }finally{await db.end();}
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
    status:'DRAFT',reviewOnly:true
  },data.quote);
}
