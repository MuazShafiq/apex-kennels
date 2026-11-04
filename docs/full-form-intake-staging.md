# Full Google Form intake staging (NOT deployed)

Engineering state: prepare and test on feature branch and Neon **local-development**. Production's existing Worker and the live Google Form trigger stay unchanged and disconnected.

## Data contract

`POST /api/ingest` accepts an optional `details` object alongside the legacy base booking fields. If `details` is supplied, it must contain **all required operational answers** from the verified five-section Google Form: owner address, pickup/dropoff preference, CCTV camera cage preference, emergency phone, dog breed, gender, age, vaccination status, distemper status, and true terms acceptance. Vet phone, eight yes/no personality traits, special instructions and medication/feeding instructions are supported when present.

Data stored in transaction: customer, pet (breed), booking request, form ingestion event with SHA-256 full-payload fingerprint, and separate restricted `booking_form_details`. Duplicate response IDs return the original booking when all details match and return **409** when any substantive detail changed. No prices are trusted from the Form and no invoices or messages are sent.

Sensitive owner and pet-care details are **never** sent to the public demo, the synthetic invoice, or default staff queue API. The new table has RLS enabled with no browser policies; staff visibility and privacy retention remain separate approval work.

## Database migration

`db/migrations/001_full_form_details.sql` adds one nullable digest column and one restricted detail table. **Applied and verified on Neon branch `local-development` (`br-little-shape-az2ip3cp`) on 2026-11-04.** This is a **forward-only** migration; don't re-run the baseline `db/schema.sql`. Production must be migrated **before** deploying the new Worker; otherwise old intake queries in the feature branch would fail on production due to missing fingerprint column. Do not merge this feature until the coordinated cutover is approved.

## Google Forms item IDs

The true form title is `Boarding Appointment`. Installable Apps Script trigger remains OFF. The Form-bound `Code.gs` now includes `proposeApexFieldMap()`, which reads only question titles, types, row labels and item IDs, then logs a map of semantic keys to stable item IDs. It doesn't save script properties or send requests. Use it once after the updated source is manually placed in the Form's Apps Script editor. Do not share past customer responses, email contents or bank details in logs.

Review the proposal, then set `APEX_FIELD_MAP` as a **private Script Property** and create one clearly labeled **synthetic** response. Run `validateApexSyntheticResponseMapping()` to check field presence only. Never auto-import existing responses. `APEX_INTAKE_ENABLED=false` remains a required hold point until the owner approves privacy, mapping and operational correctness.

## Local development next

Connect the already-created Neon `local-development` branch in the ignored `.dev.vars` (not the production connection string). Use the standalone local token. The local Worker runs under VS Code in `$HOME\Downloads\apex-kennels`. New full-form code is on this feature branch until it passes CI and can be migrated safely.

Note: the visible Google Form advertised starting PKR 2,500/day and a PKR 500/day CCTV option, but those **are not** an approved complete price book. Billing remains disabled.

## Run the full booking fixture in VS Code (after setting local secrets)

From `C:\Users\muazs\Downloads\apex-kennels`:

```powershell
git fetch origin
git switch --track origin/feat/full-form-intake-staging
npm.cmd install --no-audit --no-fund
npm.cmd run dev
```

In another VS Code terminal:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-full-form-local.ps1
```

The script only targets `http://127.0.0.1:8787`, creates a synthetic booking in the **development** database, and expects 201, 200 on retry, and 409 on changed feeding notes. It never sends a live Form response. Your ignored `.dev.vars` must have a `DATABASE_URL` from Neon's **local-development** branch and a newly generated local `INTAKE_API_SECRET`; do not reuse production secrets.

If the branch is already checked out, use `git switch feat/full-form-intake-staging` instead. Return to stable production source with `git switch main` and `git pull --ff-only`. This feature remains unmerged until production migration and owner review.

## Google Form grid mapping fix (2026-11-04)

The actual personality grid question is titled `(optional)`, not `Personality traits`. Its eight row labels include trailing spaces and NBSPs (for example `Friendly ` and `Bite History `). The initial `proposeApexFieldMap()` compared unnormalized row names and incorrectly threw `Personality trait grid not uniquely identified`.

**Fix:** `apexNormalizeLabel` normalizes whitespace in both ID discovery and live response parsing. Both Google Forms `GRID` and `CHECKBOX_GRID` types are supported and tested, including a checkbox grid's nested response arrays. The matcher also requires the expected Yes/No columns and all eight known trait rows and refuses ambiguous or changed structures.

**To apply:** In the Form-bound Apps Script project, replace the contents of the previously created `ApexIntake.gs` with the revised `integrations/google-form/Code.gs` from this **feature branch**, save and rerun `proposeApexFieldMap()`. The function inspects question metadata only. Do not create a trigger, enable `APEX_INTAKE_ENABLED` or read/import historical responses as part of the mapping procedure.

**Verification:** CI passed all 52 tests on Node 22 and 24, including four synthetic Apps Script fixtures for both grid types and a multiple-selection rejection. Actual execution in the Google Form project is still pending.

## Stage the verified Form item IDs (without a live submission)

On 2026-11-04, `proposeApexFieldMap()` successfully resolved all **19** stable item IDs in the real Form, including the personality grid and consent checkbox. It only printed the proposal and did **not** configure runtime properties.

1. Replace the contents of the existing form-bound `ApexIntake.gs` with the latest `integrations/google-form/Code.gs` **from this feature branch**. Do not duplicate functions across `.gs` files. Save.
2. In the Apps Script function dropdown, run `stageApexFieldMapDisabled()`. It independently rechecks Form question metadata, saves `APEX_FIELD_MAP` in **Script Properties** and sets `APEX_INTAKE_ENABLED=false` (only if not already enabled). It neither reads past responses nor creates a trigger, webhook or booking.
3. Run `validateApexSavedFieldMap()`. Success log: `APEX FIELD MAP VERIFIED: 19 item IDs match. Intake disabled. No customer responses accessed.`
4. Do **not** set `APEX_INTAKE_ENABLED=true`, install any trigger, or manually replay old responses. Real Form email retrieval and optional answer handling still need end-to-end validation before a reviewed cutover.

The item IDs are metadata, not credentials; no customer responses or API secrets are added to GitHub. Production database migration and official activation remain separate steps.
