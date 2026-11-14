# Owner invoice approval and PDF delivery

**Engineering status (2026-11-15):** The approval, issuance and delivery code merged in PR #74 and is included in the main Worker deployment recorded after PR #75. This confirms code deployment only. No production migration, financial activation, live Meta onboarding or real WhatsApp send is evidenced by this document. Recheck current deployment, remote flags and Neon schema before release work. See [current release readiness checklist](production-release-readiness-2026-11-15.md) and [shared thread](agents/THREAD.md).

## Owner workflow

Save a complete boarding/transport estimate, then follow **Owner approval** from the boarding or transport screen. Only the exact configured owner who also passes the existing staff allowlist can access `/staff/invoices/*`. Every mutation additionally requires a cryptographically verified Access assertion issued within five minutes. An old/missing assertion returns 403; complete the application's Access sign-in again. Configure an appropriate short Access application/session policy at release; assertion issuance time is the application check, not proof of a particular identity-provider MFA event.

The page shows the saved revision, line items, payment-recipient title/account suffix and transport evidence. Select a four-digit number above the confirmed manual floor and every number already reserved by either invoice table. Approval is serialized and locks the saved revision and current source records. Reviews and transport/fuel retrievals older than 24 hours require refresh; current notified fuel provenance/effective date is checked separately. Exactly 30 billed days may use the selected existing package. No custom prices, tolls or discounts are introduced.

Transport requires explicit owner verification of the actual kennel/Bawli/customer driving access and fuel/exception checks. Website locations must still match the exact current confirmed pins and service. Legacy Form requests can use the existing staff-confirmed numeric gate workflow; its provenance is frozen, and any customer-location record added afterward invalidates that saved review. No customer location is invented, inserted or overwritten. Old transport snapshots missing service/provenance must be saved again.

**Approve snapshot** freezes an internal approval. **Approve, issue & send**, shown only when all three gates are on for a non-synthetic booking, also requires explicit purpose-specific invoice-PDF WhatsApp consent, timestamp and evidence reference. A historical phone number or generic booking-update preference is not sufficient. The usual combined action approves, renders from that exact snapshot, atomically stores the issued PDF and delivery intent, then dispatches. Synthetic approvals remain internal and cannot be issued or sent. There is no paid state or payment collection.

## Persistence and recovery

- `approved_invoices`: one immutable approval per booking and unique four-digit number; frozen customer/pricing/transport/payment/consent/actor evidence. Issuance writes the original PDF bytes and SHA-256 once. Downloads and delivery read those bytes; later draft edits or payment configuration changes do not rewrite them.
- `invoice_approval_audit`: append-only approval and issuance actions.
- `invoice_delivery_outbox`: one immutable recipient/consent intent per issued invoice. States are `queued`, `sending`, `provider_accepted`, `delivered`, `failed`, `ambiguous`. Acceptance is not delivery.
- `invoice_delivery_events` and `invoice_delivery_audit`: minimal signed-provider status evidence, replay keys and operator actions. No raw webhook, medication or care notes are retained. New tables enable RLS without public policies; use only the private Worker database role.

Combined delivery intent is frozen at approval. If rendering/issuance is interrupted, **Continue approved delivery** resumes the approved intent under the same gates. PDF, issuance audit, outbox and queued audit commit together; a failure rolls them back together. If the process stops after that transaction, **Resume queued delivery** claims the saved intent. Recovery is explicitly owner-operated; there is no unbounded automatic retry or scheduled sender.

Concurrent dispatchers can claim a queued item once. A crash while sending never authorizes a resend. After two minutes, unresolved `sending` can be reconciled. Network timeouts, server errors, malformed acceptance or unstructured HTTP failures are ambiguous. Only an explicit structured Meta client rejection or a media-upload failure permits a separate manual retry, with three total attempts. A provider-accepted failure cannot be retried through this control.

For ambiguous outcomes, check Meta records first. Record either the confirmed provider message ID or definite evidence that no customer message was sent, plus a short evidence reference. Do not paste credentials or medical notes. **Save reconciliation** never sends; confirmed non-send permits a subsequent bounded retry. Provider-ID recovery applies any earlier signed callbacks. Delivered/read evidence wins over late acceptance/failure; duplicate callbacks do not duplicate audit effects. Refresh the page to see current state. Never use another channel while the outcome is unknown.

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
| `APEX_INVOICE_WEBHOOK_SECRET` | Secret Meta app secret for exact-byte `X-Hub-Signature-256` HMAC verification. |
| `APEX_INVOICE_WEBHOOK_VERIFY_TOKEN` | Separate secret subscription verification token. |

Only `/api/invoice-delivery/webhook` is public. GET handles Meta subscription verification; POST bounds the raw body to 256 KiB, verifies its signature and matches the configured sender ID before processing statuses. Invalid signatures fail closed. Database failures return 503 so Meta can retry. Callbacks remain processable while outbound sending is disabled.

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
