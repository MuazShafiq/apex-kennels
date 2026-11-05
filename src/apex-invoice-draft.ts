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
  groomingPkr: 0,
  transportKmPerLitre: 12,
  transportDesiredProfitPercent: 20,
});

export type TransportProfitBasis = 'markup_on_fuel_cost' | 'gross_margin_on_sale';
export type TransportDraftInput = {
  requested: boolean;
  /** Total vehicle kilometres across all actual legs, including return trips. */
  totalDrivenKm?: number;
  /** Must be explicitly chosen by staff until Fatima clarifies "20% profit". */
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
  /** Staff-selected applicability; 28/30/31 days are NOT auto-classified. */
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
  rateVersion: 'fatima-confirmed-2026-11-05';
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
 * route are not included. This cannot be a final customer price until Fatima
 * confirms whether "20% profit" means markup or gross margin.
 */
export function transportFuelDraftPkr(totalDrivenKm: number, basis: TransportProfitBasis, petrolPkrPerLitre: number): number {
  if (!validDistanceKm(totalDrivenKm)) throw new Error('Total driven km must be >0 and <=1000');
  if (!Number.isFinite(petrolPkrPerLitre) || petrolPkrPerLitre<150 || petrolPkrPerLitre>1000) {
    throw new Error('A validated current petrol price is required');
  }
  if (basis !== 'markup_on_fuel_cost' && basis !== 'gross_margin_on_sale') {
    throw new Error('Choose a supported 20% profit calculation explicitly');
  }
  const fuelCost = totalDrivenKm / APEX_CONFIRMED_PRICING.transportKmPerLitre *
    petrolPkrPerLitre;
  const price = basis === 'markup_on_fuel_cost'
    ? fuelCost * 1.20
    : fuelCost / 0.80;
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
  if (input.fullMonthPackageSelected && input.cage !== 'normal') {
    throw new Error('No owner-approved camera-cage monthly price');
  }
  const monthly = input.fullMonthPackageSelected;
  const unitPricePkr = monthly ? APEX_CONFIRMED_PRICING.normalFullMonthPerDogPkr
    : input.cage === 'normal' ? APEX_CONFIRMED_PRICING.normalPerDayPkr
    : APEX_CONFIRMED_PRICING.cameraPerDayPkr;
  const quantity = input.petCount * (monthly ? 1 : billedDays);
  const boardingLine: QuoteLine = {
    label: monthly ? 'Normal cage - full month, per dog' :
      input.cage === 'camera' ? 'Camera cage boarding' : 'Normal cage boarding',
    quantity,
    unitPricePkr,
    totalPkr: safeMoney(quantity * unitPricePkr)
  };
  const lines: QuoteLine[] = [boardingLine];
  if (input.groomingRequested === true) {
    lines.push({label:'Grooming (complimentary)',quantity:input.petCount,unitPricePkr:0,totalPkr:0});
  }
  const unresolved: string[] = [
    'Fatima reviews and manually sends every customer-facing invoice',
    'Payment account and invoice layout must be approved',
  ];
  if (monthly) {
    unresolved.push('Staff must confirm this stay qualifies as one full month; do not infer from billed-day count');
  }
  if (input.transport?.requested) {
    const km = input.transport.totalDrivenKm;
    const basis = input.transport.profitBasis;
    const rate = input.transport.fuelRate;
    if (km !== undefined && !validDistanceKm(km)) throw new Error('Invalid transport driven distance');
    if (basis && basis !== 'markup_on_fuel_cost' && basis !== 'gross_margin_on_sale') {
      throw new Error('Unknown transport profit basis');
    }
    if (rate && (rate.product !== 'Motor Spirit (Petrol)' || rate.unit !== 'litre' ||
        rate.currency !== 'PKR' || rate.requiresStaffReview !== true ||
        rate.geographicBasis !== 'Pakistan national notified price; Islamabad pump freight excluded')) {
      throw new Error('Invalid fuel rate provenance');
    }
    if (km !== undefined && basis && rate) {
      const unitPrice = transportFuelDraftPkr(km,basis,rate.pricePkrPerLitre);
      lines.push({
        label:'Pet transport',
        quantity:1,unitPricePkr:unitPrice,totalPkr:unitPrice
      });
    } else {
      unresolved.push('Transport needs total driven distance, 20% profit basis and a fresh source-backed fuel rate');
    }
    unresolved.push('National notified price excludes Islamabad pump freight; staff must verify local fuel price');
    unresolved.push('Fatima must confirm transport route accounting, tolls and 20% markup versus margin');
  }
  const subtotalPkr = safeMoney(lines.reduce((acc,line)=>acc+line.totalPkr,0));
  const quote: Quote = {
    startDate:input.startDate,endDate:input.endDate,billedDays,lines,
    subtotalPkr,discounts:[],totalPkr:subtotalPkr,currency:'PKR'
  };
  return {
    rateVersion:'fatima-confirmed-2026-11-05',
    status:'DRAFT_REVIEW_ONLY',quote,unresolved,
    requiresStaffReview:true,sendAutomatically:false,
    ...(input.transport?.requested && lines.some(x=>x.label==='Pet transport') && input.transport.fuelRate
      ? {fuelRateSnapshot:{...input.transport.fuelRate}} : {})
  };
}
