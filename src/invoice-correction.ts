import {Client} from '@neondatabase/serverless';
import {InvoiceApprovalError,INVOICE_UUID,requireInvoiceOwner,type ApprovalConfig} from './invoice-approval.ts';
import type {InvoiceDb} from './invoice-approval-store.ts';

export type InvoiceCorrection={kind:'cancel'|'replace';reason:string;replacementNumber?:string;replacementReference?:string;actor:string;createdAt:string};
export type CorrectionInput=Pick<InvoiceCorrection,'kind'|'reason'|'replacementNumber'|'replacementReference'>;
type Factory=(url:string)=>InvoiceDb;
const factory:Factory=url=>new Client(url) as unknown as InvoiceDb;
const text=(v:unknown):v is string=>typeof v==='string'&&v.trim().length>0&&v.length<=200&&!/[\x00-\x1f\x7f<>]/.test(v);
/** Every financial producer takes this lock before its invoice/outbox row locks. */
export async function lockUncorrectedInvoice(db:InvoiceDb,id:string):Promise<void>{
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,72))',[id]);
  if((await db.query('SELECT invoice_id FROM public.invoice_corrections WHERE invoice_id=$1',[id])).rows.length)
    throw new InvoiceApprovalError('Invoice has a recorded correction; further issuance and delivery are blocked',409);
}
function decode(row:Record<string,unknown>):InvoiceCorrection{
  return {kind:row.kind as InvoiceCorrection['kind'],reason:String(row.reason),actor:String(row.actor),createdAt:String(row.created_at),
    ...(row.replacement_number?{replacementNumber:String(row.replacement_number),replacementReference:String(row.replacement_reference)}:{})};
}
export async function loadInvoiceCorrection(url:string,id:string,makeDb:Factory=factory):Promise<InvoiceCorrection|null>{
  if(!INVOICE_UUID.test(id))throw new InvoiceApprovalError('Invalid invoice reference',400);
  const db=makeDb(url);await db.connect();try{
    const result=await db.query('SELECT *,created_at::text FROM public.invoice_corrections WHERE invoice_id=$1',[id]);
    return result.rows[0]?decode(result.rows[0]):null;
  }finally{await db.end();}
}
/** Records a cancellation or separately issued manual Canva replacement, never rewrites or sends a PDF. */
export async function recordInvoiceCorrection(url:string,id:string,actor:string,config:ApprovalConfig,input:CorrectionInput,makeDb:Factory=factory):Promise<void>{
  requireInvoiceOwner(actor,config);
  if(!INVOICE_UUID.test(id)||!input||!['cancel','replace'].includes(input.kind)||!text(input.reason)||
    (input.kind==='cancel'&&(input.replacementNumber!==undefined||input.replacementReference!==undefined))||
    (input.kind==='replace'&&(!/^\d{4}$/.test(input.replacementNumber??'')||!text(input.replacementReference))))
    throw new InvoiceApprovalError('Provide a correction reason and, for a manual replacement, its four-digit number and evidence reference',422);
  const db=makeDb(url);await db.connect();try{await db.query('BEGIN');try{
    // Same sequence lock as approval reserves manual replacement numbers too.
    await db.query('SELECT pg_advisory_xact_lock(617340024)');
    await lockUncorrectedInvoice(db,id);
    const invoice=(await db.query('SELECT status FROM public.approved_invoices WHERE id=$1 FOR UPDATE',[id])).rows[0];
    if(!invoice)throw new InvoiceApprovalError('Invoice not found',404);
    const delivery=(await db.query('SELECT state FROM public.invoice_delivery_outbox WHERE invoice_id=$1 FOR UPDATE',[id])).rows[0];
    if(delivery&&['sending','ambiguous'].includes(String(delivery.state)))throw new InvoiceApprovalError('Reconcile the in-flight delivery outcome before recording a correction',409);
    if(input.kind==='replace'){
      if(invoice.status!=='issued')throw new InvoiceApprovalError('Only an issued invoice can reference a manual replacement',409);
      if(!/^\d{4}$/.test(config.manualNumberFloor??'')||Number(input.replacementNumber)<=Number(config.manualNumberFloor))throw new InvoiceApprovalError('Replacement number must follow the verified manual sequence',422);
      const latest=await db.query("SELECT MAX(n::integer) AS last_number FROM (SELECT invoice_number AS n FROM public.approved_invoices UNION ALL SELECT invoice_number FROM public.invoices WHERE invoice_number ~ '^[0-9]{4}$' UNION ALL SELECT replacement_number FROM public.invoice_corrections WHERE replacement_number IS NOT NULL) reserved");
      if(Number(input.replacementNumber)<=Number(latest.rows[0]?.last_number??0))throw new InvoiceApprovalError('Replacement number must follow all reserved invoice numbers',409);
    }
    await db.query('INSERT INTO public.invoice_corrections(invoice_id,kind,reason,replacement_number,replacement_reference,actor) VALUES($1,$2,$3,$4,$5,$6)',[id,input.kind,input.reason.trim(),input.replacementNumber??null,input.replacementReference?.trim()??null,actor]);
    await db.query('COMMIT');
  }catch(e){await db.query('ROLLBACK');throw e;}}finally{await db.end();}
}
