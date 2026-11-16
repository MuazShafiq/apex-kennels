# Owner invoice approval and PDF delivery

**Engineering status (2026-11-15):** The approval, issuance and delivery code merged in PR #74 and is included in the main Worker deployment recorded after PR #75. This confirms code deployment only. Production migrations 004–006 were subsequently applied and read back in issue #39; migration 007 for the correction ledger remains unapplied. Financial activation, live Meta onboarding and real WhatsApp sends are not authorized or evidenced here. Recheck current deployment, remote flags and Neon schema before release work. See [current release readiness checklist](production-release-readiness-2026-11-15.md) and [shared thread](agents/THREAD.md).

**Synthetic safety (2026-11-16):** Owner alerts, staff views, saved reviews, locked approval revalidation and payable PDF generation share the same conservative marker rules: customer prefixes `APEX CANARY`, `SYNTHETIC` or `TEST ONLY`, pet marker `APEX SYNTHETIC CANARY`, or source ID prefix `apex-cf-smoke-`, without case sensitivity. An explicit false flag cannot clear a name marker. Older name-marked saved/approved snapshots are interpreted as synthetic without rewriting stored JSON or monetary values. A source-ID-only marker is checked against the current locked booking at approval and frozen in the approved flag; this does not repair a hypothetical already-approved false snapshot that contains no marker except an external source ID absent from the snapshot. The measured production catalog has no approval tables/rows yet; do not infer a general historical repair or backfill. Synthetic records remain non-payable and ineligible for invoice delivery.

## Owner workflow

Save a complete boarding/transport estimate, then follow **Owner approval** from the boarding or transport screen. Only the exact configured owner who also passes the existing staff allowlist can access `/staff/invoices/*`. Every mutation additionally requires a cryptographically verified Access assertion issued within five minutes. An old/missing assertion returns 403; complete the application's Access sign-in again. Configure an appropriate short Access application/session policy at release; assertion issuance time is the application check, not proof of a particular identity-provider MFA event.

The page shows the saved revision, line items, payment-recipient title/account suffix and transport evidence. Select a four-digit number above the confirmed manual floor and every number already reserved by either invoice table. Approval is serialized and locks the saved revision and current source records. Reviews and transport/fuel retrievals older than 24 hours require refresh; current notified fuel provenance/effective date is checked separately. Exactly 30 billed days may use the selected existing package. Calculated defaults follow the confirmed pricing rules. Before approval, the exact owner may edit any final line or discount, including adding, deleting and reordering generated lines. The saved owner override retains the canonical source quote separately; route/fuel evidence is never rewritten to justify an edited price.

Transport requires explicit owner verification of the actual kennel/Bawli/customer driving access and fuel/exception checks. Website locations must still match the exact current confirmed pins and service. Legacy Form requests can use the existing staff-confirmed numeric gate workflow; its provenance is frozen, and any customer-location record added afterward invalidates that saved review. No customer location is invented, inserted or overwritten. Old transport snapshots missing service/provenance must be saved again.

**Approve snapshot** freezes an internal approval. **Approve, issue & send**, shown only when all three gates are on for a non-synthetic booking, also requires explicit purpose-specific invoice-PDF WhatsApp consent, timestamp and evidence reference. A historical phone number or generic booking-update preference is not sufficient. The usual combined action approves, renders from that exact snapshot, atomically stores the issued PDF and delivery intent, then dispatches. Synthetic approvals remain internal and cannot be issued or sent. There is no paid state or payment collection.

## Owner-edited drafts

The owner review offers labelled rows for descriptions, positive whole quantities and non-negative whole PKR unit prices, with independently editable discounts. The live preview shows every final row, exact total and variance from the calculated source. Add/delete/reorder, undo local changes, reset to calculated defaults, save/reopen and undo the last saved edit are available. JavaScript is required for editing; the existing saved PDF remains available without it. Failed saves preserve entered rows and focus an accessible error summary. Approval buttons remain blocked while local edits are unsaved.

The server accepts only rows/discounts and the expected revision, recalculates all arithmetic and rejects unsafe/unsupported text, negative payable totals, integer overflow, more than 60 lines/20 discounts and oversized requests. Client amounts/totals never establish pricing proof. Zero-price items and empty zero-total final invoices are supported. Source boarding/package/transport calculations remain canonical and are compared to the locked current booking at approval. Saving a recalculated staff estimate cannot silently discard owner changes: the owner must first save a reset in owner review. The snapshot retains the most recent 20 owner audit entries (actor, time, revision, action and total), rather than a complete historical ledger.

The same owner Access allowlist, fresh signed JWT and same-origin restrictions protect edits and correction actions. Edits and approvals serialize using the same transaction lock and saved-review revision. Once approved, the snapshot cannot be edited. Later petrol changes never reprice an approved advance invoice, and issuance/download use the frozen amount and stored PDF.

