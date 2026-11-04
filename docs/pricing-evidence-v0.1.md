# Apex boarding pricing: invoice-evidence model v0.1

**Status: proposed for draft quotes only. Not owner-approved and not live.** Derived from four supplied invoices, cross-checked against the current public Google Form. Historical adjustments are not universal policies.

## Historical source evidence (anonymized)

| Invoice | Stay | Billed days | Line items (PKR) | Discount (PKR) | Total (PKR) |
| --- | --- | ---: | --- | ---: | ---: |
| #2212 | Jul 3–8, 2026 | 6 | Standard boarding 6 × 2,500 = 15,000; grooming free | 0 | 15,000 |
| #2215 | Jul 23–29, 2026 | 7 | Standard boarding 7 × 2,500 = 17,500; grooming free | 0 | 17,500 |
| #2230 | Oct 22–Nov 8, 2026 | 18 | Camera cage 18 × 3,000 = 54,000; pickup/drop-off 2 × 4,000 = 8,000; grooming free | 2,000 | 60,000 |
| #2232 | Nov 1–30, 2026 | 30 | Standard boarding 30 × 2,500 = 75,000; grooming free | 10,000 | 65,000 |

Invoice #2230 subtotal 62,000 less 2,000; invoice #2232 subtotal 75,000 less 10,000.

The public Google Form advertises boarding **starting from PKR 2,500/day**, with a **24/7 CCTV option +PKR 500/day** and pickup/drop-off charges unspecified.

## Provisional rules for staff-reviewed draft quotes

1. **Standard boarding:** 2,500 PKR per billed day, per single pet. Multi-pet pricing unconfirmed.
2. **CCTV camera cage:** +500 PKR/day from baseline, equivalent to 3,000 PKR/day in the supplied camera-cage invoice.
3. **Billed days:** inclusive calendar dates: Jul 3–8 = 6, Jul 23–29 = 7, Oct 22–Nov 8 = 18, Nov 1–30 = 30. Time-of-day/grace-period exceptions unknown.
4. **Transport:** 4,000 PKR per leg in one historical example, **not** a confirmed universal rate. If transport is requested, the exact quote requires staff rate entry/confirmation unless Fatima approves this rate across all destinations.
5. **Grooming:** listed as free on all four supplied invoices. This does not prove a permanent inclusion.
6. **Discounts:** manual fixed amounts of 2,000 and 10,000 historically; no evidence of automatic long-stay thresholds, promo codes or discount stacking. Never infer a percentage from these examples.
7. **Training:** blank in all four invoices, so rates and eligibility are unknown.
8. **Payment recipient:** the provided examples use different recipient details; never hardcode a bank account from an old invoice.

## Existing engineering

The deterministic pricing engine in src/pricing.ts supports configurable inclusive/elapsed dates, accommodation tiers, extras, manual and promo discounts, fixed/percentage amounts and limits. Existing src/pricing.test.ts already tests **all four anonymized invoices** as historical regression fixtures. This evidence does not make the rules owner-approved. Never auto-send a payable invoice without approval.

## Minimum owner decisions

1. Are 2,500/day standard, +500/day camera cage and inclusive date counting still correct for future bookings? Any special rule for multiple pets or check-in times?
2. Is pickup/drop-off 4,000 PKR **each way for every destination**, or does it depend on distance/zone/route? If variable, leave price pending for staff.
3. Are discounts staff-discretionary until formal promotion rules exist? Is grooming always free and training optionally chargeable?
4. Which payment recipient/account is current, and must Fatima approve each invoice before it can be sent?

**Decision rule:** Infer the simple baseline from invoices; preserve uncertainty for exceptions; run quotes in DRAFT/REVIEW only until owner confirms.
