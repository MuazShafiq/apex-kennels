# Apex Kennels — Booking & Invoicing Foundation

**The Neon PostgreSQL schema is deployed and verified. Application code remains a prototype; live form integration and application hosting are not deployed.**

Apex currently uses a Google Form. Our initial goal is to preserve that intake and automate pricing, discounts, staff-reviewed invoices, and later notifications. The customer-facing form and staff interface can then be replaced without rewriting pricing logic.

## Current code

- Configurable boarding-day counting, rate calculations, chargeable extras, manual discounts, promo-code validation
- Invoice HTML renderer (temporary styling; Fatima's Canva template pending)
- Booking and invoice workflow state guards
- Google Form field-mapping adapter (not connected yet)
- Draft PostgreSQL database schema at `db/schema.sql`, with row-level security enabled and no open read policies
- Nine local automated tests using only **synthetic examples**

Run on Node.js 22.6+:

```bash
npm test
npm run demo
```

`npm run demo` writes sample invoice HTML and quote JSON into `output/`. Both are fictional.

## Selected database: Neon PostgreSQL

Neon replaces the earlier Supabase hosting proposal. The SQL schema is standard PostgreSQL and requires no proprietary Supabase services.

**Infrastructure status (2026-11-03):** The dedicated Neon project `apex-kennels` (`holy-bar-96685960`), database `neondb`, production branch is provisioned. All 11 tables are verified, with RLS enabled on each and no RLS policies configured. Verified customer, booking, invoice and promotion record counts are 0.

Next steps:

1. Add secure server-only persistence using a private `DATABASE_URL` secret. Never commit credentials. See `.env.example`.
2. Build an authenticated, idempotent Google Form intake adapter after form/Sheet access is granted.
3. Add staff invoice review/approval and persist frozen price snapshots, then generate PDFs.
4. Apply **future** schema updates as numbered, reviewed migrations. **Do not re-run** `db/schema.sql` against production: this is the already-applied baseline.
5. Keep the current form live until the replacement experience is ready.

**Security:** No customer, pet, payment, invoice, or bank data belongs in this public GitHub repo. Only server-side code may access database credentials. No login, role policies, production access or real data import is set up yet.

## Not implemented

- Live application-to-database connection (Neon schema has been deployed)
- Live Form/Sheet sync, authenticated API, dashboard, or operational notifications
- Atomic promotion usage tracking and redemption
- PDF delivery / invoice approval UI / payment confirmation
- Kennel capacity tracking and availability
- Final business rules, Canva design, customer-facing custom form, premium website

The nine tests verify the *local computation*, not a deployed booking workflow.

## Waiting for Fatima

- All Form questions and linked Sheet permissions
- Price/day-count/discount rules, including promo stacking and exceptions
- 3–5 redacted booking–invoice pairs for validation
- Canva invoice template, invoice approval and sending process
- Optional inventory details: kennels, types, sharing constraints, occupancy

Booking requests must remain unconfirmed until staff approval. The final price must be confirmed before generating/sending a real invoice.
