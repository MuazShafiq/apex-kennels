import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { calculateQuote, type PriceConfig, type Promotion } from './pricing.ts';
import { renderInvoiceHtml } from './invoice.ts';

// Synthetic demonstration. These are NOT Apex prices or live customer records.
const config: PriceConfig = {
  dayCountingRule: 'inclusive_days', // illustrative only; Fatima to confirm
  accommodation: { example: { label: 'Example boarding', pricePerDayPkr: 3000 } },
  allowPromoWithManualDiscount: false,
};
const promotions: Promotion[] = [{code:'DEMO10',discount:{kind:'percent',basisPoints:1000},active:true,usageCount:0}];
const quote = calculateQuote({
  startDate:'2026-11-10', endDate:'2026-11-12', accommodationType:'example', petCount:1,
  extras:[{label:'Example pickup service',quantity:1,unitPricePkr:2000}], promoCode:'DEMO10',
}, config, promotions, '2026-11-03');
const html = renderInvoiceHtml({number:'DEMO-001',issuedOn:'2026-11-03',billedTo:'Sample Customer',petName:'Sample Pet',status:'DRAFT'},quote);
const path = join(dirname(fileURLToPath(import.meta.url)), '../output');
mkdirSync(path,{recursive:true});
writeFileSync(join(path,'sample-invoice.html'),html,'utf8');
writeFileSync(join(path,'sample-quote.json'),JSON.stringify(quote,null,2),'utf8');
console.log(`Demo only: ${quote.billedDays} billed days, subtotal ${quote.subtotalPkr}, total ${quote.totalPkr} PKR. Files in output/.`);
