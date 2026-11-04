import {calculateQuote} from './pricing.ts';
import {renderInvoiceHtml} from './invoice.ts';

/** Strictly synthetic billing preview. Does not read Neon or configured production pricing. */
export function syntheticInvoiceHtml():string {
  const quote=calculateQuote({
    startDate:'2026-12-10',endDate:'2026-12-12',accommodationType:'illustrative',
    petCount:1
  },{
    dayCountingRule:'inclusive_days',allowPromoWithManualDiscount:false,
    accommodation:{illustrative:{label:'Boarding (example only)',pricePerDayPkr:2500}}
  });
  return renderInvoiceHtml({
    number:'DEMO-0001',issuedOn:'2026-11-04',billedTo:'Sample Owner',
    petName:'Sample Pet',petBreed:'Sample breed',status:'DRAFT',demo:true
  },quote);
}
