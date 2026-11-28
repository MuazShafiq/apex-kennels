/** Frozen rates for pre-versioned reviews and the homepage before rate-card cutover. */
export const LEGACY_RATE_VERSION = 'fatima-confirmed-2026-11-06';
export const legacyRateTerms = Object.freeze({
  stdDaily: 2500, cameraDaily: 3000, packageDiscount: 10000,
  packageDays: 30, kmPerLitre: 12, markupPct: 20,
} as const);

export const legacyPublicRates = {
  stdDaily:legacyRateTerms.stdDaily, cameraDaily:legacyRateTerms.cameraDaily,
  packageDays:legacyRateTerms.packageDays, packageDiscount:legacyRateTerms.packageDiscount,
};
