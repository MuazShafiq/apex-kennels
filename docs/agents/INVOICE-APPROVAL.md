# Implementation handoff: owner invoice approval and WhatsApp PDF delivery

**Engineering update (2026-11-15):** Implementation, additive migrations, synthetic provider/browser tests and disposable local PostgreSQL verification are prepared on `feat/invoice-approval-delivery`. See [operator guide](../invoice-approval-delivery.md) and [shared thread](THREAD.md) for exact PR/check evidence. The baseline below describes the assignment checkpoint; it is not a claim that this branch has been deployed. All production activation prerequisites remain explicit release gates.

**Assigned coding agent:** `cdx-74` (secondary Codex). **Repo:** Apex Kennels. **Tracking:** GitHub issue #39; notification alert integration #43 is a separate lane.

**Goal:** Implement a production-quality, behind-flags **invoice approval and customer WhatsApp PDF delivery system** that Fatima can eventually operate with minimal manual work. Do not enable or deploy financial/customer-message functionality before explicit release approvals and live provider credentials. This task is code, tests, and a reviewable PR first.

## Current verified baseline

- Cloudflare Worker with Neon Postgres; staff access protected by Cloudflare Access + Worker audience/email allowlist.
- Saved review-only estimates are versioned in `invoice_draft_reviews`. `/staff/draft`, `/staff/transport`, and `/staff/draft/saved.pdf` exist.
- The saved synthetic 3-day review priced boarding PKR 7,500, transport PKR 6,637, total PKR 14,137 (with physical driving access unverified). PDF fix merged in PR #66; **it is not payable**.
- The old Google Form remains live; public `/book` submissions are disabled. Do not touch these gates.
- Meta Cloud API owner-alert adapter exists, disabled. No approved customer-document template, sender setup, delivery webhook, or durable retry is verified. Phone number alone is **not WhatsApp consent**.
- Fatima is the intended invoice approver and HBL payment recipient. Her exact owner identity, bank secret, latest issued 4-digit invoice number and Meta assets are not present in a verified go-live configuration here. Do not invent them.

## Engineering sequence (implement; keep disabled by default)

1. **Inspect actual code and DB schema first.** Work on a feature branch / isolated worktree, preserve existing local stash and any uncommitted changes, and use `AGENTS.md` plus this handoff. Update relevant docs when source changes.
2. **Approval state machine and persisted snapshot:** design additive Neon migration for a private invoice lifecycle with draft revision/optimistic locking, exact approver, immutable customer-safe monetary and payment snapshot, timestamps, status transitions, and unambiguous failure/idempotency states. Distinguish internal review from approved, issued, queued, provider-accepted, delivered, failed, and ambiguous. Retain audit evidence without exposing care notes. Never treat provider acceptance as delivery.
3. **Staff-only approval UI:** owner-only action and reauthentication-derived identity, not client-supplied email; validate recent draft revision, pricing completeness, route verification, invoice number uniqueness against manually issued Canva sequence, and presence of Fatima's *securely configured* HBL payment details. Block unresolved transport, unusual package eligibility, unverified real road access, missing consent and synthetic records from **customer delivery**. Build accessible, restrained mobile UI with explicit review/confirmation. Default approval/issuance disabled until configured.
4. **Customer-safe PDF:** reuse the repaired Canva template. Generate an immutable PDF from the exact approved snapshot, not a recalculated draft; include correct number and payment details only when authorized/configured. Keep internal draft PDFs distinct, with non-payable labels until approved. Avoid the prior blank-page and offset defects; add regression tests that assert actual PDF text placement/content.
5. **Official WhatsApp Cloud API transport:** direct Meta provider behind a separate disabled-by-default send flag. Persist one durable outbox intent per approved invoice and recipient/consent, safely handle duplicate clicks/webhooks/retries/ambiguous HTTP outcomes, verify webhook signatures, store provider IDs and delivery/failure statuses. Use a Meta-approved utility template with document header; ensure opt-in is purpose-specific and timestamped. Never expose internal medical/care information or private URLs in messages. A provider fake is mandatory for tests; do not contact live recipients.
6. **Operational resilience:** make failure visible to Fatima, with bounded manual repair/retry and an audit trail. Do not auto-mark paid. Keep current Google Form intake, booking protection, review-only routes, and owner alert lane working independently.
7. **Verification:** tests covering unauthorized approver, expired/modified review revision, concurrent approvals, duplicate invoice numbers, disabled flags, missing bank details/opt-in, fake Meta failures and webhook replay, distinct fuel snapshots, and PDF correctness. Run Node 22/24 CI, typecheck, Worker dry-run and responsive staff UI tests where changed. Dev-only migration verification; do not apply production schema or send messages as part of the coding task.

## Milestone acceptance and release boundary

- Produce a focused PR with implementation, additive migration, test output, and a short operator enablement checklist.
- Production approval/sending flags remain **OFF**. Existing Google Form intake, public booking gate and legacy staff workflow remain unaffected.
- Explicit unresolved owner steps: confirm exact Fatima Access identity, current manually issued invoice number, HBL secret configuration, template and Meta sender approval, documented customer WhatsApp consent, physical transport-gate validation.
- Do not fabricate a successful real send or a certified payable invoice. Do not add a paid intermediary, migrate Fatima's existing WhatsApp number, or create WhatsApp marketing campaigns.
- Update [shared thread](THREAD.md) with PR, exact evidence, open blockers, and handoff to the next agent, without raw secrets.

Reference: `docs/whatsapp-rollout.md`, `docs/fatima-handoff.md`, `docs/staff-saved-reviews.md`, `docs/approved-invoice-rules-2026-11-05.md`, `src/whatsapp-cloud.ts` and `src/staff-saved-review.ts`.
