# Questions for Fatima, only what the engineering cannot decide

## Access (required to connect live bookings)
- Share **editor access** to the existing five-page Google Form and the linked Google Sheet. Do not send customer data screenshots publicly.
- Share a **duplicate** of the Canva invoice template with editor access. We already have three example PDFs and do not need more sensitive examples.
- Which verified email address(es) should be allowed into the staff booking dashboard?

## Billing rules (required before any real invoice)
- Confirm date counting. Supplied July and November invoices bill both arrival and departure dates; is this always the rule? What about same-day stays and late pickup?
- Confirm current daily rates for each actual accommodation category (the examples show PKR 2,500/day and a separate PKR 3,000/day case). Is rate per pet, per kennel, or per booking? Multiple-pet adjustments?
- Which extras exist and how are they priced: pickup/drop, grooming, training, food, medication or others? When is grooming free?
- Which discounts and promo policies exist? Who may authorize a discount? Any redemption or stacking limits?
- Two **different payment accounts** appear across supplied invoice samples. Which account belongs on which invoice, and who selects it?
- Should invoice numbers be continued from an existing ledger? Who assigns them, and when?

## Workflow (required before enabling staff actions)
- Who confirms availability, approves a booking and invoice, records a payment, and sends the PDF? What channel is used (WhatsApp, email, or both)?
- Is there a kennel-capacity/calendar rule or mandatory vaccination/document requirement before acceptance?

## What is already complete
- Cloudflare API -> Neon synthetic booking write and exact retry verified.
- Google Form import intentionally disabled; no real invoices will be generated/sent without reviewed rules.
- A read-only staff console and non-payable synthetic invoice preview are prepared for review, not approved by Apex.

Never share API tokens, real bank account credentials, or customer records inside public GitHub.