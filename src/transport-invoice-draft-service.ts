import {fuelFor, type RateTerms} from './rate-card.ts';
import {buildApexInvoiceDraft, type ApexDraftInput, type ApexDraftQuote} from './apex-invoice-draft.ts';
import {fetchCurrentIslamabadPetrolBaseline,type VerifiedPetrolRate,type PetrolRateResult} from './islamabad-petrol-rate.ts';

export type FuelDraftResult={
  draft:ApexDraftQuote;
  fuelLookup:'NOT_REQUIRED'|'CURRENT_NOTIFIED_RATE'|'OWNER_FIXED_RATE'|'MANUAL_REVIEW_REQUIRED';
  rate?:VerifiedPetrolRate;
};

/**
 * Call for every NEW draft quote. With requested transport, fetch a NEW price
 * from the publisher, then snapshot it with that draft. Without transport,
 * never make a fuel request. A failed/invalid/stale source does not silently
 * revert to PKR 400; it leaves the transport line unpriced for manual review.
 *
 * Caller must derive transport kilometres from a reviewed route. NEVER use
 * address string as a distance or trust customer-submitted monetary amounts.
 */
export async function buildApexDraftWithFreshFuel(
  input:ApexDraftInput,
  getPrice:()=>Promise<PetrolRateResult>=()=>fetchCurrentIslamabadPetrolBaseline(),
  card?:RateTerms, now = new Date()
):Promise<FuelDraftResult> {
  if(!input.transport?.requested) {
    return {draft:buildApexInvoiceDraft(input,card),fuelLookup:'NOT_REQUIRED'};
  }
  // Fail fast on invalid base inputs even if the external service is offline.
  buildApexInvoiceDraft(input,card);
  if(card?.fuelMode==='fixed'){
    let fixedFuel;
    try{fixedFuel=fuelFor(card,now,null);}
    catch(error){
      const draft=buildApexInvoiceDraft({...input,transport:{...input.transport,fixedFuel:undefined,fuelRate:undefined}},card);
      draft.unresolved.push(error instanceof Error?error.message:'Fixed fuel price is unavailable');
      return {draft,fuelLookup:'MANUAL_REVIEW_REQUIRED'};
    }
    return {
      draft:buildApexInvoiceDraft({...input,transport:{...input.transport,fixedFuel,fuelRate:undefined}},card),
      fuelLookup:'OWNER_FIXED_RATE',
    };
  }
  let price:PetrolRateResult;
  try {
    price=await getPrice();
  } catch {
    price={ok:false,reason:'UNAVAILABLE_OR_UNVERIFIED',detail:'Price service failed'};
  }
  if(!price.ok) {
    const draft=buildApexInvoiceDraft({...input,transport:{
      ...input.transport,fuelRate:undefined,
    }},card);
    draft.unresolved.push('Published petrol rate unavailable; transport cannot be calculated');
    return {draft,fuelLookup:'MANUAL_REVIEW_REQUIRED'};
  }
  const draft=buildApexInvoiceDraft({...input,transport:{
    ...input.transport,
    fuelRate:price.rate,
  }},card);
  return {draft,fuelLookup:'CURRENT_NOTIFIED_RATE',rate:price.rate};
}
