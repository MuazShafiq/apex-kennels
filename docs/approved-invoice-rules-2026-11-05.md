# Apex Kennels invoice rules: Fatima's 2026-11-05 confirmations

**Owner-confirmed, pending integration into live customer invoicing.** Updated 2026-11-06: the founder clarified both full-month discounts and designated Fatima as payment recipient. Source: Fatima's WhatsApp messages sent 02:40–02:47 PKT, 2026-11-05, as shared by Muaz. This document intentionally distinguishes explicit facts from unresolved interpretations. No live billing, messages, payments or delivery are authorized by this specification.

## Confirmed

| Component | Rule |
| --- | --- |
| Normal cage | PKR 2,500/day per dog |
| Camera cage | PKR 3,000/day per dog |
| Normal cage full-month package | **PKR 75,000 minus PKR 10,000 discount = PKR 65,000 per dog** for a 30 billed-day stay |
| Camera cage full-month package | **PKR 90,000 minus PKR 10,000 discount = PKR 80,000 per dog** for a 30 billed-day stay |
| Grooming | **Always free**, show optional zero-priced line on invoice |
| Invoice workflow | **Generate draft automatically; Fatima/staff inspect it and SEND MANUALLY** |
| Car consumption | **12 km/litre** (assumed interpretation of "Car fuel average is 12") |
| Fuel-cost assumption | **PKR 400/litre**, owner-supplied; configurable, not verified current pump price |
| Transport profit | **20% markup on fuel cost**, confirmed 2026-11-09 (Rs. 1,000 fuel → Rs. 1,200 fee) |
| Transport pricing | Distance-based, not a flat PKR 4,000 trip |

### Monthly package eligibility

The owner confirmed a **PKR 10,000 per-dog discount** for a full month on either standard or camera boarding. The explicit examples use 30 billed days, so the current deterministic discount applies to **exactly 30 inclusive billed days**, after staff selects the package. It is not silently applied to 28, 29, 31 or longer stays. Longer/calendar-month exceptions remain for staff review instead of inventing a rule.

### Transport: confirmed markup; final route and fuel amount still require review

Fuel cost (PKR) = **total vehicle km driven / 12 × 400**.

- **Owner-confirmed method (2026-11-09):** fee = fuel cost × 1.20. At the historical PKR 400/litre assumption, that is **PKR 40 per vehicle km**.
- The alternate gross-margin formula is **not** used. Fatima must still approve the final amount after route and local fuel-rate verification. If a 10-km one-way collection requires the driver to return to the kennel, the route is 20 vehicle km before any other trips. If pickup **and** drop-off are separately requested, include the full actual driven route for both tasks, and avoid charging the same segment twice. Tolls, driver time and vehicle depreciation are not specified and are not included in the fuel-only estimate. The Form's yes/no pickup-dropoff field does **not** supply a route or exact driven kilometres. Require measured route input and verified fuel price before a payable transport line is approved.

## Approved operational posture

1. Generate internal, clearly marked **DRAFT / NOT PAYABLE** previews automatically from validated bookings once integrated.
2. Keep all drafts under staff review. In particular, transport, monthly eligibility, manual discounts and bank payment account must not silently default.
3. Fatima/staff review and **send each invoice manually**, by their chosen channel. No customer email, WhatsApp, PDF delivery or automatic payment request is connected yet.
4. Preserve financial snapshots of rates/charges when an invoice is created; do not recalculate previously approved invoices because fuel costs or rates later change.

## Unresolved (ask only if needed for the actual invoice)

- Clarify how exceptions to the 30 billed-day package are handled, only if an actual such booking arises.
- The 20% markup is confirmed; confirm extraordinary tolls or vehicle costs only when relevant.
- How are additional dogs or special cases handled beyond the confirmed per-dog monthly rule?
- Payment recipient is **Fatima's HBL account**, not Zain's. The full sensitive account details must be securely configured rather than committed to source. Reuse Apex's existing four-digit invoice numbering, checking for any numbers issued manually in Canva before automatic sequence activation. Actual customer invoice sending requires Meta setup and an approved invoice template.

## Current engineering

`src/apex-invoice-draft.ts` contains deterministic **pure** calculations for the confirmed rates, an explicit 30 billed-day per-dog package discount for **both cages**, always-free grooming, and fuel-cost markup options. It is deliberately **not wired to live Neon bookings, payment details, sending, staff permissions or deployed Worker endpoints**. `src/invoice.ts` has a prominent owner-review / not-payable watermark option. Production ingestion stays unchanged.


## Updated engineering: live price lookup supersedes fixed fuel estimate

For new transport invoice **drafts**, the earlier owner-supplied PKR 400/litre is preserved as a historical assumption, **not an automatic fallback rate**. See [live petrol rate implementation](live-petrol-rate-invoices.md). The draft service fetches a current OGRA-notified national petrol price each time transport is quoted, validates the effective date and snapshots the source. Islamabad pump secondary freight still requires manual adjustment; no rate is silently invented when the feed is unavailable. The markup method is settled; total driven kilometres and applicable local petrol rate still need staff confirmation. No customer-facing auto-send.
