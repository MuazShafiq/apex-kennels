import type { Quote, QuoteLine } from './pricing.ts';

export type InvoiceView = {
  number: string;
  issuedOn: string;
  billedTo: string;
  petName: string;
  petBreed?: string;
  /** Supplied server-side from approved payment settings, never hardcoded in HTML. */
  bankDetails?: { accountTitle: string; bankName: string; iban: string; accountNumber?: string };
  status: 'DRAFT' | 'APPROVED' | 'SENT' | 'PAID';
  demo?: boolean;
  reviewOnly?: boolean;
};

const esc=(s:string)=>String(s).replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]??c));
const money=(n:number)=>'PKR '+n.toLocaleString('en-PK');
const digits=(n:number)=>n.toLocaleString('en-PK');
const date=(raw:string)=>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(raw))return esc(raw);
  const d=new Date(raw+'T12:00:00Z');
  if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==raw)return esc(raw);
  return esc(new Intl.DateTimeFormat('en-GB',{
    day:'numeric',month:'long',year:'numeric',timeZone:'UTC'
  }).format(d));
};
const shortDate=(raw:string)=>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(raw))return esc(raw);
  const d=new Date(raw+'T12:00:00Z');
  if(!Number.isFinite(d.getTime()))return esc(raw);
  const day=d.getUTCDate(),suffix=day%10===1&&day!==11?'st':
    day%10===2&&day!==12?'nd':day%10===3&&day!==13?'rd':'th';
  return day+'<sup>'+suffix+'</sup>';
};
const period=(from:string,to:string)=>{
  if(from.slice(0,7)===to.slice(0,7)){
    const month=new Date(from+'T12:00:00Z').toLocaleString('en-GB',{
      month:'long',timeZone:'UTC'
    });
    return shortDate(from)+' - '+shortDate(to)+' '+esc(month);
  }
  return date(from)+' - '+date(to);
};

/**
 * Approximate inline silhouette for stand-alone/print-safe SVG.
 * The original customer invoice uses Apex's actual dog mark; replace this
 * vector with the authorized logo asset once available, without changing layout.
 */
const dogLogo='<svg viewBox="0 0 180 132" role="img" aria-label="Dog silhouette" '+
  'xmlns="http://www.w3.org/2000/svg">'+
  '<path fill="#444b9a" d="M29 101c3-9 12-13 16-22 6-12 7-27 18-35 6-5 14-6 23-8l8-13 1-13 10 9 6-13 4 17 16 2c7 1 12 4 14 10l-9 6-11 1c-10 9-10 16-8 25 3 14 11 19 24 21l27-12c-9 17-25 27-39 27-9-1-18-5-28-13l-8-12-10 16-4 22 16 4 1 6-24 0-5-17-7-15-12 16-8 18 9 4-1 7-23 0 5-19 2-18-13 19-13 1 1-7 8-5z"/>'+
  '<path fill="#444b9a" d="M15 119h139v6H15z"/></svg>';
const zeroRow=(label:string,value:string)=>'<tr><td>'+esc(label)+'</td><td class="qty">'+
  value+'</td><td class="num">'+value+'</td><td class="num">'+value+'</td></tr>';

function invoiceLine(line:QuoteLine,days:number):string {
  let label=line.label;
  if(/^Standard boarding$/i.test(label))label='Boarding';
  else if(/^Camera cage boarding$/i.test(label))label='Boarding - camera cage';
  else if(/^Pet transport/i.test(label))label='Pick-up & Drop-off';
  const quantity=(/board/i.test(label)&&days>0&&line.quantity%days===0)
    ? days+' days'+(line.quantity>days?' × '+(line.quantity/days)+' dogs':'')
    :String(line.quantity);
  return '<tr><td>'+esc(label)+'</td><td class="qty">'+esc(quantity)+'</td>'+
    '<td class="num" aria-label="'+esc(money(line.unitPricePkr))+'">'+digits(line.unitPricePkr)+'</td>'+
    '<td class="num" aria-label="'+esc(money(line.totalPkr))+'">'+digits(line.totalPkr)+'</td></tr>';
}

/**
 * Matches the established Apex invoice structure and palette from the owner's
 * 2026 PDF examples. All user-sourced text is escaped. Drafts cannot become
 * customer payment demands. This is printable A4 HTML, NOT a generated PDF.
 */
