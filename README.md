# Apex Kennels — Booking & Invoicing Foundation

**Status: deployed API foundation; NOT connected to Apex's live Google Form.**

The existing Google Form remains the customer-facing intake until we verify and replace it. The backend is designed to keep the database and pricing logic independent of that temporary input.

## Verified as of 2026-11-04

- **GitHub:** public repository with source, CI checks and all-synthetic test cases
- **Neon:** `apex-kennels` project (`holy-bar-96685960`), production `neondb`, 11/11 tables with RLS enabled and no RLS policies. One synthetic booking and one corresponding ingestion event were independently verified on 2026-11-04.
- **Vercel:** `apex-kennels` project, Node.js 22, Singapore functions, production Git integration, SSO deployment protection
- **Secrets:** private `DATABASE_URL` and `INTAKE_API_SECRET` saved as encrypted **production-only** environment variables in Vercel. They are not in this repository.
- **Build:** GitHub CI passed TypeScript checks, **23/23 tests** and Cloudflare Wrangler bundle dry-run on the migration PR.
- **HTTP:** Cloudflare `/api/health` returned 200. An authenticated synthetic POST to `/api/ingest` returned **201 Created**, and the identical retry returned **200** with the same booking ID. Independent Neon query confirmed exactly **one booking, one ingestion event and one linked pet**, with zero invoices. No real customer booking was imported.
- **Form adapter:** source is in `integrations/google-form/`, intentionally **disabled** and not installed.

## Endpoint behavior

`POST /api/ingest` is internal and must carry `Authorization: Bearer <INTAKE_API_SECRET>` and `Content-Type: application/json`.

Accepted request fields: `source: "google_form"`, `externalResponseId`, `customerName`, `email` or `phone`, `petName`, `startDate` and `endDate`; optional `accommodationType`. No prices, bank details, or arbitrary invoice amounts are accepted from the caller.

- A new request creates a customer record, pet, booking request and ingestion event in one transaction
- Identical repeated submissions return the original booking instead of creating a duplicate
- A changed submission under an existing Google response ID returns HTTP 409 for manual review
- Booking status begins at `requested`; **not** an accepted reservation
- Database errors roll back the transaction; protected customer data is not included in responses

Cloudflare's `workers.dev` hostname is public, while the intake route requires a private bearer token. The legacy Vercel route remains separately protected. Live Google Form import stays disabled.

## Development

Requires Node.js 22.x.

```bash
npm install
npm run build  # legacy Node/Vercel build
npm run cf:check  # TypeScript + 23 tests + Wrangler dry-run
npm run demo   # local synthetic quote and printable HTML invoice
```

The `api/ingest.js` Vercel entrypoint loads compiled code from `dist/src/`; `dist/` is generated at build time and is not tracked.

The money calculation, promo validation and invoice HTML are reusable prototypes. **Do not use them for real prices until Fatima confirms the rulebook.** The demonstrated invoice is synthetic and not an approved Canva adaptation.

## Database safety

`db/schema.sql` is the **already-applied** production baseline. Do not re-run it. Use reviewed forward-only migrations for new columns/tables. PostgreSQL RLS currently has no staff/customer policies; the API connects from a private server runtime with a privileged database credential. Never expose that credential to any browser or public script.

## Not connected or implemented

- Real Google Form trigger or response mapping; any live bookings
- Approved pricing policy, promo usage-limit redemption transaction, final invoice auto-drafting and staff approval
- Customer/staff login and dashboard; PDF sending; notifications; payments; inventory and capacity
- Final customer booking flow, bespoke public website, photo/media assets and Canva invoice design

## Waiting on Fatima

- Full Google Form editor access and linked Sheet access
- Complete pricing and stay-day rules, extras, discounts/promo rules
- Canva invoice template and 3–5 anonymized booking–invoice examples
- Invoice review/sending process, kennel inventory if available

Next priority: obtain and verify the actual Form/Sheet fields, configure the production Google Forms trigger securely, and complete an owner-reviewed dry run before live imports. Do not launch invoice pricing or delivery before Fatima approves the rules.

## Cloudflare Workers migration

The Cloudflare Workers TypeScript intake API was merged in PR #1 and deployed at `https://apex-kennels-api.muaz-shafiq18.workers.dev`. Its authenticated synthetic booking and duplicate retry were verified against production Neon. The legacy Vercel version remains preserved as a development fallback. The Google Form trigger is still **not installed or enabled**.

See [Cloudflare operational and security instructions](docs/cloudflare-workers.md). Cloudflare runtime secrets are configured privately, not committed in GitHub.

## Staff console preparation (2026-11-04)

- **Preview routes:** `/demo/staff` displays clearly labeled **synthetic** bookings; `/demo/invoice` renders a synthetic, non-payable draft with an explicit unapproved rate label. They do not access Neon or customer records.
- **Live staff queue:** `/staff` and `/staff/api/bookings` are bounded, read-only Neon views. Both fail closed until Cloudflare Access is configured with an exact audience and staff email allowlist. No staff changes, invoice approvals or customer messages are enabled. See [staff access setup](docs/staff-access.md).
- **Operational monitoring:** a scheduled GitHub Actions smoke test checks public health, rejected unauthorized intake, and no unauthenticated staff access every six hours. Failed runs require a human to inspect GitHub Actions; this is not a paging service.
- **Owner information:** [Fatima handoff](docs/fatima-handoff.md) lists the remaining exact decisions/access needed before production imports, billing or staff actions.
- **CI:** TypeScript validation, 42/42 tests and Wrangler bundle dry-run passed on the feature branch. Independent Cloudflare production verification of these **new** routes is pending deployment.

## Google Form recovery preparation

The Form-bound Apps Script is still **not installed or enabled**. It now includes an opt-in manual reconciliation helper, capped at 50 submissions since an explicitly approved start timestamp, plus a PII-free synthetic response mapping audit. No history is automatically imported. See [the Google Form setup guide](integrations/google-form/README.md).

## Local development on Windows

See [Windows local setup](docs/local-windows.md) for the PowerShell 5.1-compatible bootstrap, local Worker previews, a loopback-only smoke checker, and an isolated Neon `local-development` branch. The local environment starts with **blank credentials** and cannot write to production. After cloning, run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup-local.ps1
npm.cmd run dev
```

Then open `http://127.0.0.1:8787/demo/staff`. In another PowerShell window run `npm.cmd run local:check`. Never commit `.dev.vars` or reuse production database/API secrets for local testing.
