# Apex WhatsApp rollout

## State

Durable owner notification code is implemented but disabled; implementation is not proof of deployment or live delivery. See [owner alert engineering handoff](agents/OWNER-ALERTS.md). Customer invoice approval, immutable PDFs, a durable delivery outbox and signed status webhooks are implemented behind separate disabled-by-default gates; see [invoice operator guide](invoice-approval-delivery.md). This engineering change is not deployed or live-provider verification. The existing Google Form intake remains operational.

## Desired workflow

New Google Form or website booking → saved successfully → WhatsApp alert to Fatima with only the booking reference → private staff review.

After staff booking and pricing checks and an authorized release, Fatima can click **Approve, issue & send** → freeze amount, customer, payment recipient, invoice number and explicit consent → generate customer-safe PDF → atomically persist issued PDF and outbox → send via approved WhatsApp utility/document template → record provider status. Approval-only and separate issuance remain available. Nothing automatically marks payments received.

## Direct Meta Cloud API setup

No WhatsApp Web browser automation or intermediary subscription. Configure the Cloudflare Worker only after proper Meta Business Account onboarding.

Worker variables:
- WHATSAPP_ALERTS_ENABLED: false until live acceptance.
- WHATSAPP_ACCESS_TOKEN: private long-lived Meta token (Secret).
- WHATSAPP_PHONE_NUMBER_ID: registered API sender phone ID.
- WHATSAPP_GRAPH_VERSION: v26.0.
- WHATSAPP_OWNER_PHONE: Fatima's receiving WhatsApp number (Secret).
- WHATSAPP_OWNER_ALERT_TEMPLATE: approved en_US utility template name, one body parameter containing the booking reference only.
- WHATSAPP_OWNER_EMAIL: exact owner Access identity, also present in STAFF_ALLOWED_EMAILS. This is independent of the invoice owner setting.
- WHATSAPP_OWNER_CONSENT_AT: explicit owner booking-alert opt-in time (ISO timestamp, not a future date).
- WHATSAPP_OWNER_CONSENT_EVIDENCE: bounded consent evidence reference (protected configuration, no private contact/health data).
- WHATSAPP_ALERT_WEBHOOK_SECRET: Meta app signing secret (Secret).
- WHATSAPP_ALERT_WEBHOOK_VERIFY_TOKEN: separate unpredictable subscription verification token (Secret).

Never put real numbers, identities, tokens or evidence in Git. Configured sender/recipient/template/consent are frozen in each enrolled alert; a later configuration change does not redirect old alerts.

Suggested owner template: New Apex boarding request #{{1}}. Open the secure Apex staff dashboard to review it. Include an approved static link to the private `/staff` dashboard in the Meta template; the sole body parameter remains the booking reference. Access protection must cover `/staff*`, including `/staff/owner-alerts*`.

New eligible bookings enroll an immutable alert intent in the same transaction as the booking, only while sending is enabled and consent/configuration are valid. After commit the Worker dispatches without affecting booking success. The five-minute scheduled handler recovers undispatched intents. Unchanged submissions, existing bookings and synthetic canaries do not enroll; there is no activation backfill. Apply migration 006 before configuring enablement. With alerts disabled/absent, legacy intake has no dependency on the new tables.

Meta returning a message ID means accepted, **not delivered**. The independent `/api/owner-alerts/webhook` endpoint verifies the GET subscription token and exact POST HMAC, parses only statuses for the configured sender and persists minimal replay-safe evidence. It remains available while sending is disabled. If the same Meta app also handles invoice callbacks, configure provider subscription routing to deliver the relevant statuses to both independent lanes; do not assume Meta calls two arbitrary URLs automatically.

Only explicit Graph client rejections retry automatically (five-minute delay, three attempts total). Unknown outcomes and claims stuck for two minutes become ambiguous and never automatically resend. `/staff/owner-alerts` lists unresolved records first, pages all results and supports full booking-ID lookup. For ambiguous outcomes, record either the verified provider ID or confirmed-not-sent evidence; only the latter permits a separate retry. For provider-accepted alerts missing status beyond 24 hours, inspect Meta and record a verified terminal status with evidence. Do not infer delivery from elapsed time. Exhausted attempts and provider-ID-bound failures require investigation; no new intent or resend bypass exists.