export function renderInvoiceHtml(invoice:InvoiceView,quote:Quote):string {
  if(invoice.status==='DRAFT'&&!invoice.reviewOnly&&!invoice.demo)
    throw new Error('A draft invoice must be explicitly marked internal-only');
  if(invoice.demo&&invoice.bankDetails)
    throw new Error('Synthetic invoice cannot carry payable bank details');
  if(invoice.reviewOnly&&invoice.bankDetails)
    throw new Error('Internal review must not contain payment instructions');
  const notes=invoice.reviewOnly||invoice.demo
    ?'<div class="review-banner">'+(invoice.demo?'SYNTHETIC EXAMPLE · ':'')+
      'INTERNAL PREVIEW · NOT FOR CUSTOMER DELIVERY</div>'
    :'';
  const rows:string[]=[];
  let hasGrooming=false,hasTransport=false,hasTraining=false;
  for(const line of quote.lines){
    if(/groom/i.test(line.label))hasGrooming=true;
    if(/transport|pick.up|drop.off/i.test(line.label))hasTransport=true;
    if(/training/i.test(line.label))hasTraining=true;
    rows.push(invoiceLine(line,quote.billedDays));
  }
  // Fatima's invoices always show these four service categories, including
  // free grooming and absent services. These rows don't affect quote totals.
  if(!hasGrooming)rows.push(zeroRow('Grooming','free'));
  if(!hasTraining)rows.push(zeroRow('Training','-'));
  if(!hasTransport)rows.push(zeroRow('Pick-up & Drop-off','-'));
  const discount=quote.discounts.reduce((s,d)=>s+d.amountPkr,0);
  const discountName=quote.discounts.map(d=>d.label).join(', ');
  const payment=invoice.bankDetails
    ?'<section class="payment"><h2>Payment Details :</h2>'+
      '<p>Account Title : '+esc(invoice.bankDetails.accountTitle)+'</p>'+
      (invoice.bankDetails.accountNumber
        ?'<p>Account Number : '+esc(invoice.bankDetails.accountNumber)+'</p>':'')+
      '<p>IBAN Number :<br>'+esc(invoice.bankDetails.iban)+'</p>'+
      '<p>Bank Name : '+esc(invoice.bankDetails.bankName)+'</p></section>'
    :'<section class="payment"></section>';
  const discountRow=discount>0
    ?'<div class="total-row"><b>DISCOUNT'+(discountName
      ?'<small>'+esc(discountName)+'</small>':'')+'</b>'+
      '<span aria-label="'+esc(money(discount))+'">'+digits(discount)+'</span></div>'
    :'';
  const paid=invoice.status==='PAID'?' <span class="paid">PAID</span>':'';
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">'+
    '<meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<meta name="robots" content="noindex,nofollow">'+
    '<title>Apex Kennels | Invoice '+esc(invoice.number)+'</title>'+
    '<style>'+
    '@page{size:A4;margin:0}*{box-sizing:border-box}html,body{margin:0}'+
    'body{font-family:Arial,Helvetica,sans-serif;color:#191919;background:#e9edf0;-webkit-print-color-adjust:exact;print-color-adjust:exact}'+
    '.paper{width:210mm;min-height:297mm;margin:10mm auto;background:white;display:flex;flex-direction:column;box-shadow:0 8px 28px #0002}'+
    '.masthead{height:58mm;flex:0 0 58mm;background:#def3fc;display:flex;flex-direction:column;justify-content:center;align-items:center;color:#414a97}'+
    '.masthead svg{width:38mm;height:31mm;display:block}.wordmark{font-size:18px;font-weight:800;letter-spacing:-.035em;margin-top:-3mm}'+
    '.content{padding:17mm 19mm 13mm;flex:1;display:flex;flex-direction:column}'+
    '.review-banner{font-size:10px;text-align:center;border:1px solid #9297b4;background:#f3f3fa;color:#414a97;padding:7px;margin:-8mm 0 8mm;font-weight:800;letter-spacing:.03em}'+
    '.identity{display:grid;grid-template-columns:1.2fr .9fr .62fr;column-gap:7mm;min-height:36mm}'+
    '.identity h1{font-size:28px;font-weight:800;letter-spacing:-.035em;margin:0 0 11px}'+
    '.identity p{font-size:10px;line-height:1.4;margin:0}'+
    '.field{margin-bottom:9px;overflow-wrap:anywhere}.field b{display:block;font-size:11px;color:#414a97;font-weight:800;margin-bottom:2px}.field span{display:block;font-size:11px;font-weight:700}'+
    '.items{margin-top:13mm;width:100%;border-collapse:collapse;table-layout:fixed;font-size:11px}'+
    '.items thead{background:#def3fc;color:#414a97}'+
    '.items th{padding:13px 9px;border:1px solid #d3e6f0;text-align:left;font-weight:800;font-size:11px}'+
    '.items th:nth-child(1){width:51%}.items th:nth-child(2){width:14%}.items th:nth-child(3){width:17%}.items th:nth-child(4){width:18%}'+
    '.items td{padding:13px 9px;border-bottom:1px solid #abc9dc;vertical-align:top}'+
    '.items .qty,.items .num{text-align:center}.items td.num:last-child{text-align:right}'+
    '.items sup{font-size:8px}'+
    '.closing{margin-top:auto;padding-top:20mm;display:grid;grid-template-columns:1.25fr .8fr;gap:10mm;align-items:start}'+
    '.payment{font-size:10px;line-height:1.3}.payment h2{font-size:11px;color:#414a97;margin:0 0 15px}'+
    '.payment p{margin:2px 0;overflow-wrap:anywhere}'+
    '.totals{border:1px solid #b2d1e5;font-size:11px}'+
    '.total-row{display:grid;grid-template-columns:1.15fr .85fr;min-height:12mm;border-bottom:1px solid #b2d1e5}'+
    '.total-row:last-child{border-bottom:0}'+
    '.total-row b{background:#def3fc;border-right:1px solid #b2d1e5;color:#414a97;padding:12px 8px;font-size:10px;display:flex;flex-direction:column;justify-content:center}'+
    '.total-row small{font-size:8px;font-weight:400;margin-top:3px;line-height:1.3}'+
    '.total-row span{display:flex;align-items:center;justify-content:flex-end;padding:11px 8px}'+
    '.total-row.grand b{text-align:center;font-size:11px}.total-row.grand span{font-weight:800;font-size:13px}'+
    '.paid{font-size:12px;color:#414a97}'+
    '.footer{min-height:18mm;background:#def3fc;display:flex;align-items:center;justify-content:center;text-align:center;padding:6px 12px;color:#414a97;font-size:15px;font-weight:800;font-style:italic}'+
    '@media print{body{background:white}.paper{margin:0;box-shadow:none;break-after:avoid}.content{min-height:0}}'+
    '@media screen and (max-width:700px){.paper{width:100%;margin:0;min-height:100vh}.identity{grid-template-columns:1fr 1fr;row-gap:15px}.identity h1{font-size:24px}.content{padding:25px 18px}.items th,.items td{padding:10px 5px;font-size:10px}.closing{grid-template-columns:1fr;gap:20px}}'+
    '</style></head><body><main class="paper">'+
    '<header class="masthead">'+dogLogo+'<div class="wordmark">APEX KENNELS</div></header>'+
    '<section class="content">'+notes+
    '<div class="identity"><div><h1>INVOICE'+paid+'</h1>'+
    '<p>Number # '+esc(invoice.number)+'</p><p>Date : '+date(invoice.issuedOn)+'</p></div>'+
    '<div><div class="field"><b>Billed To:</b><span>'+esc(invoice.billedTo)+'</span></div>'+
    '<div class="field"><b>Boarding Time:</b><span>'+period(quote.startDate,quote.endDate)+'</span></div></div>'+
    '<div><div class="field"><b>Pet name:</b><span>'+esc(invoice.petName)+'</span></div>'+
    (invoice.petBreed?'<div class="field"><b>Breed:</b><span>'+esc(invoice.petBreed)+'</span></div>':'')+'</div></div>'+
    '<table class="items"><thead><tr><th>SERVICES</th><th>QTY</th><th>PRICE</th><th>AMOUNT</th></tr></thead>'+
    '<tbody>'+rows.join('')+'</tbody></table>'+
    '<div class="closing">'+payment+'<section class="totals">'+
    '<div class="total-row"><b>SUB TOTAL</b><span aria-label="'+esc(money(quote.subtotalPkr))+'">'+digits(quote.subtotalPkr)+'</span></div>'+
    discountRow+
    '<div class="total-row grand"><b>TOTAL</b><span aria-label="'+esc(money(quote.totalPkr))+'">'+digits(quote.totalPkr)+'</span></div>'+
    '</section></div></section>'+
    '<footer class="footer">Your Furry Friend Thanks You for Their Dream Vacation!</footer>'+
    '</main></body></html>';
}
