import {Client} from '@neondatabase/serverless';
import {createHash} from 'node:crypto';
import {InvoiceApprovalError,INVOICE_UUID,prepareApproval,requireInvoiceOwner,validateApprovalSnapshot,type ApprovalConfig,type ApprovalInput,type ApprovedInvoice} from './invoice-approval.ts';
import type {SavedReview} from './staff-saved-review.ts';

type Row={id:string;snapshot:unknown;status:'approved'|'issued';issued_at?:string;pdf_sha256?:string};
function decode(row:Row):ApprovedInvoice {
  return {id:row.id,snapshot:validateApprovalSnapshot(row.snapshot),status:row.status,...(row.issued_at?{issuedAt:row.issued_at}:{}),...(row.pdf_sha256?{pdfSha256:row.pdf_sha256}:{})};
}
const columns='id::text,snapshot,status,issued_at::text,pdf_sha256';
/** Injectable only for transaction tests; production always uses a fresh Neon client. */
export type InvoiceDb={connect():Promise<unknown>;end():Promise<unknown>;query(sql:string,params?:unknown[]):Promise<{rows:Record<string,unknown>[]}>};
type Factory=(url:string)=>InvoiceDb;
const connect:Factory=url=>new Client(url) as unknown as InvoiceDb;
async function transaction<T>(url:string,body:(db:InvoiceDb)=>Promise<T>,factory:Factory):Promise<T>{
  const db=factory(url);await db.connect();
  try{await db.query('BEGIN');try{const result=await body(db);await db.query('COMMIT');return result;}catch(error){await db.query('ROLLBACK');throw error;}}
  finally{await db.end();}
}
export async function approveInvoice(databaseUrl:string,input:ApprovalInput,actor:string,config:ApprovalConfig,factory:Factory=connect):Promise<ApprovedInvoice>{
  requireInvoiceOwner(actor,config);
  if(!INVOICE_UUID.test(input.bookingId))throw new InvoiceApprovalError('Invalid booking reference',400);
  try{return await transaction(databaseUrl,async db=>{
    // All invoice approvals serialize sequence allocation, including different bookings.
    await db.query("SELECT pg_advisory_xact_lock(617340024)");
    // Lock related source rows before reading the pricing inputs. Locking the
    // parent also serializes additions to its FK-backed pet/detail records.
    await db.query('SELECT id FROM public.booking_requests WHERE id=$1 FOR UPDATE',[input.bookingId]);
    await db.query('SELECT booking_id FROM public.booking_form_details WHERE booking_id=$1 FOR UPDATE',[input.bookingId]);
    await db.query('SELECT p.id FROM public.pets p JOIN public.booking_pets bp ON bp.pet_id=p.id WHERE bp.booking_id=$1 FOR UPDATE OF p,bp',[input.bookingId]);
    const current=await db.query("SELECT b.id,b.status,b.start_date::text,b.end_date::text,c.full_name,COALESCE(b.external_submission_id LIKE 'apex-cf-smoke-%',false) AS synthetic,"+
      'd.camera_cage_requested,d.pickup_dropoff_requested,'+
      '(SELECT COUNT(*)::integer FROM public.booking_pets bp WHERE bp.booking_id=b.id) AS pet_count,'+
      "COALESCE((SELECT STRING_AGG(p.name, ', ' ORDER BY p.name) FROM public.booking_pets bp JOIN public.pets p ON p.id=bp.pet_id WHERE bp.booking_id=b.id),'') AS pet_names "+
      'FROM public.booking_requests b JOIN public.customers c ON c.id=b.customer_id '+
      'LEFT JOIN public.booking_form_details d ON d.booking_id=b.id WHERE b.id=$1 FOR UPDATE OF b,c',[input.bookingId]);
    const source=current.rows[0];
    if(!source||!['requested','reviewing','approved'].includes(String(source.status)))throw new InvoiceApprovalError('Booking is no longer eligible for invoicing');
    const result=await db.query('SELECT snapshot,revision,updated_by,updated_at::text FROM public.invoice_draft_reviews WHERE booking_id=$1 FOR UPDATE',[input.bookingId]);
    const row=result.rows[0];if(!row)throw new InvoiceApprovalError('Save a reviewed estimate first');
    const saved:SavedReview={snapshot:row.snapshot as SavedReview['snapshot'],revision:Number(row.revision),updatedBy:String(row.updated_by),updatedAt:String(row.updated_at)};
    const snapshot=prepareApproval(saved,input,actor,config);
    const review=snapshot.review,boarding=review.quote.lines[0];
    const synthetic=source.synthetic===true||String(source.full_name).startsWith('APEX CANARY ')||String(source.pet_names).includes('APEX SYNTHETIC CANARY PET');
    if(source.start_date!==review.booking.startDate||source.end_date!==review.booking.endDate||source.full_name!==review.booking.customerName||source.pet_names!==review.booking.petNames||synthetic!==review.booking.synthetic||Number(source.pet_count)!==boarding.quantity/review.quote.billedDays||source.camera_cage_requested!==(boarding.label==='Camera cage boarding')||source.pickup_dropoff_requested!==!!review.transport)throw new InvoiceApprovalError('Booking details changed; save a fresh reviewed estimate');
    if(review.transport){
      let pin:Record<string,unknown>|undefined;
      try{
        const currentPin=await db.query('SELECT latitude,longitude,service,customer_confirmed,dropoff_latitude,dropoff_longitude FROM public.booking_transport_locations WHERE booking_id=$1 FOR UPDATE',[input.bookingId]);
        pin=currentPin.rows[0];
      }catch(error){
        if(error&&typeof error==='object'&&'code' in error&&error.code==='42P01')throw new InvoiceApprovalError('Confirmed current transport pins are required before approval');
        throw error;
      }
      const route=review.transport.route;
      const separate=pin?.dropoff_latitude!==null&&pin?.dropoff_latitude!==undefined;
      const dropoff=route.dropoffPin??route.customerPin;
      // Legacy Form requests have no customer-location row. The existing staff
      // pin/consent attestation remains usable, but its provenance is frozen;
      // adding a customer pin later requires a new reviewed snapshot.
      if(!pin){
        if(review.transportLocationSource!=='staff_confirmed')throw new InvoiceApprovalError('Transport gates or service changed; save a fresh reviewed estimate');
      }else if(review.transportLocationSource!=='customer_record'||pin.customer_confirmed!==true||pin.service!==review.transportService||
         (pin.service==='both'?2:1)!==route.plannedRoundTrips||
         Number(pin.latitude)!==route.customerPin.lat||Number(pin.longitude)!==route.customerPin.lon||
         (separate&&(pin.service!=='both'||Number(pin.dropoff_latitude)!==dropoff.lat||Number(pin.dropoff_longitude)!==dropoff.lon))||
         (!separate&&!!route.dropoffPin))throw new InvoiceApprovalError('Transport gates or service changed; save a fresh reviewed estimate');
    }
    const existing=await db.query('SELECT '+columns+' FROM public.approved_invoices WHERE booking_id=$1',[input.bookingId]);
    if(existing.rows[0]){
      const prior=decode(existing.rows[0] as Row);
      if(prior.snapshot.reviewRevision!==input.revision||prior.snapshot.invoiceNumber!==input.invoiceNumber||prior.snapshot.approvedBy!==actor)throw new InvoiceApprovalError('Booking already has an immutable invoice');
      return prior;
    }
    const used=await db.query("SELECT invoice_number FROM public.invoices WHERE invoice_number=$1 UNION ALL SELECT invoice_number FROM public.approved_invoices WHERE invoice_number=$1",[input.invoiceNumber]);
    if(used.rows.length)throw new InvoiceApprovalError('Invoice number is already reserved');
    const latest=await db.query("SELECT MAX(invoice_number::integer) AS last_number FROM (SELECT invoice_number FROM public.approved_invoices UNION ALL SELECT invoice_number FROM public.invoices WHERE invoice_number ~ '^[0-9]{4}$') AS reserved");
    if(Number(input.invoiceNumber)<=Number(latest.rows[0]?.last_number??0))throw new InvoiceApprovalError('Invoice number precedes a reserved number');
    const inserted=await db.query('INSERT INTO public.approved_invoices(booking_id,invoice_number,snapshot) VALUES($1,$2,$3::jsonb) RETURNING '+columns,[input.bookingId,input.invoiceNumber,JSON.stringify(snapshot)]);
    const invoice=decode(inserted.rows[0] as Row);
    await db.query("INSERT INTO public.invoice_approval_audit(invoice_id,action,actor) VALUES($1,'approved',$2)",[invoice.id,actor]);
    return invoice;
  },factory);}catch(error){if(error&&typeof error==='object'&&'code' in error&&error.code==='23505')throw new InvoiceApprovalError('Invoice number or booking was already reserved');throw error;}
}
export async function issueInvoice(databaseUrl:string,id:string,actor:string,config:ApprovalConfig,pdfBytes:Uint8Array,factory:Factory=connect):Promise<ApprovedInvoice>{
  requireInvoiceOwner(actor,config,true);
  if(!INVOICE_UUID.test(id)||pdfBytes.length<1000||pdfBytes.length>2_000_000||new TextDecoder().decode(pdfBytes.slice(0,5))!=='%PDF-')throw new InvoiceApprovalError('Invalid invoice PDF',422);
  const hash=createHash('sha256').update(pdfBytes).digest('hex');
  return transaction(databaseUrl,async db=>{
    const result=await db.query('SELECT '+columns+' FROM public.approved_invoices WHERE id=$1 FOR UPDATE',[id]);
    if(!result.rows[0])throw new InvoiceApprovalError('Invoice not found',404);
    const invoice=decode(result.rows[0] as Row);
    if(invoice.snapshot.review.booking.synthetic)throw new InvoiceApprovalError('Synthetic records cannot become payable invoices',422);
    if(invoice.snapshot.deliveryRequested&&config.deliveryEnabled!=='true')throw new InvoiceApprovalError('Customer WhatsApp sending is disabled',503);
    if(invoice.snapshot.approvedBy!==actor)throw new InvoiceApprovalError('Owner identity changed; manual review is required',403);
    if(invoice.status==='issued')return invoice; // Never overwrite bytes on a duplicate click.
    const updated=await db.query("UPDATE public.approved_invoices SET status='issued',issued_at=now(),pdf_bytes=$2,pdf_sha256=$3 WHERE id=$1 AND status='approved' RETURNING "+columns,[id,Buffer.from(pdfBytes),hash]);
    if(!updated.rows[0])throw new InvoiceApprovalError('Invoice state changed');
    await db.query("INSERT INTO public.invoice_approval_audit(invoice_id,action,actor) VALUES($1,'issued',$2)",[id,actor]);
    if(invoice.snapshot.deliveryRequested){
      const consent=invoice.snapshot.consent!;
      const queued=await db.query('INSERT INTO public.invoice_delivery_outbox(invoice_id,recipient,consent) VALUES($1,$2,$3::jsonb) ON CONFLICT(invoice_id) DO NOTHING RETURNING invoice_id',[id,consent.phone,JSON.stringify(consent)]);
      if(queued.rows.length)await db.query("INSERT INTO public.invoice_delivery_audit(invoice_id,action,actor) VALUES($1,'queued',$2)",[id,actor]);
    }
    return decode(updated.rows[0] as Row);
  },factory);
}
export async function loadApprovedInvoice(databaseUrl:string,id:string,factory:Factory=connect):Promise<ApprovedInvoice|null>{
  if(!INVOICE_UUID.test(id))throw new InvoiceApprovalError('Invalid invoice reference',400);
  const db=factory(databaseUrl);await db.connect();try{
    const result=await db.query('SELECT '+columns+' FROM public.approved_invoices WHERE id=$1 OR booking_id=$1',[id]);
    return result.rows[0]?decode(result.rows[0] as Row):null;
  }finally{await db.end();}
}
export async function loadIssuedInvoicePdf(databaseUrl:string,id:string,factory:Factory=connect):Promise<Uint8Array|null>{
  if(!INVOICE_UUID.test(id))throw new InvoiceApprovalError('Invalid invoice reference',400);
  const db=factory(databaseUrl);await db.connect();try{
    const result=await db.query("SELECT pdf_bytes,pdf_sha256 FROM public.approved_invoices WHERE id=$1 AND status='issued'",[id]);
    const row=result.rows[0];if(!row)return null;
    const bytes=new Uint8Array(row.pdf_bytes as Uint8Array);
    if(createHash('sha256').update(bytes).digest('hex')!==row.pdf_sha256)throw new InvoiceApprovalError('Stored invoice PDF integrity check failed',503);
    return bytes;
  }finally{await db.end();}
}
