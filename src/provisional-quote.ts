import type {IntakeRequest} from './intake.ts';
import {calculateQuote, type PriceConfig} from './pricing.ts';

/**
 * Evidence-based proposal ONLY, derived from four historical invoices.
 * This module is deliberately not connected to customer invoices, database
 * pricing versions, payment demands, or customer messaging.
 */
const HISTORICAL_CONFIG:PriceConfig={
  dayCountingRule:'inclusive_days',
  accommodation:{
    standard:{label:'Standard boarding (historical)',pricePerDayPkr:2500},
    camera:{label:'Camera cage boarding (historical)',pricePerDayPkr:3000}
  },
  allowPromoWithManualDiscount:false
};

export type PreliminaryDraft={
  provenance:'four_supplied_invoices_v0.1';
  status:'REVIEW_REQUIRED';
  rateTier:'standard'|'camera';
  billedDays:number;
  boardingRatePkr:number;
  boardingOnlySubtotalPkr:number;
  requiresTransportPricing:boolean;
  exclusions:string[];
};

/**
 * Returns boarding-only arithmetic for an already validated one-pet Form
 * submission. A requested pickup or drop-off remains unpriced.
 * An absence of the camera preference is a hard stop, not an assumed rate.
 */
export function preliminaryDraftFromForm(input:IntakeRequest):PreliminaryDraft{
  const selected=input.details?.cameraCageRequested;
  if(typeof selected!=='boolean') throw new Error('Camera cage preference not confirmed');
  const tier=selected?'camera':'standard';
  const quote=calculateQuote({
    startDate:input.startDate,
    endDate:input.endDate,
    accommodationType:tier,
    petCount:1
  },HISTORICAL_CONFIG);
  return {
    provenance:'four_supplied_invoices_v0.1',
    status:'REVIEW_REQUIRED',
    rateTier:tier,
    billedDays:quote.billedDays,
    boardingRatePkr:HISTORICAL_CONFIG.accommodation[tier].pricePerDayPkr,
    boardingOnlySubtotalPkr:quote.subtotalPkr,
    requiresTransportPricing:input.details?.pickupDropoffRequested===true,
    exclusions:[
      'owner rate and day-count approval pending',
      ...(input.details?.pickupDropoffRequested===true?['transport amount requires staff entry']:[]),
      'manual discounts and promotion rules not automatically inferred',
      'other services, special circumstances and payment recipient require staff approval'
    ]
  };
}
