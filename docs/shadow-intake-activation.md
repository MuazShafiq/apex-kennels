# Apex: owner-gated shadow intake

**Status (reviewed 2026-11-06): SHADOW INTAKE ACTIVE.** Activation cutoff: `2026-11-04T20:30:37.411Z`, verified in the original Form-bound Apps Script at 01:30:37 PKT on 2026-11-05. The one-shot synthetic canary was disarmed before activation.

**First post-activation delivery observed:** A 2026-11-06 read-only production Neon check found **three total bookings and three ingestion events**: two earlier synthetic test records and **one new `google_form` booking/event after activation**. The new booking's response ID matched its ingestion event, one corresponding full-form details row and linked pet were present, and **zero invoices** existed. No test/canary identifier markers were found. Muaz identified the new Form response as likely genuine (Form response #20, not created by the engineering team). **Independently confirming it is that exact original Form response remains pending:** privately compare Form response ID / timestamp with Apps Script execution and Neon. No response IDs or customer details are stored in this public document. These checks demonstrate one apparent successful delivery, not that every future submission will succeed.

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

## First genuine submission acceptance check (partially verified; no new test submission needed)

One post-activation delivery has passed the private Neon-side consistency checks (matching source event, details, pet linkage, zero invoices). **Remaining acceptance step:** In the original Form, locate response #20 and privately compare its response ID / submission time with the Neon booking/event and its `onApexFormSubmit` Apps Script execution, which should show Completed. Never expose the response ID, customer contact/address, medical/care notes, or other answers in GitHub or shared screenshots. **Do not rerun activation or replay historical submissions.**

Until verified for the first real submission, the Google Sheet remains Fatima's operational source of truth. **Production health checks do not prove that every Form response was persisted.** A failed Apps Script trigger can leave the Google Form/Sheet successfully updated while Neon is missing that submission.

## Next engineering priority (not implemented or owner-approved)

Implement failure alerting and bounded recovery for new submissions after the activation cutoff. Then configure **Cloudflare Access** with a verified audience and staff email allowlist for the read-only queue before showing real customers' contact details to staff. Afterward attach draft quote review and explicit invoice approval using the owner-reviewed pricing exceptions and payment destination. Preserve current billing-off posture in the meantime.
