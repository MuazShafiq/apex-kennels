import type { Quote } from './pricing.ts';

export type InvoiceView = {
  number: string;
  issuedOn: string;
  billedTo: string;
  petName: string;
  petBreed?: string;
  bankDetails?: { accountTitle: string; bankName: string; iban: string };
  status: 'DRAFT' | 'APPROVED' | 'SENT' | 'PAID';
};
const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c] ?? c));
const money = (value: number) => `PKR ${value.toLocaleString('en-PK')}`;
/** HTML is printable as PDF now and can be swapped to the Canva-based visual treatment later. */
export function renderInvoiceHtml(invoice: InvoiceView, quote: Quote): string {
  const lineRows = quote.lines.map(item => `<tr><td>${escapeHtml(item.label)}</td><td class="center">${item.quantity}</td><td class="right">${money(item.unitPricePkr)}</td><td class="right">${money(item.totalPkr)}</td></tr>`).join('');
  const discountRows = quote.discounts.map(d => `<div class="total-row"><span>Discount (${escapeHtml(d.label)})</span><strong>− ${money(d.amountPkr)}</strong></div>`).join('');
  const bank = invoice.bankDetails ? `<div class="payment"><div class="overline">PAYMENT DETAILS</div><p>${escapeHtml(invoice.bankDetails.bankName)}<br>${escapeHtml(invoice.bankDetails.accountTitle)}<br>${escapeHtml(invoice.bankDetails.iban)}</p></div>` : `<div class="payment"><div class="overline">PAYMENT DETAILS</div><p>To be confirmed by Apex Kennels.</p></div>`;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>Invoice ${escapeHtml(invoice.number)}</title><style>
  @page{size:A4;margin:0}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#17242d;margin:0;background:#fff}main{width:210mm;min-height:297mm;padding:24mm 19mm 20mm;position:relative}.top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #17242d;padding-bottom:27px}.brand{font-weight:800;font-size:25px;letter-spacing:1.9px}.tag{font-size:10px;letter-spacing:2px;color:#66717a;margin-top:8px}.invoice-title{font-size:31px;letter-spacing:1px;margin:0;text-align:right}.status{text-align:right;color:#927247;font-size:11px;margin-top:8px;font-weight:700;letter-spacing:1px}.details{display:flex;justify-content:space-between;margin:32px 0 36px;gap:15px}.overline{font-size:10px;font-weight:700;letter-spacing:1.8px;color:#79828a}.info{margin-top:10px;font-size:14px;line-height:1.7}.right{text-align:right}.center{text-align:center}table{border-collapse:collapse;width:100%;font-size:12px}th{padding:13px 11px;background:#17242d;color:white;font-weight:700;letter-spacing:.7px;font-size:10px;text-align:left}td{padding:14px 11px;border-bottom:1px solid #e7e9eb}.totals{margin:24px 0 0 auto;width:47%}.total-row{display:flex;justify-content:space-between;padding:8px 0;font-size:13px}.total-row.grand{margin-top:12px;border-top:2px solid #17242d;padding-top:17px;font-size:21px;font-weight:800}.payment{margin-top:70px;border-top:1px solid #e7e9eb;padding-top:20px;font-size:12px;line-height:1.8}.footer{position:absolute;left:19mm;right:19mm;bottom:19mm;text-align:center;font-size:11px;color:#6a747b}
  </style></head><body><main>
  <header class="top"><div><div class="brand">APEX KENNELS</div><div class="tag">BOARDING & PET CARE</div></div><div><h1 class="invoice-title">INVOICE</h1><div class="status">${escapeHtml(invoice.status)}</div></div></header>
  <section class="details"><div><div class="overline">BILLED TO</div><div class="info">${escapeHtml(invoice.billedTo)}<br>Pet: ${escapeHtml(invoice.petName)}${invoice.petBreed ? `<br>Breed: ${escapeHtml(invoice.petBreed)}` : ''}</div></div><div class="right"><div class="overline">INVOICE DETAILS</div><div class="info"># ${escapeHtml(invoice.number)}<br>${escapeHtml(invoice.issuedOn)}<br>${escapeHtml(quote.startDate)} to ${escapeHtml(quote.endDate)}<br>${quote.billedDays} billable days</div></div></section>
  <table><thead><tr><th>SERVICE</th><th class="center">QTY</th><th class="right">RATE</th><th class="right">AMOUNT</th></tr></thead><tbody>${lineRows}</tbody></table>
  <section class="totals"><div class="total-row"><span>Subtotal</span><strong>${money(quote.subtotalPkr)}</strong></div>${discountRows}<div class="total-row grand"><span>Total</span><span>${money(quote.totalPkr)}</span></div></section>
  ${bank}<div class="footer">Thank you for choosing Apex Kennels.</div>
  </main></body></html>`;
}