## Controlled corrections

An approved or issued record remains immutable. The exact owner can record either cancellation of future issuance/delivery or a **manual Canva replacement**, with a concise reason. A replacement requires its own unused four-digit number and a private evidence reference; the record reserves that number against later automated approvals. It does not generate a replacement PDF, refund, payment state or customer message. Retain the original and separately prepared manual replacement under their distinct numbers, verify the recipient and replacement evidence, then record the correction. No customer communication is authorized by this engineering workflow.

Sending or ambiguous delivery must be reconciled against Meta before correction can be recorded. A recorded correction blocks subsequent issuance, enqueue, claim and retry of the original. Provider-accepted or delivered messages cannot be recalled; correction does not pretend otherwise, and signed callbacks still record actual delivery evidence. The owner page displays the correction actor, time, reason and external replacement reference alongside the unchanged original. Correction records are append-only, one per original invoice; changing an already recorded correction requires a separately reviewed recovery procedure, never direct modification.

The additive `007_invoice_corrections.sql` migration is a separate production release prerequisite. Deploying this code does not apply it or activate any financial/customer gate.

## Persistence and recovery

- `approved_invoices`: one immutable approval per booking and unique four-digit number; frozen customer/pricing/transport/payment/consent/actor evidence. Issuance writes the original PDF bytes and SHA-256 once. Downloads and delivery read those bytes; later draft edits or payment configuration changes do not rewrite them.
- `invoice_approval_audit`: append-only approval and issuance actions.
- `invoice_delivery_outbox`: one immutable recipient/consent intent per issued invoice. States are `queued`, `sending`, `provider_accepted`, `delivered`, `failed`, `ambiguous`. Acceptance is not delivery.
- `invoice_delivery_events` and `invoice_delivery_audit`: minimal signed-provider status evidence, replay keys and operator actions. No raw webhook, medication or care notes are retained. New tables enable RLS without public policies; use only the private Worker database role.

Combined delivery intent is frozen at approval. If rendering/issuance is interrupted, **Continue approved delivery** resumes the approved intent under the same gates. PDF, issuance audit, outbox and queued audit commit together; a failure rolls them back together. If the process stops after that transaction, **Resume queued delivery** claims the saved intent. Recovery is explicitly owner-operated; there is no unbounded automatic retry or scheduled sender.

Concurrent dispatchers can claim a queued item once. A crash while sending never authorizes a resend. After two minutes, unresolved `sending` can be reconciled. Network timeouts, server errors, malformed acceptance or unstructured HTTP failures are ambiguous. Only an explicit structured Meta client rejection or a media-upload failure permits a separate manual retry, with three total attempts. A provider-accepted failure cannot be retried through this control.

For ambiguous outcomes, check Meta records first. Record either the confirmed provider message ID or definite evidence that no customer message was sent, plus a short evidence reference. Do not paste credentials or medical notes. **Save reconciliation** never sends; confirmed non-send permits a subsequent bounded retry. Provider-ID recovery applies any earlier signed callbacks. Acceptance, provider-ID reconciliation and callbacks share a transaction lock so overlapping commits cannot lose delivery evidence. Delivered/read evidence wins over late acceptance/failure; duplicate callbacks reapply retained evidence without duplicate audit effects. Refresh the page to see current state. Never use another channel while the outcome is unknown.

## Runtime configuration (all gates off by default)

| Setting | Purpose |
| --- | --- |
| `APEX_INVOICE_APPROVAL_ENABLED` | Exact `true` enables the owner workflow. |
| `APEX_INVOICE_ISSUANCE_ENABLED` | Separate exact `true` permits payable PDF issuance. |
| `APEX_INVOICE_WHATSAPP_ENABLED` | Separate exact `true` permits customer dispatch. |
| `APEX_INVOICE_OWNER_EMAIL` | Exact confirmed Fatima Access identity, also in `STAFF_ALLOWED_EMAILS`. |
| `APEX_INVOICE_BANK_JSON` | Secret JSON with `bank` equal to `HBL`, `accountTitle`, `accountNumber`, `iban`. Configure privately; never commit real values. |
| `APEX_INVOICE_MANUAL_NUMBER_FLOOR` | Confirmed latest manually issued four-digit Canva number. No default/seed is assumed. |
| `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_GRAPH_VERSION` | Official Meta credentials/sender and a supported explicitly configured API version; shared adapter configuration, independent enablement. |
| `APEX_INVOICE_WHATSAPP_TEMPLATE`, `APEX_INVOICE_WHATSAPP_LANGUAGE` | Approved utility template: document header, exactly one body text parameter (invoice number). Language defaults to `en_US`. |
| `WHATSAPP_WEBHOOK_SECRET` | Secret Meta app secret for exact-byte `X-Hub-Signature-256` HMAC verification on the shared callback. |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Separate unpredictable secret subscription verification token for the shared callback. |
| `APEX_INVOICE_WEBHOOK_SECRET`, `APEX_INVOICE_WEBHOOK_VERIFY_TOKEN` | Legacy invoice-only callback configuration; optional when using the shared callback. |

