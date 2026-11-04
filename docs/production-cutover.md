# Apex live Form intake cutover

**Current state (Nov 4, 2026):** Production Neon has the additive migration for full-form care details. The existing booking and ingestion event were preserved (1 each), 0 invoices. Pre-migration no-compute Neon snapshot: `backup-pre-full-form-cutover-2026-11-04` (`br-late-rice-azttpcw3`). Production Neon branch: `br-dry-lab-azyb3ewl`. The live Worker, real trigger, and customer intake are **not** yet activated through this document.

## 1. Safe production schema: COMPLETE, INDEPENDENTLY VERIFIED

Applied statements from `db/migrations/001_full_form_details.sql` to production: nullable `form_ingestion_events.payload_fingerprint` and `public.booking_form_details` with row-level security enabled and **zero public policies**. This is additive; no existing records were rewritten or deleted. Never re-run the baseline `db/schema.sql`.

## 2. Release code to production Worker: PENDING

After CI on PR #9 completes green, merge the feature branch to `main` only following source review. In VS Code:

```powershell
git switch main
git pull --ff-only
npm.cmd ci
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\deploy-production-worker.ps1 -RotateIntakeToken
```

The script rejects dirty or stale `main`, runs type-check/tests/Worker dry-run, requires a configured Cloudflare `DATABASE_URL` secret, and asks for an explicit deployment confirmation. It deploys **only** `apex-kennels-api` and rotates its intake bearer token. The new token goes to Windows clipboard. This does **not** enable the Form or send emails/invoices.

For the first production cutover, **confirm** that existing Cloudflare `DATABASE_URL` points to Neon's production branch, not `local-development`. Cloudflare secret names alone do **not** prove the underlying database target. The later canary must be verified by direct read-only query on **production**.

## 3. Prepare production Form webhook and one-shot canary: PENDING

In the original Form-bound Google Apps Script project:

- Sync the latest feature from `main` using `npm.cmd run form:sync` (one-time `clasp` configuration already established).
- Script Properties: `APEX_API_URL` = `https://apex-kennels-api.muaz-shafiq18.workers.dev/api/ingest`, `APEX_INTAKE_TOKEN` = **paste rotated production-only token**, `APEX_INTAKE_ENABLED` = `false`, `APEX_OWNER_APPROVED_LIVE` = `false`.
- Clear Windows clipboard using `Set-Clipboard -Value ''`.
- Run **`apexArmRealFormCanary`** once from Apps Script. It verifies the saved Form ID map, checks production endpoint/token, creates at most one actual Form-specific submit trigger for the current script owner, keeps normal intake **disabled**, and prints an unpredictable canary Owner Name marker.

**Do not enable the normal intake flag yet. Do not run historical reconciliation.**

## 4. One actual Form submission, not a scripted submission: PENDING

Open the public responder link for the existing Dog Boarding Registration Form, and submit **one** clearly synthetic booking. Use the exact **Owner Name marker** from `apexArmRealFormCanary` and **Dog Name `APEX SYNTHETIC CANARY PET`**. All other mandatory fields should contain obviously synthetic/nonmedical sample content; use your own email if the Form requires verified email. This creates exactly one visible synthetic response in the existing Form/linked Sheet, so label it clearly for Fatima; **do not remove or edit her historical customer responses**.

An actual browser submission is required to test the installable trigger. Google does **not** fire that trigger from `FormResponse.submit()` in Apps Script. See official Google Apps Script installable-trigger documentation.

The handler ignores all ordinary customer submissions while intake disabled and canary marker is armed. On the matching response it sends exactly one payload to the production Worker, sets `APEX_CANARY_COMPLETE=true`, and logs a non-PII synthetic response ID. Subsequent canary attempts are ignored; errors fail closed.

After the canary, independently verify the logged response ID **only on Neon production**:
- exactly one booking, one ingestion event, one linked pet, one restricted details record
- valid fingerprint and accepted consent
- no invoice, no email
- no import of historic 18 responses

If the production row is absent, stop. This could mean the deployed Worker is still using the wrong `DATABASE_URL`, a trigger error, or a credential mismatch. **Do not activate regular intake.**

Run **`apexDisarmRealFormCanary`** to remove canary properties; the installable trigger remains but normal intake stays disabled.

## 5. Owner-approved go-live: BLOCKED UNTIL SIGN-OFF

Fatima must explicitly approve automatic capture/storage of incoming real booking details (including vaccination, medications and feeding instructions) and who may access those fields. After the canary passes, configure the approved go-live boundary: `APEX_OWNER_APPROVED_LIVE=true`, `APEX_INTAKE_ENABLED=true`, and `APEX_RECONCILE_AFTER` to the exact approved go-live timestamp with `+05:00` offset. The live webhook also requires no canary marker to remain. Never replay earlier customer responses without a separate owner-approved backfill.

**Billing is independent:** derived standard PKR 2,500/day, camera +500/day and inclusive days can produce draft estimates. Pricing exceptions (transport, discounts, multi-dog), invoice approval/send workflow and current payment recipient still require separate owner confirmation. No auto-sending or payment collection is enabled.

## Failure/rollback

- Fastest halt: Set `APEX_INTAKE_ENABLED=false`, leave `APEX_OWNER_APPROVED_LIVE=false`; the Form keeps collecting Google responses as before. Installed trigger stays but performs no HTTP requests unless a separate canary marker is armed.
- Do **not** roll back the additive production migration or delete private care data to turn off intake. Existing production records remain intact.
- If the Cloudflare Worker version is broken, roll back Worker code to its previously known good deployment and verify `/api/health`; do not attempt to roll back Neon schema.
- The pre-migration backup branch is a point-in-time recovery reference, **not** an automatic rollback of new production data. Retain through stabilization, then explicitly review its removal to avoid long-lived storage cost.
- Apps Script installable triggers execute under the creator's account; failures should be monitored in the Apps Script executions view. The existing `reconcileApexRecentResponses()` is a manual, bounded recovery tool requiring owner-reviewed `APEX_RECONCILE_AFTER`. Never run it during canary.
