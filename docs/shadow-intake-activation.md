# Apex: owner-gated shadow intake

> **Activation checkpoint (2026-11-05).** For current engineering status, including source-only invoice previews and pending staff Access, see [current gates](current-gates-2026-11-06.md). Statements below about 'next engineering priority' preserve historical plans, not the newest code status.

**Status: ACTIVATED and independently confirmed in the real Form-bound Apps Script execution log on 2026-11-05 at 01:30:37 PKT.** Activation cutoff: `2026-11-04T20:30:37.411Z`. Production database contained two prior synthetic test bookings, two ingestion events, one full-form details row and zero invoices at the immediate post-activation read. No actual post-activation customer submission had arrived as of that check. The canary was successfully disarmed before launch. **Live Form-to-database delivery of real customer submissions has not yet been independently reverified with a first new customer event.**

## Why shadow mode

Fatima keeps the existing Google Form → Google Sheet → manually reviewed pricing and invoice workflow as **the operational source of truth**. For *new* submissions only, an installable Form submit trigger also copies the complete response into the restricted Neon production database. There is no availability confirmation, booking acceptance, pricing, customer email or invoice triggered by this intake.

The `/staff` and `/staff/api/bookings` endpoints are **not an operational staff UI** until Cloudflare Access audience and an email allowlist are configured and verified for Fatima. Existing synthetic `/demo/staff` is only a preview.

## Required explicit owner approval

Fatima must explicitly approve:
1. That future Form submissions will also be stored in Apex's private database, including customer contacts, boarding dates, address, dog vaccination/distemper status, medications/feeding instructions, personality flags and optional vet contact.
2. Who can view the private records. Until an authenticated UI exists, access should stay limited to the engineering backend; existing Form/Sheet access remains unchanged.
3. Whether the current Form privacy wording adequately describes processing and storage for the agreed workflow, or must be updated before going live. Do not turn intake on if customer transparency remains unresolved.

This is distinct from approval of boarding rates and invoices.

## Controlled activation record (completed; do not rerun)

The following activation procedure was executed and verified in Apps Script. **Do not rerun it while active.**

1. Sync current source using `npm.cmd run form:sync`, then refresh the Form-bound Apps Script editor. The target must remain the **same existing** script/form, not a new project.
2. Under **Project Settings → Script Properties**, leave the verified production `APEX_API_URL`, private `APEX_INTAKE_TOKEN` and saved `APEX_FIELD_MAP`. Ensure the canary has been disarmed. Set `APEX_OWNER_APPROVED_LIVE=true` **only with recorded owner approval**. Keep `APEX_INTAKE_ENABLED=false` before the activation.
3. In the Apps Script dropdown, run **`apexActivateShadowIntake`** once. It fails closed unless all 19 stable IDs match, exactly one correct original Form trigger exists, the endpoint is the exact verified production URL, a private token is present, the canary is absent, and approval is recorded. It writes a UTC activation cutoff into `APEX_LIVE_START_AFTER` and `APEX_RECONCILE_AFTER` **before** turning normal intake on.
4. Only Form events with `getTimestamp() >= APEX_LIVE_START_AFTER` are forwarded. Old, queued or replayed event objects are ignored. Previous Form responses are **not** backfilled. The existing Google Sheet remains operational.
5. Check the first few new **genuine** submissions by comparing count and response IDs (never personal details in logs) between the Form/Sheet, Apps Script execution success and restricted Neon production. Monitor Apps Script trigger failures and the existing GitHub health checks for 48 hours; a successful health check is NOT evidence that all Form submissions were ingested.

## Halt immediately

Run **`apexPauseShadowIntake`** in Apps Script. It sets `APEX_INTAKE_ENABLED=false`, does not alter existing Form submissions/Sheet and does not delete the trigger or database records. Never replay records automatically. If reopening later, require a fresh owner-reviewed cutoff for any missed events; do not simply reset the approval flag or use unrestricted historical reconciliation.

## After intake stabilizes

Build the minimum staff flow: Cloudflare Access identity/allowlist, new-booking queue, explicit review/approval, status changes, clear care-detail access rules, and failure notification. Derived historical rates (standard PKR 2,500/day, camera +500/day, inclusive day counting) may power **draft-only** quotes, but transport, multi-dog pricing, discounts, grooming exceptions, payment destination and delivery consent remain owner decisions. No real invoice or payment demand should be generated until approved.

**No need for another synthetic submission**: the actual Google Form trigger, Cloudflare production Worker and Neon production persistence were already independently tested in the one-shot canary.

## First genuine submission acceptance check (pending; no new test submission needed)

After the next genuine customer completes the existing Form, compare **only the Form response ID, booking creation time, and non-sensitive counts** against Neon's production `booking_requests`, `form_ingestion_events`, `booking_pets` and `booking_form_details`. Verify exactly one record per submission and zero invoices, and check the matching Apps Script `onApexFormSubmit` trigger execution shows Completed. Do not paste customer medical/care responses into chat or issue trackers.

Until verified for the first real submission, the Google Sheet remains Fatima's operational source of truth. **Production health checks do not prove that every Form response was persisted.** A failed Apps Script trigger can leave the Google Form/Sheet successfully updated while Neon is missing that submission.

## Next engineering priority (not implemented or owner-approved)

Implement failure alerting and bounded recovery for new submissions after the activation cutoff. Then configure **Cloudflare Access** with a verified audience and staff email allowlist for the read-only queue before showing real customers' contact details to staff. Afterward attach draft quote review and explicit invoice approval using the owner-reviewed pricing exceptions and payment destination. Preserve current billing-off posture in the meantime.
