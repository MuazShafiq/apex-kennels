# Apex source Form: observed structure (2026-11-04)

**Status:** five-section form editor inspected with access verified. This is a field inventory, **not** a live integration or permission to backfill historical responses. The Form currently contains existing customer submissions; never copy their raw answers, medical instructions, addresses or phone numbers into the public repository.

## Section 1 — Dog Boarding Registration
- `Boarding Period (start date)` — required date.
- `Boarding Period (end date)` — required date.
- Form description advertises boarding **starting at PKR 2,500/day**, with meals, playtime and weekly vet check-ups. This is public customer-facing copy, **not** an approved comprehensive internal rate card.

## Section 2 — Owner Details
- `Owner's Name` — required.
- `Address` — required; potentially sensitive.
- `Will you require pick-up and drop-off for your pet?` — Yes (extra invoice charges) / No. **No price specified**.
- `Camera Cage with 24/7 CCTV:` — Yes (additional **PKR 500/day**) / No. A standard PKR 2,500/day + camera PKR 500/day might explain the historical PKR 3,000 rate, but don't assume a universal rule without Fatima's confirmation.
- `Phone number` — required.
- `Emergency Contact number` — required; potentially sensitive.
- Form separately displays a required **Email** field. The Apps Script adapter may obtain it through `formResponse.getRespondentEmail()`; exact collection behavior needs a synthetic test.

## Section 3 — Pet Details
- `Dog's Name` — required, one dog per form as observed.
- `Breed`, `Gender`, `Age`, `Vaccination status`, `Has your pet ever been diagnosed with Canine Distemper?` — required.
- `Veterinarian contact number` — present.

## Section 4 — Personality traits
- Yes/No grid: Friendly; Fears (thunderstorms etc); Climber; Food Sensitivities; Barks Excessively; Allergies; Bite History; Medical Conditions.
- `Special Instructions`, `Medications and Feeding Instructions` — free text. Contains sensitive pet care information. Handle with restricted access and privacy controls; don't copy it to debug logs, public demo data or GitHub issues.

## Section 5 — Terms and Conditions
- Six paragraphs of customer acknowledgements and a required acceptance response.
- Store versioned acknowledgement proof only after defining an appropriate retention and privacy policy. Do not auto-accept or modify the existing text.

## Implications for implementation
1. **Do not enable the live Form trigger yet.** The current Apex intake schema stores only contact/name, pet name, dates, optional accommodation; it drops address, pickup, vaccination, health and care requirements. These are operationally important.
2. Map Form **item IDs**, not question labels. `listApexFormItemIds()` in `integrations/google-form/Code.gs` safely logs titles and item IDs only, not responses. IDs cannot be reliably inferred from the visible editor.
3. Prefer a **private, access-controlled structured pet-care record** rather than storing arbitrary response JSON in an unprotected table. Retain the original Google Form responses until the archive and access policy is approved.
4. Confirm camera cage classification and fees, pickup pricing and inclusive-day counting before generating any real invoice.
5. Create one clearly synthetic submitted response after mapping. Run `validateApexSyntheticResponseMapping()` and review presence-only diagnostics. Enable live ingestion only after an explicit owner-reviewed cutover.

**Original Form:** titled `Boarding Appointment` in Google Drive. No edit URL or customer identifiers are committed into this public repository.
