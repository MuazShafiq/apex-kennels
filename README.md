# Apex Kennels — Booking & Invoicing Foundation

**Prototype only. Not deployed or connected to the live Google Form.**

The existing Google Form remains the customer-facing intake until Apex approves a custom form. This repo contains reusable pricing, promotions, booking workflow, invoice HTML, a configurable Google Form adapter, tests, and a proposed Postgres schema.

## Run

Node.js 22.6+:

```bash
npm test
npm run demo
```

`npm run demo` creates synthetic sample invoice HTML and a quote JSON inside `output/` (ignored by Git). The HTML can be printed to PDF. The sample is **not** Apex's Canva design.

## Built

- Booking-day rules: inclusive days vs elapsed nights (Fatima must confirm)
- Configurable boarding rates, extras, manual discounts, promotional codes
- Invoice HTML with escaped customer input and frozen calculated totals
- Booking/invoice transition guards
- Form field-mapping adapter, not yet connected to the real form
- Database schema with RLS enabled and no public access policies
- Automated tests

## Not built yet

- Live Supabase deployment, real form sync, bookings API, staff auth/dashboard, notifications, PDF delivery, capacity management, actual coupon redemption transactions, payment collection
- Verified Apex pricing rules, complete form mapping, Canva design

**Never put real pet/customer information, credentials, invoices, or bank details in this public repo.** Test fixtures are synthetic only.

## Integration sequence

1. Confirm the exact form fields, boarding-day logic, prices, extras, discount rules and approval policy.
2. Provision a dedicated database, review and apply the schema, and add private ingestion with idempotency.
3. Implement persisted quotes, manual review and approval, PDF rendering, and atomic promo redemption.
4. Connect and validate the live Google Form. Replace only the intake adapter when the custom form arrives.
5. Build the staff dashboard and public booking website on the same foundation.

See `db/schema.sql`. It is a **proposal**, not an applied migration.
