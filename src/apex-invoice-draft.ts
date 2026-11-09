import type { VerifiedPetrolRate } from './islamabad-petrol-rate.ts';
import { countBilledDays, type Quote, type QuoteLine } from './pricing.ts';

/**
 * Apex Kennels rates confirmed directly by Fatima on 2026-11-05.
 * Only owner/staff-selected draft quotes are built here: no production writes,
 * approvals, payment demands, email or auto-sending.
 */
export const APEX_CONFIRMED_PRICING = Object.freeze({
  normalPerDayPkr: 2500,
  cameraPerDayPkr: 3000,
  normalFullMonthPerDogPkr: 65000,
  cameraFullMonthPerDogPkr: 80000,
  fullMonthDiscountPerDogPkr: 10000,
  fullMonthBilledDays: 30,
  groomingPkr: 0,
  transportKmPerLitre: 12,
  transportDesiredProfitPercent: 20,
});

export type TransportProfitBasis = 'markup_on_fuel_cost' | 'gross_margin_on_sale';
export type TransportDraftInput = {
  requested: boolean;
  /** Total vehicle kilometres across all actual legs, including return trips. */
  totalDrivenKm?: number;
  /** Legacy input accepted for compatibility; Apex now mandates 20% markup on fuel cost. */
  profitBasis?: TransportProfitBasis;
  /** Server-fetched, timestamped national notified petrol baseline, not Form input. */
  fuelRate?: VerifiedPetrolRate;
};
export type ApexDraftInput = {
  startDate: string;
  endDate: string;
  cage: 'normal' | 'camera';
  petCount: number;
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
  rateVersion: 'fatima-confirmed-2026-11-06';
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
  const fuelCost = totalDrivenKm / APEX_CONFIRMED_PRICING.transportKmPerLitre *
    petrolPkrPerLitre;
  const price = fuelCost * (1 + APEX_CONFIRMED_PRICING.transportDesiredProfitPercent / 100);
  // Never undercharge the selected fuel-profit target due to fractional rupees.
  return safeMoney(Math.ceil(price - 1e-9));
}

export function buildApexInvoiceDraft(input: ApexDraftInput): ApexDraftQuote {
  if (!Number.isSafeInteger(input.petCount) || input.petCount < 1 || input.petCount > 100) {
    throw new Error('Pet count must be a supported positive integer');
  }
  if (input.cage !== 'normal' && input.cage !== 'camera') {
    throw new Error('Unsupported cage type');
  }
  const billedDays = countBilledDays(input.startDate, input.endDate, 'inclusive_days');
  const monthly = input.fullMonthPackageSelected;
  if(monthly && billedDays !== APEX_CONFIRMED_PRICING.fullMonthBilledDays)
    throw new Error('Full-month discount requires exactly 30 billed days');
  const unitPricePkr=input.cage==='normal'
    ?APEX_CONFIRMED_PRICING.normalPerDayPkr:APEX_CONFIRMED_PRICING.cameraPerDayPkr;
  const quantity=input.petCount*billedDays;
  if(!Number.isSafeInteger(quantity))throw new Error('Boarding quantity overflow');
  const boardingLine:QuoteLine={
    label:input.cage==='camera'?'Camera cage boarding':'Standard boarding',
    quantity,unitPricePkr,totalPkr:safeMoney(quantity*unitPricePkr)
  };
  const lines: QuoteLine[] = [boardingLine];
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
    if (km !== undefined && rate) {
      const unitPrice = transportFuelDraftPkr(km,basis,rate.pricePkrPerLitre);
      lines.push({
        label:'Pet transport',
        quantity:1,unitPricePkr:unitPrice,totalPkr:unitPrice
      });
    } else {
      unresolved.push('Transport needs total driven distance and a fresh source-backed fuel rate');
    }
    unresolved.push('National notified price excludes Islamabad pump freight; staff must verify local fuel price');
    unresolved.push('Transport uses provisional fuel cost + 20% markup; Fatima reviews the final charge');
  }
  const subtotalPkr = safeMoney(lines.reduce((acc,line)=>acc+line.totalPkr,0));
  const discountPkr=monthly?safeMoney(APEX_CONFIRMED_PRICING.fullMonthDiscountPerDogPkr*input.petCount):0;
  const quote:Quote={
    startDate:input.startDate,endDate:input.endDate,billedDays,lines,subtotalPkr,
    discounts:monthly?[{source:'package',label:'30-day boarding discount',amountPkr:discountPkr}]:[],
    totalPkr:safeMoney(subtotalPkr-discountPkr),currency:'PKR'
  };
  return {
    rateVersion:'fatima-confirmed-2026-11-06',
    status:'DRAFT_REVIEW_ONLY',quote,unresolved,
    requiresStaffReview:true,sendAutomatically:false,
    ...(input.transport?.requested && lines.some(x=>x.label==='Pet transport') && input.transport.fuelRate
      ? {fuelRateSnapshot:{...input.transport.fuelRate}} : {})
  };
}