The shared callback is implementation readiness, not evidence of live subscription or delivery; verify deployed support before any separately authorized configuration. Configure one Meta app callback at `/api/whatsapp/webhook` to process both invoice and owner-alert statuses. Set its dedicated `WHATSAPP_WEBHOOK_SECRET` to that app's signing secret, its `WHATSAPP_WEBHOOK_VERIFY_TOKEN` to a separate unpredictable verification token, and `WHATSAPP_PHONE_NUMBER_ID` to the registered sender. No signing-secret/token fallback to the legacy lanes occurs. Database, signing secret (at least 20 characters), verification token and valid sender configuration are required even with sending disabled; incomplete configuration returns 503.

GET handles subscription verification; POST bounds the raw body to 256 KiB, verifies the exact-byte signature and parses only statuses for the configured sender. Other senders/inbound message content are ignored. The shared endpoint passes the same minimal events to both existing replay-safe stores, without outbound provider calls. Either store's failure returns 503 so Meta can retry; one lane may already have committed, and replay deduplicates it while completing the other. Migrations 004â€“006 must be ready before subscribing the shared callback, including both stores and their dependencies. Owner-only installations without invoice tables can retain the legacy owner endpoint. Callbacks continue with every send, approval and issuance gate off; preserve receipt configuration and tables when disabling sending.

The independent `/api/invoice-delivery/webhook` and `/api/owner-alerts/webhook` routes remain available for separate Meta apps/subscriptions with their existing lane-specific secrets/tokens. A single app's default callback can use the shared route directly; no external fanout is needed. Meta's per-WABA callback override selects a callback for that subscription; it does not automatically send the same statuses to two arbitrary URLs. See [callback setup](whatsapp-rollout.md).

PDFs reuse the original Canva template and embedded Latin font. Unsupported text or overlong fields fail closed rather than overlap, omit glyphs or send a broken document. An already approved unsupported name may require a renderer/font fix; it must not be silently rewritten. Customer messages upload the stored PDF as private Meta media, then reference its media ID in the template; no public/private staff document URL is sent.

## Verification and release checklist

The code includes domain/request tests, decoded PDF text/coordinate regressions, fake Meta tests, a loopback-only PostgreSQL transaction checker, and synthetic browser checks. Neither provider fakes nor local PostgreSQL verify live Access, Neon, Meta template approval or actual delivery.

For the database checker, install `pg@8.16.3` temporarily with `--no-save --package-lock=false`, explicitly set `INVOICE_TEST_POSTGRES_URL` to a disposable loopback PostgreSQL `/postgres` admin connection, and run `node --experimental-strip-types scripts/check-invoice-db.mjs`. It rejects remote hosts/query overrides, creates a uniquely named local database and retains it for inspection. It never reads `DATABASE_URL` or connects to Neon. CI runs it with disposable PostgreSQL on Node 22 and 24.

Before any separately authorized release:

1. Confirm exact owner Access identity/session policy, current manual Canva number and secure HBL recipient. Coordinate or stop simultaneous manual Canva issuance; the system cannot discover offline manual invoices.
2. Review additive migrations `004_invoice_approval.sql` and `005_invoice_delivery.sql`; validate them on an identified development Neon branch before authorizing production application. Never rerun `db/schema.sql` against an existing database.
3. Confirm Meta sender/template/language/version and billing approval, signed webhook subscription, documented invoice-PDF consent and transport road/fuel checks. No migration of the everyday WhatsApp number is implied.
4. Inspect actual deployed Worker identity and remote configuration (`keep_vars` preserves settings). Keep all three gates absent/false until release approval. Keep public booking and owner-alert gates independent and unchanged.
5. Under separate explicit test authorization, verify live Access owner/reauthentication, issued PDF, duplicate protection, provider acceptance, signed delivered/failed callbacks and recovery with a consented test recipient. No real customer should receive a synthetic test.
6. To stop new financial/customer actions, disable the respective gates (or the approval workflow gate). Outbound disablement cannot recall an already submitted message. Preserve callback processing and audit records; reconcile in-flight work before re-enabling. Recheck Google Form intake, anonymous staff denial and closed public booking using the existing production checker.

Official contract references used for the adapter: [Meta WhatsApp Cloud API collection](https://www.postman.com/meta/whatsapp-business-platform/collection/wlk6lh4/whatsapp-cloud-api), [Meta webhook validation](https://developers.facebook.com/docs/graph-api/webhooks/getting-started/). These support implementation shape/signature checks, not a claim of successful live sending.
