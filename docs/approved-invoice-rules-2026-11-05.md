# Apex Kennels invoice rules: Fatima's 2026-11-05 confirmations

**Owner-confirmed, pending implementation and staff review.** Source: Fatima's WhatsApp messages sent 02:40–02:47 PKT, 2026-11-05, as shared by Muaz. This document intentionally distinguishes explicit facts from unresolved interpretations. No live billing, messages, payments or delivery are authorized by this specification.

## Confirmed

| Component | Rule |
| --- | --- |
| Normal cage | PKR 2,500/day per dog |
| Camera cage | PKR 3,000/day per dog |
| Normal cage full-month package | **PKR 65,000 per dog**, not a one-off historical discount |
| Grooming | **Always free**, show optional zero-priced line on invoice |
| Invoice workflow | **Generate draft automatically; Fatima/staff inspect it and SEND MANUALLY** |
| Car consumption | **12 km/litre** (assumed interpretation of "Car fuel average is 12") |
| Fuel-cost assumption | **PKR 400/litre**, owner-supplied; configurable, not verified current pump price |
| Desired transport profit | **20%**, calculation basis not specified |
| Transport pricing | Distance-based, not a flat PKR 4,000 trip |

### Monthly package eligibility

Fatima confirmed the **price** and **per-dog** application, not the definition of "one month". Staff must explicitly select the monthly package for a qualifying booking until she confirms whether it means 30 nights, 30 inclusive days or matching calendar dates. It is NOT automatically applied after a day-count threshold. **Camera-cage monthly pricing remains unspecified**. A monthly booking with a camera cage must go to manual review.

### Transport: provisional formula, not an approved customer-facing amount

Fuel cost (PKR) = **total vehicle km driven / 12 × 400**.

- If **20% markup on fuel cost**: fee = fuel cost × 1.20 = **PKR 40 per vehicle km**.
- If **20% gross profit margin**: fee = fuel cost / 0.80 = **PKR 41.67 per vehicle km** (before whole-rupee rounding).

Both calculations are included for technical comparison; **neither is automatically authoritative**. If a 10-km one-way collection requires the driver to return to the kennel, the route is 20 vehicle km before any other trips. If pickup **and** drop-off are separately requested, include the full actual driven route for both tasks, and avoid charging the same segment twice. Tolls, driver time and vehicle depreciation are not specified and are not included in the fuel-only estimate. The Form's yes/no pickup-dropoff field does **not** supply a route or exact driven kilometres. Require measured route input and Fatima's choice of profit basis before a payable transport line is approved.

## Approved operational posture

1. Generate internal, clearly marked **DRAFT / NOT PAYABLE** previews automatically from validated bookings once integrated.
2. Keep all drafts under staff review. In particular, transport, monthly eligibility, manual discounts and bank payment account must not silently default.
3. Fatima/staff review and **send each invoice manually**, by their chosen channel. No customer email, WhatsApp, PDF delivery or automatic payment request is connected yet.
4. Preserve financial snapshots of rates/charges when an invoice is created; do not recalculate previously approved invoices because fuel costs or rates later change.

## Unresolved (ask only if needed for the actual invoice)

- What precisely qualifies as "one month"? How are 28-, 29-, 30- and 31-day stays handled?
- Is the 20% profit calculated as markup on fuel cost or gross margin? Should extra vehicle running costs, tolls or a minimum charge be included?
- How are additional dogs or special cases handled beyond the confirmed per-dog monthly rule?
- Which bank account/recipient, invoice numbering and template should appear on customer-facing invoices? Can Fatima review the initial draft design?

## Current engineering

`src/apex-invoice-draft.ts` contains deterministic **pure** calculations for the confirmed rates, optional explicitly selected monthly package, always-free grooming, and either explicitly selected fuel-cost profit basis. It is deliberately **not wired to live Neon bookings, payment details, sending, staff permissions or deployed Worker endpoints**. `src/invoice.ts` has a prominent owner-review / not-payable watermark option. Production ingestion stays unchanged.
