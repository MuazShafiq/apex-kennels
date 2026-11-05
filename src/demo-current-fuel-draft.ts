import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildApexDraftWithFreshFuel} from './transport-invoice-draft-service.ts';
import {renderInvoiceHtml} from './invoice.ts';
import {FUEL_SOURCE} from './islamabad-petrol-rate.ts';

/** Local proof only: entirely synthetic data, no Cloudflare, Neon or Form. */
const result=await buildApexDraftWithFreshFuel({
  startDate:'2026-12-01',endDate:'2026-12-03',
  cage:'normal',petCount:1,fullMonthPackageSelected:false,
  transport:{requested:true,totalDrivenKm:24,profitBasis:'markup_on_fuel_cost'}
});
const outputDir=join(dirname(fileURLToPath(import.meta.url)),'../output');
mkdirSync(outputDir,{recursive:true});
const html=renderInvoiceHtml({
  number:'SYNTHETIC-FUEL-DRAFT',
  issuedOn:new Date().toISOString().slice(0,10),
  billedTo:'SYNTHETIC SAMPLE CUSTOMER',
  petName:'SYNTHETIC SAMPLE DOG',
  status:'DRAFT',reviewOnly:true,demo:true,
},result.draft.quote);
writeFileSync(join(outputDir,'apex-current-fuel-draft.html'),html,'utf8');
writeFileSync(join(outputDir,'apex-current-fuel-draft.json'),JSON.stringify({
  ...result,attribution:FUEL_SOURCE.attribution,
  important:'National OGRA-notified baseline; Islamabad pump freight is not included. No actual customer invoice created.'
},null,2),'utf8');
console.log('Synthetic review-only draft generated. No live customer booking, payment or email.');
console.log('Fuel lookup:',result.fuelLookup);
if(result.rate){
  console.log('Petrol baseline:',result.rate.pricePkrPerLitre,'PKR/L; effective',result.rate.effectiveDate);
  console.log('Source:',result.rate.sourceUrl);
} else {
  console.log('Transport remains UNPRICED; manual rate confirmation required.');
}
console.log('Review output/apex-current-fuel-draft.html and .json. Never send as payable.');
