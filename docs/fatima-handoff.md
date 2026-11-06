# Fatima: decisions still needed

The Google Form and staff booking review already exist. These are the **unresolved** business decisions needed for the next invoicing/booking steps. Do not ask for data that has already been supplied.

## Invoice and approval

- **Resolved:** 30 billed-day package gives Rs. 10,000 off per dog: standard Rs. 65,000, camera Rs. 80,000. Different-length or calendar-month exceptions need review only if they arise.
- **No immediate owner question:** use fuel cost + 20% markup only as an explicitly provisional, editable estimate. This is not a confirmed 20% gross margin or an approved payable charge. Fatima reviews and can override the final transport amount. Do not silently add tolls, driver time or other costs.
- **Reuse actual invoice examples:** founder-supplied 2026 invoices establish an existing simple four-digit invoice-number convention and a visual layout. Do not invent a new numbering format. Avoid collisions with invoices still created manually in Canva; verify the current latest number when activating issuance.
- **Payment recipient chosen:** Fatima's HBL account (not Zain's). Keep account number and IBAN in secure runtime settings, never GitHub. Use the established four-digit numbering sequence, checking the latest manual Canva invoice before enabling automatic issuance.
- **New direction:** Fatima approves an invoice in staff UI and an approved invoice is then sent to the customer's WhatsApp automatically. This requires official Meta Cloud API credentials, an approved utility/document template, recorded customer WhatsApp opt-in, exact approver permission and protected duplicate-send controls. Until those are ready, no customer messages are enabled.
- Confirm how multi-dog special cases or nonstandard stays should be priced.

## Transport and customer booking

- Confirm the actual drivable kennel entrance and Bawli approach used for routing; the mapped locations have not yet been verified as entrances.
- Review the six public boarding terms for legal/business accuracy. They are currently displayed in the customer website preview.
- Review the replacement booking page before launch. Mobile Google Maps share-link testing is tracked in [issue #37](https://github.com/MuazShafiq/apex-kennels/issues/37).

## Already confirmed

Standard cage PKR 2,500/day/dog; camera cage PKR 3,000/day/dog; 30-day package discount Rs. 10,000 per dog giving Rs. 65,000 standard or Rs. 80,000 camera; grooming free; invoice approval and WhatsApp sending are still to be implemented under explicit gates. [Source and remaining qualifications](approved-invoice-rules-2026-11-05.md).

Do not place private customer information, bank credentials or secrets into public GitHub issues.
