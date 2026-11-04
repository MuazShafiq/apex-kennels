# Apex: owner-gated shadow intake

**Status:** Prepared, not activated. A real Google Form synthetic canary successfully reached Cloudflare production and Neon production on 2026-11-04, and was independently verified (one booking, event, pet, restricted details record; zero invoices). The canary was subsequently disarmed by Muaz. Real customer intake remains **OFF**.

## Why shadow mode

Fatima keeps the existing Google Form → Google Sheet → manually reviewed pricing and invoice workflow as **the operational source of truth**. For *new* submissions only, an installable Form submit trigger also copies the complete response into the restricted Neon production database. There is no availability confirmation, booking acceptance, pricing, customer email or invoice triggered by this intake.

The `/staff` and `/staff/api/bookings` endpoints are **not an operational staff UI** until Cloudflare Access audience and an email allowlist are configured and verified for Fatima. Existing synthetic `/demo/staff` is only a preview.

## Required explicit owner approval

Fatima must explicitly approve:
1. That future Form submissions will also be stored in Apex's private database, including customer contacts, boarding dates, address, dog vaccination/distemper status, medications/feeding instructions, personality flags and optional vet contact.
2. Who can view the private records. Until an authenticated UI exists, access should stay limited to the engineering backend; existing Form/Sheet access remains unchanged.
3. Whether the current Form privacy wording adequately describes processing and storage for the agreed workflow, or must be updated before going live. Do not turn intake on if customer transparency remains unresolved.

This is distinct from approval of boarding rates and invoices.

## One controlled activation, only AFTER permission

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
