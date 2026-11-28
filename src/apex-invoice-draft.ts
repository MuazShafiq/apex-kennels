import {LEGACY_RATE_VERSION, legacyRateTerms as legacyTerms} from './rate-card-legacy.ts';
import {fuelFor, rateTerms, transportFigures, type FuelPrice, type RateTerms} from './rate-card.ts';
import type { VerifiedPetrolRate } from './islamabad-petrol-rate.ts';
import { countBilledDays, type Quote, type QuoteLine } from './pricing.ts';

export type PricingSnapshot = {
  rateCardVersion: number;
  card: RateTerms;
  boarding: {dogs:number; dailyRate:number; billedDays:number; subtotal:number}[];
  packageDiscount: number;
  transport: (ReturnType<typeof transportFigures> & {km:number; fuel:FuelPrice; kmPerLitre:number; markupPct:number}) | null;
  total: number;
};

export function publishedFuelPrice(rate: VerifiedPetrolRate): FuelPrice {
  return {
    pkrPerLitre:rate.pricePkrPerLitre, source:'published', effective:rate.effectiveDate,
    checkedAt:rate.retrievedAt, note:'Pakistan national notified petrol rate, excluding Islamabad pump freight.',
  };
}

export type TransportProfitBasis = 'markup_on_fuel_cost' | 'gross_margin_on_sale';
export type TransportDraftInput = {
  requested: boolean;
  /** Total vehicle kilometres across all actual legs, including return trips. */
  totalDrivenKm?: number;
  /** Legacy input accepted for compatibility; Apex now mandates 20% markup on fuel cost. */
  profitBasis?: TransportProfitBasis;
  /** Server-fetched, timestamped national notified petrol baseline, not Form input. */
  fuelRate?: VerifiedPetrolRate;
  fixedFuel?: FuelPrice;
};
export type ApexDraftInput = {
  startDate: string;
  endDate: string;
  cage: 'normal' | 'camera';
  petCount: number;
  cameraPetCount?: number;
  /** Show free grooming only when it was requested or provided. */
  groomingRequested?: boolean;
  /** A full-month package is a 30 billed-day stay, explicitly selected by staff. */
  fullMonthPackageSelected: boolean;
  transport?: TransportDraftInput;
};

export type ApexDraftQuote = {
  status: 'DRAFT_REVIEW_ONLY';
  quote: Quote;
  /** Reviewer must resolve outstanding issues before issuing an invoice. */
  unresolved: string[];
  requiresStaffReview: true;
  sendAutomatically: false;
  rateVersion: string;
  pricingSnapshot?: PricingSnapshot;
  /** Frozen with the draft; never recalculate an issued invoice from a new rate. */
  fuelRateSnapshot?: VerifiedPetrolRate;
};

function safeMoney(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid PKR total');
  return value;
}

function validDistanceKm(km: number): boolean {
  return Number.isFinite(km) && km > 0 && km <= 1000;
}

/**
 * Computes a TRANSPORT DRAFT for known total kilometres driven. Only fuel cost
 * is considered; tolls, car wear, labour and deadheading outside the stated
 * route are not included. On 2026-11-09 Fatima confirmed 20% markup on
 * fuel cost. Final customer pricing still requires staff route/fuel review.
 */
export function transportFuelDraftPkr(totalDrivenKm: number, basis: TransportProfitBasis, petrolPkrPerLitre: number): number {
  if (!validDistanceKm(totalDrivenKm)) throw new Error('Total driven km must be >0 and <=1000');
  if (!Number.isFinite(petrolPkrPerLitre) || petrolPkrPerLitre<150 || petrolPkrPerLitre>1000) {
    throw new Error('A validated current petrol price is required');
  }
  if (basis !== 'markup_on_fuel_cost') {
    throw new Error('Apex transport uses 20% markup on fuel cost');
  }
  return safeMoney(transportFigures(legacyTerms,totalDrivenKm,petrolPkrPerLitre).charge);
}

