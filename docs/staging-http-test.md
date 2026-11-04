# Apex cloud delivery test (synthetic only)

## Status

The verified form-bound Apps Script already maps 19 question IDs and safely converts an in-memory synthetic Form response. The local Worker + Neon **local-development** branch already verified 201 Created, 200 retry, and 409 changed-care conflict. The remaining step is testing Google's outbound HTTP request through an isolated Cloudflare Worker to the development Neon branch.

**No live intake, production database migration, customer response backfill, automatic invoice or notification.** This test creates one **synthetic development booking** only.

## One-time VS Code staging setup (Windows)

1. In Neon, open project `apex-kennels`, branch **`local-development`** (ID `br-little-shape-az2ip3cp`), and copy its **pooled** connection string. Never use the production branch `br-dry-lab-azyb3ewl`.
2. Use VS Code terminal in `C:\Users\muazs\Downloads\apex-kennels`, with branch `feat/full-form-intake-staging`, and run:

```powershell
git pull --ff-only
npm.cmd ci
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\provision-staging.ps1
```

3. The script explicitly asks you to type `local-development`, deploys the **separate** Cloudflare Worker `apex-kennels-intake-staging`, then prompts for the development Neon URL (hidden). It saves that as a Cloudflare secret, generates a separate 32-byte staging token, and copies that token to the Windows clipboard after a successful staging health check. No files containing secrets are written to Git. Wrangler may ask you to sign in to Cloudflare on first use. **Never run** `npm.cmd run cf:deploy` for this stage because that targets production's default config.

4. Open the **existing** Google Form-bound Apps Script project. Under **Project Settings → Script Properties**, add `APEX_STAGING_INTAKE_TOKEN` and paste the value currently in your clipboard. Do not replace the production `APEX_INTAKE_TOKEN` or enable `APEX_INTAKE_ENABLED`. Keep the latter at `false`. Afterwards clear Windows clipboard using `Set-Clipboard -Value $null`.
5. Synchronize the updated adapter from the GitHub feature branch with **`npm.cmd run form:sync`** if the clasp first-time setup was successfully completed. Otherwise follow `docs/form-automation.md` and connect to the already-existing Apps Script project first. Avoid maintaining duplicate `.gs` function definitions.

## Exactly one Apps Script run

Select and run **`apexTestStagingDelivery`**. It internally runs `apexPreflight`, builds a unique synthetic Form payload using actual question metadata, and sends it to an **exact hardcoded staging-only URL** (not a configurable production URL):

`https://apex-kennels-intake-staging.muaz-shafiq18.workers.dev/api/ingest`

It expects **201 Created**, **200 exact retry**, **409 changed synthetic feeding instructions**. It logs only those statuses and the harmless synthetic fixture ID. There is no Google Form response created, no new customer email, and no invoice.

On success:

```text
APEX STAGING DELIVERY PASS: 201 new / 200 same / 409 changed.
```

The separate Neon branch should have exactly one booking, one corresponding ingestion event, and one restricted detail row for that fixture. Verify against the logged synthetic response ID. The production database should not be queried or modified.

## What this verifies and doesn't

**Verified if all checks pass:** Apps Script's Form metadata adapter → Google outbound HTTPS → Cloudflare staging Worker → Neon development DB, including retry/conflict protection.

**Not yet verified:** Google's actual installable `on form submit` event trigger, real customer intake, or owner-approved pricing/payment/invoicing. Those require a separate controlled cutover. The current Form contains historical customer responses and must not be used for uncontrolled trigger testing.

The separate staging Worker uses its own two Cloudflare secrets and can be removed after the acceptance test to avoid idle operational surface. It has no automations, scheduled jobs or recurring invoices.
