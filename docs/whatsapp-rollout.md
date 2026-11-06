# Apex WhatsApp rollout

## State

Owner notification code is prepared but disabled. No WhatsApp is sent in production, and no customer invoice approval/send route is implemented yet. The existing Google Form intake remains operational.

## Desired workflow

New Google Form or website booking → saved successfully → WhatsApp alert to Fatima with only the booking reference → private staff review.

After staff booking and pricing checks, Fatima will eventually click **Approve & send invoice** → freeze amount, customer, payment recipient and invoice number → generate customer-safe PDF → send it via approved WhatsApp utility/document template to a customer who opted in → record provider status. Nothing automatically marks payments received.

## Direct Meta Cloud API setup

No WhatsApp Web browser automation or intermediary subscription. Configure the Cloudflare Worker only after proper Meta Business Account onboarding.

Worker variables:
- WHATSAPP_ALERTS_ENABLED: false until live acceptance.
- WHATSAPP_ACCESS_TOKEN: private long-lived Meta token (Secret).
- WHATSAPP_PHONE_NUMBER_ID: registered API sender phone ID.
- WHATSAPP_GRAPH_VERSION: v26.0.
- WHATSAPP_OWNER_PHONE: Fatima's receiving WhatsApp number (Secret).
- WHATSAPP_OWNER_ALERT_TEMPLATE: approved en_US utility template name, one body parameter containing the booking reference only.

Suggested owner template: New Apex boarding request #{{1}}. Open the secure Apex staff dashboard to review it.

On a new saved booking, the Worker requests one template message. Unchanged submissions and synthetic canaries don't notify. Meta returning a message ID means accepted, **not delivered**. The current immediate trigger has no durable retry or status webhook, so DO NOT ENABLE until delivery and failure tracking exist.

Confirm supported WhatsApp Business app coexistence before connecting Apex's existing everyday chat number. Do not migrate it blindly. The API sender and Fatima's recipient number may need to differ.

## Customer invoice sending release gates

1. A durable invoice snapshot and accurate staff approval; prevent duplicate invoice numbers against manually issued Canva invoices.
2. Exact Fatima approver identity through Cloudflare Access and owner authorization. Duplicate click/idempotency protection and failed/ambiguous send handling.
3. Explicit customer consent for booking updates and invoices via WhatsApp. The current Google Form only collects a phone number, which is **not** a sufficient documented WhatsApp opt-in. Add one clear choice to the original Form and store it in booking intake before automatic customer sending; old responses need separately recorded consent.
4. A Meta-approved utility template with invoice PDF document header, document generation from approved snapshot, delivery-status webhook, and a manual retry/repair action. Never send sensitive pet-health notes.
5. Securely configure Fatima's HBL account; do not hardcode private account numbers. Confirm the latest manually issued four-digit invoice number before enabling automated numbering.
6. 30 inclusive billed days qualify for the Rs. 10,000 per-dog package discount: standard 75K → 65K; camera 90K → 80K. Unusual durations require review. Provisional transport is verified driven fuel cost + editable 20% markup.

## Costs and tests

Meta charges per delivered approved template message based on category/recipient country. Direct Meta API avoids intermediary platform charges but does not guarantee free messages. October 2026 Pakistan utility rate estimates are ~US$0.015/message, subject to Meta's current rate card.

Test Fatima's alert consent and a controlled synthetic submission, provider acceptance/delivery status, duplicate submission, and failures. Test customer invoice to a consented test recipient with a real PDF, including double clicks, before enabling production. Do not claim live sending until observed.

Related backlog: #37 mobile Google Maps check and #39 saved approval/invoice sending.