export function buildApexInvoiceDraft(input: ApexDraftInput, card?: RateTerms): ApexDraftQuote {
  const terms=card??legacyTerms;
  if (!Number.isSafeInteger(input.petCount) || input.petCount < 1 || input.petCount > 100) {
    throw new Error('Pet count must be a supported positive integer');
  }
  if (input.cage !== 'normal' && input.cage !== 'camera') {
    throw new Error('Unsupported cage type');
  }
  const billedDays = countBilledDays(input.startDate, input.endDate, 'inclusive_days');
  const monthly = input.fullMonthPackageSelected;
  if(monthly && billedDays !== terms.packageDays)
    throw new Error('Full-month discount requires exactly 30 billed days');
  if(monthly&&terms.packageDiscount>=terms.packageDays*Math.min(terms.stdDaily,terms.cameraDaily))
    throw new Error('Package prices must remain above zero');
  const cameraCount=input.cameraPetCount??(input.cage==='camera'?input.petCount:0);
  if(!Number.isSafeInteger(cameraCount)||cameraCount<0||cameraCount>input.petCount)
    throw new Error('Invalid camera cage quantity');
  const lines:QuoteLine[]=[];
  const boarding:PricingSnapshot['boarding']=[];
  let transport:PricingSnapshot['transport']=null;
  const groups=[
    ['Standard boarding',input.petCount-cameraCount,terms.stdDaily],
    ['Camera cage boarding',cameraCount,terms.cameraDaily],
  ] as const;
  for(const [label,count,unitPricePkr] of groups){
    if(!count)continue;
    const quantity=count*billedDays;
    if(!Number.isSafeInteger(quantity))throw new Error('Boarding quantity overflow');
    const subtotal=safeMoney(quantity*unitPricePkr);
    lines.push({label,quantity,unitPricePkr,totalPkr:subtotal});
    boarding.push({dogs:count,dailyRate:unitPricePkr,billedDays,subtotal});
  }
  if (input.groomingRequested === true) {
    lines.push({label:'Grooming (complimentary)',quantity:input.petCount,unitPricePkr:0,totalPkr:0});
  }
  const unresolved:string[]=['Fatima must review and approve the final invoice'];
  if(monthly)unresolved.push('Monthly discount: verify the 30 billed days before approval');
  if (input.transport?.requested) {
    const km = input.transport.totalDrivenKm;
    const basis = input.transport.profitBasis ?? 'markup_on_fuel_cost';
    const rate = input.transport.fuelRate;
    if (km !== undefined && !validDistanceKm(km)) throw new Error('Invalid transport driven distance');
    if (basis !== 'markup_on_fuel_cost') {
      throw new Error('Apex transport uses 20% markup on fuel cost');
    }
    if (rate && (rate.product !== 'Motor Spirit (Petrol)' || rate.unit !== 'litre' ||
        rate.currency !== 'PKR' || rate.requiresStaffReview !== true ||
        rate.geographicBasis !== 'Pakistan national notified price; Islamabad pump freight excluded')) {
      throw new Error('Invalid fuel rate provenance');
    }
    const fixed = input.transport.fixedFuel;
    if (fixed) {
      if (!card || card.fuelMode!=='fixed' || rate || !Number.isFinite(Date.parse(fixed.checkedAt))
        || Date.parse(fixed.checkedAt)<Date.parse(card.effectiveFrom)) throw new Error('Invalid owner-fixed fuel evidence');
      const expected=fuelFor(card,new Date(fixed.checkedAt),null);
      if (fixed.source!==expected.source || fixed.pkrPerLitre!==expected.pkrPerLitre
        || fixed.note!==expected.note || fixed.effective!==expected.effective) throw new Error('Invalid owner-fixed fuel evidence');
    }
    if (rate && card?.fuelMode==='fixed') throw new Error('Owner-fixed fuel evidence required');
    const fuel = fixed ?? (rate ? publishedFuelPrice(rate) : undefined);
    if (fuel && (!Number.isFinite(fuel.pkrPerLitre) || fuel.pkrPerLitre < (fixed ? 100 : 150) || fuel.pkrPerLitre > 1000))
      throw new Error('A validated current petrol price is required');
    if (km !== undefined && fuel) {
      const chargeKm = card ? Math.round(km*10)/10 : km;
      const figures=transportFigures(terms,chargeKm,fuel.pkrPerLitre);
      const unitPrice=safeMoney(figures.charge);
      transport={km:chargeKm,fuel,kmPerLitre:terms.kmPerLitre,markupPct:terms.markupPct,...figures};
      lines.push({
        label:'Pet transport',
        quantity:1,unitPricePkr:unitPrice,totalPkr:unitPrice
      });
    } else {
      unresolved.push('Transport needs total driven distance and a fresh source-backed fuel rate');
    }
    if (card && fuel) unresolved.push(fuel.note);
    if (!card || card.fuelMode==='published') unresolved.push('National notified price excludes Islamabad pump freight; staff must verify local fuel price');
    unresolved.push('Transport uses provisional fuel cost + '+terms.markupPct+'% markup; Fatima reviews the final charge');
  }
  const subtotalPkr = safeMoney(lines.reduce((acc,line)=>acc+line.totalPkr,0));
  const discountPkr=monthly?safeMoney(terms.packageDiscount*input.petCount):0;
  const quote:Quote={
    startDate:input.startDate,endDate:input.endDate,billedDays,lines,subtotalPkr,
    discounts:monthly?[{source:'package',label:'30-day boarding discount',amountPkr:discountPkr}]:[],
    totalPkr:safeMoney(subtotalPkr-discountPkr),currency:'PKR'
  };
  return {
    rateVersion:card ? 'rate-card-v'+card.version : LEGACY_RATE_VERSION,
    ...(card ? {pricingSnapshot:{rateCardVersion:card.version,card:rateTerms(card),boarding,
      packageDiscount:discountPkr,transport,total:quote.totalPkr}} : {}),
    status:'DRAFT_REVIEW_ONLY',quote,unresolved,
    requiresStaffReview:true,sendAutomatically:false,
    ...(input.transport?.requested && lines.some(x=>x.label==='Pet transport') && input.transport.fuelRate
      ? {fuelRateSnapshot:{...input.transport.fuelRate}} : {})
  };
}
