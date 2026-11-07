# Saved staff price reviews (prepared, not enabled)

The existing `/staff/draft` estimate remains read-only by default. Set `APEX_STAFF_DRAFTS_ENABLED=true` only **after applying migration 003** and verifying the code. This is an **internal review**, not an invoice.

## Workflow

- `/staff/draft?id=<booking UUID>` displays a Save/Update internal draft button for eligible non-synthetic, no-transport requests.
- `POST /staff/draft/save` requires Cloudflare Access and same-origin form submission. It re-reads the booking server-side, calculates the quote again, and saves only a server-computed snapshot.
- `GET /staff/draft/saved?id=<booking UUID>` renders the persisted A4 **non-payable** review copy. Its pricing and explicit discount snapshot are frozen.
- A stale browser revision returns HTTP 409 so two staff tabs can't silently overwrite each other's changes.
- No approval, official invoice number, payment details, messaging, PDF email or WhatsApp customer sending is exposed.

Blocked: synthetic bookings, requests involving transport, missing preferences, cancelled/declined/completed bookings, and incomplete estimates. Thirty inclusive billed days select the existing discounted package automatically.

## Deployment gates

1. Back up/inspect the production database and separately approve applying `db/migrations/003_invoice_draft_reviews.sql`. This document does **not** authorize autonomous DB changes.
2. Deploy merged Cloudflare Worker code with `APEX_STAFF_DRAFTS_ENABLED` **unset/false** until the migration is approved and applied.
3. Then enable the flag and test with an eligible booking: save, reopen, revise, browser print; verify transport and unauthorized users cannot save and no messages are sent.
4. Customer invoice approval, official numbering, bank details and WhatsApp delivery remain separate, approval-dependent work.

Related backlog: #39 (invoice delivery), #43 (owner alerts), #37 (mobile customer booking).
