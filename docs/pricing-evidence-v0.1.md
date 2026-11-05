# Apex boarding pricing: original invoice evidence v0.1 (historical)

**SUPERSEDED FOR CURRENT OWNER DECISIONS by [Fatima's November 5 confirmations](approved-invoice-rules-2026-11-05.md).** This document preserves the original invoice analysis and its older outstanding questions for audit/history only. Current policy now includes PKR 65,000 per full month **per dog**, grooming always free, distance-based transport with owner-supplied vehicle/fuel assumptions, and manual invoice sending. No automatic payable invoices.

**Historical context:** Fatima replied 'Haan best hai' to Muaz's discussion of the four-invoice evidence table and explicitly stated **PKR 2,500/day normal cage**, **PKR 3,000/day camera cage** and **monthly invoice PKR 65,000**. At this earlier evidence stage, it was unclear whether PKR 65,000 was a monthly package or one-off discount. Fatima resolved this ambiguity on November 5 by confirming a standard monthly PKR 65,000 rate **per dog**. Do not promote historical transport/grooming examples into global policies.

## Historical source evidence (anonymized)

| Invoice | Stay | Billed days | Line items (PKR) | Discount (PKR) | Total (PKR) |
| --- | --- | ---: | --- | ---: | ---: |
| #2212 | Jul 3–8, 2026 | 6 | Standard boarding 6 × 2,500 = 15,000; grooming free | 0 | 15,000 |
| #2215 | Jul 23–29, 2026 | 7 | Standard boarding 7 × 2,500 = 17,500; grooming free | 0 | 17,500 |
| #2230 | Oct 22–Nov 8, 2026 | 18 | Camera cage 18 × 3,000 = 54,000; pickup/drop-off 2 × 4,000 = 8,000; grooming free | 2,000 | 60,000 |
| #2232 | Nov 1–30, 2026 | 30 | Standard boarding 30 × 2,500 = 75,000; grooming free | 10,000 | 65,000 |

Invoice #2230 subtotal 62,000 less 2,000; invoice #2232 subtotal 75,000 less 10,000.

The public Google Form advertises boarding **starting from PKR 2,500/day**, with a **24/7 CCTV option +PKR 500/day** and pickup/drop-off charges unspecified.

## Confirmed rates and provisional rules for staff-reviewed draft quotes

1. **Standard boarding (Fatima-confirmed):** 2,500 PKR per day for a normal cage. Multi-pet pricing unconfirmed.
2. **Camera cage (Fatima-confirmed):** 3,000 PKR per day, corresponding to +500 PKR/day relative to normal.
3. **Billed days:** inclusive calendar dates: Jul 3–8 = 6, Jul 23–29 = 7, Oct 22–Nov 8 = 18, Nov 1–30 = 30. Time-of-day/grace-period exceptions unknown.
4. **Transport:** 4,000 PKR per leg in one historical example, **not** a confirmed universal rate. If transport is requested, the exact quote requires staff rate entry/confirmation unless Fatima approves this rate across all destinations.
5. **Grooming:** listed as free on all four supplied invoices. This does not prove a permanent inclusion.
6. **Discounts:** manual fixed amounts of 2,000 and 10,000 historically; no evidence of automatic long-stay thresholds, promo codes or discount stacking. Never infer a percentage from these examples.
7. **Training:** blank in all four invoices, so rates and eligibility are unknown.
8. **Payment recipient:** the provided examples use different recipient details; never hardcode a bank account from an old invoice.

## Existing engineering

The deterministic pricing engine in src/pricing.ts supports configurable inclusive/elapsed dates, accommodation tiers, extras, manual and promo discounts, fixed/percentage amounts and limits. Existing src/pricing.test.ts already tests **all four anonymized invoices** as historical regression fixtures. The daily cage rates are owner-confirmed; other policy details, including whether PKR 65,000 is a standard monthly package, are not. Never auto-send a payable invoice without approval.

## Minimum owner decisions

1. **Monthly amount:** Is PKR 65,000 a fixed 30-day normal-cage package, or was it a one-off PKR 10,000 reduction from 30 × 2,500 = 75,000? Also confirm inclusive day counting and any check-in-time/multi-pet exceptions.
2. Is pickup/drop-off 4,000 PKR **each way for every destination**, or does it depend on distance/zone/route? If variable, leave price pending for staff.
3. Are other discounts staff-discretionary until formal promotion rules exist? Is grooming always free and training optionally chargeable?
4. Which payment recipient/account is current, and must Fatima approve each invoice before it can be sent?

**Decision rule:** Infer the simple baseline from invoices; preserve uncertainty for exceptions; run quotes in DRAFT/REVIEW only until owner confirms.
