import type { Quote } from './pricing.ts';

export type InvoiceView = {
  number: string;
  issuedOn: string;
  billedTo: string;
  petName: string;
  petBreed?: string;
  bankDetails?: { accountTitle: string; bankName: string; iban: string };
  status: 'DRAFT' | 'APPROVED' | 'SENT' | 'PAID';
  /** Show a prominent permanent synthetic watermark for preview-only invoices. */
  demo?: boolean;
  /** Internal owner-review copy. Never present as a payment demand. */
  reviewOnly?: boolean;
};
const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c] ?? c));
const money = (value: number) => `PKR ${value.toLocaleString('en-PK')}`;
/** HTML is printable as PDF now and can be swapped to the Canva-based visual treatment later. */
/**
 * Clean, customer-safe A4 invoice. Source rates, maps, petrol, approvals,
 * medical notes and internal workflow details stay outside the customer PDF.
 * DRAFT output is internal-only by construction; no shipping integration.
 */
export function renderInvoiceHtml(invoice: InvoiceView, quote: Quote): string {
  if(invoice.status==='DRAFT' && !invoice.reviewOnly && !invoice.demo) {
    throw new Error('A draft invoice must be explicitly marked internal-only');
  }
  const lineRows=quote.lines.map(line=>
    '<tr><td class="service">'+escapeHtml(line.label)+'</td>'
    +'<td class="num">'+line.quantity+'</td>'
    +'<td class="amount">'+money(line.unitPricePkr)+'</td>'
    +'<td class="amount">'+money(line.totalPkr)+'</td></tr>'
  ).join('');
  const discountRows=quote.discounts.map(d=>
    '<div class="sumline"><span>Discount ('+escapeHtml(d.label)+')</span>'
    +'<span>− '+money(d.amountPkr)+'</span></div>'
  ).join('');
  // No unapproved bank info or "to be confirmed" placeholders on a customer invoice.
  const payment=invoice.bankDetails
    ? '<section class="payment"><h2>Payment details</h2><p>'
       + escapeHtml(invoice.bankDetails.bankName)+'<br>'
       + escapeHtml(invoice.bankDetails.accountTitle)+'<br>'
       + escapeHtml(invoice.bankDetails.iban)+'</p></section>'
    : '';
  const note=invoice.reviewOnly || invoice.demo
    ? '<div class="review-banner">'
      +(invoice.demo?'SYNTHETIC EXAMPLE · ':'')
      +'INTERNAL PREVIEW · NOT FOR CUSTOMER DELIVERY</div>'
    : '';
  // Only actual PAID invoices carry a payment-status label; APPROVED and SENT
  // are staff workflow statuses and are never exposed on the document.
  const paid=invoice.status==='PAID'?' <span class="paid">PAID</span>':'';
  const fmtDate=(raw:string)=>{
    if(!/^\d{4}-\d{2}-\d{2}$/.test(raw))return escapeHtml(raw);
    const date=new Date(raw+'T12:00:00Z');
    if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==raw)return escapeHtml(raw);
    return escapeHtml(new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(date));
  };
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">'
    +'<meta name="viewport" content="width=device-width,initial-scale=1">'
    +'<meta name="robots" content="noindex,nofollow"><title>Invoice '
    +escapeHtml(invoice.number)+'</title><style>'
    +'@page{size:A4;margin:0}*{box-sizing:border-box}html,body{margin:0}'
    +'body{font-family:Inter,Arial,Helvetica,sans-serif;background:#edf0ed;color:#1e302b;-webkit-print-color-adjust:exact;print-color-adjust:exact}'
    +'.sheet{width:210mm;min-height:297mm;margin:22px auto;background:#fff;padding:22mm 19mm 20mm;box-shadow:0 12px 40px #19261f15}'
    +'.review-banner{border:1px solid #b3a37e;background:#f8f5ec;padding:11px 14px;font-size:10px;font-weight:700;letter-spacing:.06em;text-align:center;margin-bottom:24px;color:#6d5b3e}'
    +'.top{display:flex;align-items:start;justify-content:space-between;gap:24px;padding-bottom:27px;border-bottom:1px solid #dbe1dc}'
    +'.brand{font-weight:800;letter-spacing:.12em;font-size:20px;color:#182f29}'
    +'.subtitle{font-size:9px;text-transform:uppercase;letter-spacing:.22em;color:#7a8b83;margin-top:7px}'
    +'h1{font-size:29px;letter-spacing:-.05em;font-weight:600;margin:0;text-align:right}'
    +'.invoice-no{margin-top:9px;text-align:right;font-size:12px;color:#61736a}.paid{font-size:10px;color:#286647;font-weight:700;letter-spacing:.1em}'
    +'.intro{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin:36px 0 36px}'
    +'.label{font-size:10px;font-weight:700;letter-spacing:.13em;text-transform:uppercase;color:#85948b}'
    +'.value{font-size:13px;line-height:1.75;margin-top:10px}.align-right{text-align:right}'
    +'table{width:100%;border-collapse:collapse;font-size:12px}th{border-bottom:1px solid #becbc1;padding:13px 10px;text-align:left;color:#6a7d70;font-weight:700;font-size:10px;letter-spacing:.08em;text-transform:uppercase}'
    +'td{border-bottom:1px solid #edf0ec;padding:17px 10px;color:#26382e}.service{font-weight:600}.num{text-align:center}.amount{text-align:right;white-space:nowrap}'
    +'.totals{width:48%;min-width:230px;margin:28px 0 0 auto}.sumline{display:flex;justify-content:space-between;gap:16px;color:#53675c;padding:8px 0;font-size:12px}'
    +'.grand{border-top:1px solid #afc0b3;margin-top:14px;padding-top:18px;display:flex;justify-content:space-between;gap:16px;align-items:center}'
    +'.grand span:first-child{font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-weight:700}'
    +'.grand span:last-child{font-size:22px;letter-spacing:-.04em;font-weight:700;white-space:nowrap}'
    +'.payment{margin-top:46px;border-top:1px solid #edf0ec;padding-top:20px}.payment h2{font-size:11px;letter-spacing:.1em;text-transform:uppercase;margin:0}'
    +'.payment p{font-size:12px;color:#4c5e54;line-height:1.9;margin:12px 0 0}'
    +'.footer{margin-top:80px;padding-top:16px;border-top:1px solid #edf0ec;color:#7d8b82;font-size:10px}'
    +'@media print{body{background:#fff}.sheet{margin:0;box-shadow:none;page-break-after:auto}}'
    +'@media screen and (max-width:800px){.sheet{width:100%;min-height:100vh;margin:0;padding:34px 20px}.intro{gap:20px}.totals{width:100%}}'
    +'</style></head><body><main class="sheet">'+note
    +'<header class="top"><div><div class="brand">APEX KENNELS</div><div class="subtitle">Boarding &amp; pet care</div></div>'
    +'<div><h1>Invoice'+paid+'</h1><div class="invoice-no"># '+escapeHtml(invoice.number)+'</div></div></header>'
    +'<section class="intro"><div><div class="label">Billed to</div><div class="value">'
    +escapeHtml(invoice.billedTo)+'<br>Pet: '+escapeHtml(invoice.petName)
    +(invoice.petBreed?'<br>Breed: '+escapeHtml(invoice.petBreed):'')+'</div></div>'
    +'<div class="align-right"><div class="label">Invoice date</div><div class="value">'+fmtDate(invoice.issuedOn)
    +'</div><div class="label" style="margin-top:16px">Boarding period</div><div class="value">'
    +fmtDate(quote.startDate)+' – '+fmtDate(quote.endDate)+'</div></div></section>'
    +'<table><thead><tr><th>Service</th><th class="num">Qty</th><th class="amount">Rate</th>'
    +'<th class="amount">Amount</th></tr></thead><tbody>'+lineRows+'</tbody></table>'
    +'<section class="totals"><div class="sumline"><span>Subtotal</span><span>'+money(quote.subtotalPkr)
    +'</span></div>'+discountRows+'<div class="grand"><span>Total</span><span>'
    +money(quote.totalPkr)+'</span></div></section>'+payment
    +'<div class="footer">Thank you for trusting Apex Kennels with your pet.</div>'
    +'</main></body></html>';
}
