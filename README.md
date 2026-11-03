# Apex Kennels — Booking & Invoicing Foundation

**Status: deployed API foundation; NOT connected to Apex's live Google Form.**

The existing Google Form remains the customer-facing intake until we verify and replace it. The backend is designed to keep the database and pricing logic independent of that temporary input.

## Verified as of 2026-11-03

- **GitHub:** public repository with source, CI checks and all-synthetic test cases
- **Neon:** `apex-kennels` project (`holy-bar-96685960`), production `neondb`, 11/11 tables, RLS enabled on all 11 and no RLS policies; record counts were zero at the last independent check
- **Vercel:** `apex-kennels` project, Node.js 22, Singapore functions, production Git integration, SSO deployment protection
- **Secrets:** private `DATABASE_URL` and `INTAKE_API_SECRET` saved as encrypted **production-only** environment variables in Vercel. They are not in this repository.
- **Build:** TypeScript validation and all **14 tests** passed during production deployment
- **HTTP:** deployed `/api/health` returned 200; `GET /api/ingest` correctly returned 405. An authenticated POST creating a booking has **not** been independently executed end-to-end against production.
- **Form adapter:** source is in `integrations/google-form/`, intentionally **disabled** and not installed.

## Endpoint behavior

`POST /api/ingest` is internal and must carry `Authorization: Bearer <INTAKE_API_SECRET>` and `Content-Type: application/json`.

Accepted request fields: `source: "google_form"`, `externalResponseId`, `customerName`, `email` or `phone`, `petName`, `startDate` and `endDate`; optional `accommodationType`. No prices, bank details, or arbitrary invoice amounts are accepted from the caller.

- A new request creates a customer record, pet, booking request and ingestion event in one transaction
- Identical repeated submissions return the original booking instead of creating a duplicate
- A changed submission under an existing Google response ID returns HTTP 409 for manual review
- Booking status begins at `requested`; **not** an accepted reservation
- Database errors roll back the transaction; protected customer data is not included in responses

Access is controlled by both Vercel deployment protection and the private API token. Before connecting Apps Script, arrange an explicit protected API access method rather than disabling protection without review.

## Development

Requires Node.js 22.x.

```bash
npm install
npm run build  # typecheck + 14 tests + compiled server modules
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

Next priority: confirm the actual form fields, then perform a controlled synthetic end-to-end POST (with no real customer information) before enabling the Google trigger. Do not launch external booking automation before owner-verified mapping, access, and pricing rules.

## Cloudflare Workers migration

A Cloudflare Workers TypeScript intake API is being introduced on a dedicated feature branch. The Vercel version remains preserved for rollback. The Cloudflare version uses request-scoped Neon WebSocket clients so the existing Postgres BEGIN/COMMIT/ROLLBACK logic works without a persistent Node server. It is **not yet deployed** to Cloudflare and is **not connected** to Apex's live Google Form.

Read [Cloudflare deployment and security instructions](docs/cloudflare-workers.md). Run `npm run cf:check` to verify the Worker bundle and tests before connecting GitHub in the Cloudflare dashboard. Production secrets must be set in Cloudflare, not committed here.
