# Apex Kennels — Booking & Invoicing Foundation

**CURRENT STATUS (2026-11-06): SHADOW INTAKE ACTIVE; STAFF / BILLING CHANGES SOURCE-ONLY.** The existing Form still operates for Fatima. A trigger also forwards **new** responses from `2026-11-04T20:30:37.411Z` to Cloudflare/Neon; the synthetic canary and activation were verified, but first genuine-submission delivery is not independently confirmed in the documented checkpoint. **No live customer invoices, staff approvals, emails or payment requests.** New Access-gated staff quote previews and Google Maps pin checker are merged into source, **not deployed**. See [canonical operational status and blockers](docs/current-gates-2026-11-06.md).

The existing Google Form remains the customer-facing intake while the backend is developed. **Historical sections below document past checkpoints; their older disabled-trigger statements are superseded by the current status above.**

## Historical foundation checkpoints (pre-shadow launch)

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

Cloudflare's `workers.dev` hostname is public, while intake requires a private bearer token. The legacy Vercel route remains separately protected. **New-only Form shadow forwarding is active**; automatic booking acceptance and invoicing are disabled.

## Development

Requires Node.js 22.x.

```bash
npm install
npm run build  # legacy Node/Vercel build
npm run cf:check  # TypeScript + current test suite + Wrangler dry-run
npm run demo   # local synthetic quote and printable HTML invoice
```

The `api/ingest.js` Vercel entrypoint loads compiled code from `dist/src/`; `dist/` is generated at build time and is not tracked.

Boarding rate rules have owner confirmation; **monthly eligibility, transport profit definition, invoice number/payment details and approval remain unresolved**. All calculated invoices and synthetic previews remain internal and non-payable. The demonstrated design is not an approved Canva adaptation.

## Database safety

`db/schema.sql` is the **already-applied** production baseline. Do not re-run it. Use reviewed forward-only migrations for new columns/tables. PostgreSQL RLS currently has no staff/customer policies; the API connects from a private server runtime with a privileged database credential. Never expose that credential to any browser or public script.

## Historical scope list (some items superseded by current status above)

- Real Google Form trigger or response mapping; any live bookings
- Approved pricing policy, promo usage-limit redemption transaction, final invoice auto-drafting and staff approval
- Customer/staff login and dashboard; PDF sending; notifications; payments; inventory and capacity
- Final customer booking flow, bespoke public website, photo/media assets and Canva invoice design

## Original owner handoff checklist (partially resolved)

- Full Google Form editor access and linked Sheet access
- Complete pricing and stay-day rules, extras, discounts/promo rules
- Canva invoice template and 3–5 anonymized booking–invoice examples
- Invoice review/sending process, kennel inventory if available

Historical onboarding items above are largely complete. **Current priority is Cloudflare Access activation, first genuine intake verification, road validation, and a staff-reviewed invoice workflow**. See [current gates](docs/current-gates-2026-11-06.md).

## Cloudflare Workers migration

The Cloudflare Workers TypeScript intake API was merged in PR #1 and deployed at `https://apex-kennels-api.muaz-shafiq18.workers.dev`. Its authenticated synthetic booking and duplicate retry were verified against production Neon. The legacy Vercel version remains preserved as a development fallback. The Google Form trigger is **now active for new-only shadow intake** as documented above; the prior sentence was a historical checkpoint.

See [Cloudflare operational and security instructions](docs/cloudflare-workers.md). Cloudflare runtime secrets are configured privately, not committed in GitHub.

## Staff console preparation (2026-11-04)

- **Preview routes (historical deployment milestone):** `/demo/staff` and `/demo/invoice` are synthetic-only. New source also includes `/demo/draft` for a synthetic internal estimate. They do not access Neon or customer records.
- **Staff paths (code-ready, not operational):** `/staff` and `/staff/api/bookings` are read-only, and `/staff/draft` plus `/staff/location` now provide internal estimate/pin-checking. All require Cloudflare Access AUD plus an exact approved email allowlist; no customer communication, approval or payment action. See [staff access](docs/staff-access.md) and [current gates](docs/current-gates-2026-11-06.md).
- **Operational monitoring:** a scheduled GitHub Actions smoke test checks public health, rejected unauthorized intake, and no unauthenticated staff access every six hours. Failed runs require a human to inspect GitHub Actions; this is not a paging service.
- **Owner information:** [Current owner decisions and technical blockers](docs/current-gates-2026-11-06.md) supersedes the older [historical Fatima handoff](docs/fatima-handoff.md).
- **CI (historical):** The initial staff queue passed tests and Wrangler bundle dry-run. Newer PRs each passed expanded tests; **production verification of newer staff routes remains pending deployment**.

## Google Form recovery preparation

**Historical preparation:** The Form-bound Apps Script includes a bounded reconciliation helper and PII-free mapping checks. The live trigger was subsequently activated for new-only submissions; **no history has been backfilled**. See [the Google Form setup guide](integrations/google-form/README.md).

## Local development on Windows

See [Windows local setup](docs/local-windows.md) for opening **`$HOME\Downloads\apex-kennels` in VS Code**, a PowerShell 5.1-compatible bootstrap, local Worker previews, a loopback-only smoke checker, and an isolated Neon `local-development` branch. `.vscode/tasks.json` provides one-click local dev, tests and smoke-check tasks. The local environment starts with **blank credentials** and cannot write to production. After cloning, run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup-local.ps1
npm.cmd run dev
```

Then open `http://127.0.0.1:8787/demo/staff`. In another PowerShell window run `npm.cmd run local:check`. Never commit `.dev.vars` or reuse production database/API secrets for local testing.

## Original Google Form access checkpoint (superseded by shadow activation)

Editor access to the actual five-section Form was verified. The [field inventory](docs/form-field-inventory.md) records its question structure without personal submissions. The adapter was **later completed and activated** after mapping and full-form validation. This section preserves the earlier checkpoint only; see [shadow intake activation](docs/shadow-intake-activation.md).

## Staging implementation history (completed before shadow activation)

- **[Provisional pricing from four invoices](docs/pricing-evidence-v0.1.md)**: observed standard 2,500/day, camera 3,000/day, inclusive dates, one 4,000-per-leg transport example, discretionary discounts. This is evidence for **internal draft estimates only**, not an approved price book. The new pure `src/provisional-quote.ts` deliberately excludes transport and promotions from any apparent final total and always requires review.
- **[One-run staging delivery test](docs/staging-http-test.md)**: safely exercises real Google Apps Script outbound HTTPS to a dedicated Cloudflare staging Worker and Neon `local-development` branch using synthetic Form metadata. The staging Worker is separate from `apex-kennels-api` production; no Form submit trigger, live customer import, invoice, or email is enabled. Test is prepared but requires one-time Cloudflare credentials and a staging-only token.
