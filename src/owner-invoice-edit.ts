import {Client} from '@neondatabase/serverless';
import {InvoiceApprovalError,INVOICE_UUID,requireInvoiceOwner,validateApprovalPricing,type ApprovalConfig} from './invoice-approval.ts';
import {calculateOwnerQuote,validateOwnerQuote,type OwnerOverride} from './owner-invoice-pricing.ts';
import type {SavedReview} from './staff-saved-review.ts';
import type {InvoiceDb} from './invoice-approval-store.ts';

/** Source is always the locked saved calculation, never submitted by a browser. */
export function prepareOwnerEdit(saved:SavedReview,rows:unknown,action:'edit'|'reset'|'undo',actor:string,now=new Date()):SavedReview['snapshot'] {
  const current=validateApprovalPricing(saved.snapshot),source=current.ownerOverride?.sourceQuote??current.quote;
  const quote=action==='reset'?structuredClone(source):action==='undo'?
    (current.ownerOverride?.previousQuote?structuredClone(current.ownerOverride.previousQuote):(()=>{throw new InvoiceApprovalError('There is no saved edit to undo');})()):calculateOwnerQuote(source,rows);
  // Reset retains package discount provenance; edited rows are explicitly manual.
  if(action!=='reset')validateOwnerQuote(quote,source);
  const ownerOverride:OwnerOverride={version:1,sourceQuote:structuredClone(source),previousQuote:structuredClone(current.quote),history:[...(current.ownerOverride?.history??[]),{revision:saved.revision+1,actor,at:now.toISOString(),action,totalPkr:quote.totalPkr}].slice(-20)};
  return {...current,quote,ownerOverride};
}
export async function saveOwnerInvoiceEdit(databaseUrl:string,id:string,revision:number,rows:unknown,action:'edit'|'reset'|'undo',actor:string,config:ApprovalConfig,factory:(url:string)=>InvoiceDb=url=>new Client(url) as unknown as InvoiceDb):Promise<{revision:number}> {
  requireInvoiceOwner(actor,config);
  if(!INVOICE_UUID.test(id)||!Number.isSafeInteger(revision)||revision<1||revision>=1_000_000||!['edit','reset','undo'].includes(action))throw new InvoiceApprovalError('Invalid owner edit request',400);
  const db=factory(databaseUrl);await db.connect();
  try{await db.query('BEGIN');try{
    // Same ordering as approval serializes edits with approval across bookings.
    await db.query('SELECT pg_advisory_xact_lock(617340024)');
    await db.query('SELECT id FROM public.booking_requests WHERE id=$1 FOR UPDATE',[id]);
    if((await db.query('SELECT id FROM public.approved_invoices WHERE booking_id=$1',[id])).rows.length)throw new InvoiceApprovalError('Approved invoices are frozen; use the correction procedure',409);
    const result=await db.query('SELECT snapshot,revision,updated_by,updated_at::text FROM public.invoice_draft_reviews WHERE booking_id=$1 FOR UPDATE',[id]);
    const row=result.rows[0];if(!row||Number(row.revision)!==revision)throw new InvoiceApprovalError('This estimate changed in another tab. Reload before editing.',409);
    const saved={snapshot:row.snapshot as SavedReview['snapshot'],revision,updatedBy:String(row.updated_by),updatedAt:String(row.updated_at)};
    const snapshot=prepareOwnerEdit(saved,rows,action,actor);
    const update=await db.query('UPDATE public.invoice_draft_reviews SET snapshot=$2::jsonb,revision=revision+1,updated_by=$3,updated_at=now() WHERE booking_id=$1 AND revision=$4 RETURNING revision',[id,JSON.stringify(snapshot),actor,revision]);
    if(!update.rows.length)throw new InvoiceApprovalError('Draft revision changed',409);
    await db.query('COMMIT');return {revision:Number(update.rows[0].revision)};
  }catch(e){await db.query('ROLLBACK');throw e;}}finally{await db.end();}
}