### Release and recovery checklist

1. Keep `WHATSAPP_ALERTS_ENABLED` false/absent and all public-booking/invoice/customer-message gates closed. Review migration 006 on an identified **development Neon branch**, including RLS, claim concurrency, replay and callback overlap; use no production data. Local PostgreSQL CI does not replace this release check.
2. Preserve BOTH existing regular Apex customer-chat and Fatima personal-receiving accounts. Prepare a separate Meta Cloud API sender; never migrate either existing account in this task. Confirm official onboarding, template approval/static private staff link, secret recipient, explicit owner purpose-specific opt-in, and exact owner Access identity.
3. Verify webhook subscription/signature rejection and disabled-send behavior. Confirm scheduled Worker trigger exists after authorized deployment; local config alone is not deployed trigger evidence.
4. Before enabling for any separately authorized controlled test, plan disabling the send flag and ensure the operator can change it. Use consented synthetic test data under an explicitly approved test procedure; existing canary markers intentionally suppress alerts. Do not weaken that suppression or contact customers to manufacture proof.
5. Observe one new Form booking saved, one intent, provider acceptance **and** delivered callback, private staff link/auth, unchanged replay with no extra send, definite failure/retry, and ambiguous recovery. Record actual branch/deployment/provider evidence without private data. No live delivery is currently verified.
6. Disable `WHATSAPP_ALERTS_ENABLED` immediately after the scoped test, including on failure. Disabling stops enrollment and request/cron dispatch; it does not erase already accepted Meta messages or their callbacks. Queued intents are retained and may send when re-enabled with matching configuration; inspect/reconcile pending work before re-enabling. Do not silently backfill or redirect intents after consent/sender changes.
7. Verify closed booking configuration and rejected public POST, health, anonymous staff denial, intake authentication continuity, and `scripts/check-production.mjs`. Do not enable public bookings for alert testing; existing authenticated Google Form intake is sufficient. Monitor low-volume costs and overdue/ambiguous/failed states before any subsequent launch approval.

The owner clarified in issue #43: use a **separate API sending number** and keep both existing regular WhatsApp accounts intact. Account conversion evaluation is a separate, low-priority issue #46.

## Customer invoice sending release gates

1. A durable invoice snapshot and accurate staff approval; prevent duplicate invoice numbers against manually issued Canva invoices.
2. Exact Fatima approver identity through Cloudflare Access and owner authorization. Duplicate click/idempotency protection and failed/ambiguous send handling.
3. Explicit customer consent for booking updates and invoices via WhatsApp. The current Google Form only collects a phone number, which is **not** a sufficient documented WhatsApp opt-in. Add one clear choice to the original Form and store it in booking intake before automatic customer sending; old responses need separately recorded consent.
4. A Meta-approved utility template with invoice PDF document header, document generation from approved snapshot, delivery-status webhook, and a manual retry/repair action. Never send sensitive pet-health notes.
5. Securely configure Fatima's HBL account; do not hardcode private account numbers. Confirm the latest manually issued four-digit invoice number before enabling automated numbering.
6. Exactly 30 inclusive billed days may use the staff-selected Rs. 10,000 per-dog package discount: standard 75K → 65K; camera 90K → 80K. Unusual durations require review. Transport uses verified driven fuel cost + the fixed confirmed 20% markup, with actual road access and current local fuel reviewed by the owner.

## Costs and tests

Meta charges per delivered approved template message based on category/recipient country. Direct Meta API avoids intermediary platform charges but does not guarantee free messages. October 2026 Pakistan utility rate estimates are ~US$0.015/message, subject to Meta's current rate card.

Test Fatima's alert consent and a controlled synthetic submission, provider acceptance/delivery status, duplicate submission, and failures. Test customer invoice to a consented test recipient with a real PDF, including double clicks, before enabling production. Do not claim live sending until observed.

Related backlog: #37 mobile Google Maps check and #39 saved approval/invoice sending.
