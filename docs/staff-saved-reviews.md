# Saved staff estimates and Canva PDF reviews

**Engineering update (2026-11-15, not deployed):** Saved estimates now link to a separate [owner approval/delivery workflow](invoice-approval-delivery.md), disabled by default. Transport saves also record the exact service and gate provenance; older transport snapshots must be refreshed before approval. Review PDFs remain visibly `INTERNAL / NOT PAYABLE` and contain no payment recipient details.

**Production update (2026-11-14):** A synthetic transport estimate for booking ending `…033` was saved to production Neon (revision 1) and its Canva review PDF was inspected live after the blank-page and alignment fix in [PR #66](https://github.com/MuazShafiq/apex-kennels/pull/66). The operator verified a distinct-gate route total of 201.108 km, a November 14 national petrol baseline of PKR 330/L, transport PKR 6,637 and review total PKR 14,137. This is **not** a payable invoice or confirmation of the physical entrance/road approach.

## Existing boarding-only flow

- `/staff/draft?id=<uuid>` shows the protected boarding estimate and package selection.
- `/staff/draft/save` saves a frozen boarding-only review to the existing `invoice_draft_reviews` table.
- `/staff/draft/saved?id=<uuid>` opens Fatima's original Canva PDF, with no official invoice number or payment details.

## New transport review

- `/staff/transport?id=<uuid>` is available only for bookings requesting pickup or drop-off. It is protected by Cloudflare Access and the staff email allowlist.
- The form preloads the website customer's chosen service and pin if `booking_transport_locations` exists. The production location table and separate-drop-off columns are deployed; the screen also allows staff to supply confirmed numeric coordinates for old Form bookings.
- Staff explicitly select Pickup, Drop-off, or Both; confirm the customer's vehicle-access gate, the kennel entrance, and the Bawli approach. A regular street address or Maps viewport is never treated as verified coordinates.
- A same-origin POST recalculates a complete kennel → Bawli → customer → Bawli → kennel route for each service. Different pickup and drop-off gates get independent route requests, and their distances are summed. It then fetches the current published fuel baseline, assumes 12 km/L and adds Fatima's confirmed 20% markup on fuel cost.
- The first result is only a provisional estimate. A separate Save action recomputes route and fuel and saves the amount plus route/fuel provenance with optimistic revision checking.
- The saved review-only Canva PDF now fills the original Pick-up & Drop-off service row. No official invoice issuance, payment account, automatic sending or customer contact is connected.

## Safeguards and release status

- If any pin/road confirmation, drivable route or current fuel rate is missing, transport cannot be saved as a priced review.
- The saved petrol rate is a published national baseline; actual Islamabad pump freight or exceptional vehicle costs still require Fatima's final review.
- The known kennel and Bawli points are location candidates, not independently verified road entrances. Confirmation remains necessary. The private Worker `GEOAPIFY_API_KEY` is required for live routing.
- Historical Google Form intake is unchanged. The replacement `/book` form already contains None, Pickup, Drop-off and Both plus a pin, but is not yet enabled. No new database migration is needed for staff reviews.
- Esperanza/Camden was handled manually by Fatima: do not reprice, alter her booking or contact her.
- The review-only transport estimate and Canva PDF are deployed and have passed a controlled synthetic live verification. Invoice approvals, customer WhatsApp delivery, payments and automatic issuance remain separate, disabled work.
