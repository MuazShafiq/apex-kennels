# Apex Kennels — Booking & Invoicing Foundation

**Prototype only. No live database, form integration, or deployed application.**

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

**Infrastructure status:** Neon account integration was installed, but no Apex database has been provisioned or verified yet.

Provisioning plan:

1. Create a **dedicated free** Neon project named `apex-kennels`; choose the region closest to the application hosting.
2. Store the database credentials as a private `DATABASE_URL` secret in the server runtime; never commit the real URL to GitHub. See `.env.example`.
3. Review `db/schema.sql` before applying it to the **new Apex database only**. Use a migration process for subsequent changes; do not blindly re-run a `CREATE TABLE` script on a populated database.
4. Verify the tables and security settings using `db/verify.sql`.
5. Build private, idempotent ingestion from Google Forms, then a staff approval step, saved invoice totals, and PDF generation.

**Security:** No customer, pet, payment, invoice, or bank data belongs in this public GitHub repo. Only server-side code may access database credentials. No login, role policies, production access or real data import is set up yet.

## Not implemented

- Live database connection or schema deployment
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
