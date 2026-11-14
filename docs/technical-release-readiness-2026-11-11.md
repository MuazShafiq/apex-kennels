# Apex customer booking: technical release readiness (2026-11-11)

> **Historical checkpoint.** Since this document was written, a real Turnstile + production Neon synthetic booking passed on 2026-11-13, the gate was closed again, and a saved transport estimate/PDF was verified on 2026-11-14. See [customer booking launch](customer-booking-launch.md) for the remaining owner/mobile/connectivity gates. Preserve the analysis below as the pre-test record; its statements that a live canary has not occurred are no longer current.

## Technical state

- Replacement booking UI, Maps pin/coordinate fallback, responsive cards and staff review screens are implemented. Founder reported real-phone verification of the previously failing two UI cases. This is not evidence that a public booking was submitted on a phone.
- Neon production has **booking_transport_locations**, **booking_whatsapp_consents**, and **invoice_draft_reviews**. Consent table 002 was created additively on development and production on 2026-11-11, verified empty (zero historical customer opt-ins were inferred).
- The public submission handler validates request origin, a bounded JSON body, full care answers, required contact phone, confirmed transport pin, and Turnstile's Siteverify **success + exact hostname + action**. Booking and pin write atomically, with idempotent external IDs. Existing Google Form intake remains separate.
- CI includes a synthetic Chromium browser-to-Worker submission test for **Both** transport and **No transport**, including all eight care answers, optional WhatsApp opt-in, explicit coordinate pin, and the Turnstile validation gate. This uses only in-memory fake persistence and a test-only browser Turnstile stub. It **does not** prove Cloudflare's real widget or live Neon submission.
- Production smoke checks now require public bookings **disabled** until Fatima's final approval, and verify the current booking preview, staff authorization and health endpoints.

## Turnstile (account-level setup, not code)

No Cloudflare account integration is connected to this engineering session, so **widget existence, account domain authorization and Worker secret names cannot be inspected or written here**.

1. In the Cloudflare dashboard, create/reuse a **Managed** Turnstile widget named `Apex Kennels Booking`, restricted to **`apex-kennels-api.muaz-shafiq18.workers.dev`** (hostname only, no scheme/path). Check Cloudflare's actual hostname acceptance in the dashboard rather than assuming it worked.
2. Add `TURNSTILE_SITE_KEY` (public widget identifier) and `TURNSTILE_SECRET_KEY` (private Siteverify credential) to Worker **secrets** using `npx.cmd wrangler secret put NAME`. Never put the private secret in repository, `wrangler.jsonc`, chat or terminal history. The public site key may be held in a secret for consistent deployment.
3. Verify secret **names only** via `npx.cmd wrangler secret list`. Keep `APEX_PUBLIC_BOOKING_ENABLED` **absent/false**. Both keys can be installed while public submissions remain disabled.
4. On a controlled production test after approval, check that `/api/book/config` returns `{enabled:true,siteKey:...}`, the real widget appears and Siteverify succeeds; confirm one explicitly synthetic request is saved with customer pin and care answers, stays marked synthetic, and sends no outbound notification.
5. Only after all tests and **Fatima's explicit final approval of the form, boarding terms and shared transport-gate rule** should the real public booking link replace the Google Form. Keep the old form available as fallback.

**Important:** Cloudflare's published dummy Turnstile keys are valid for test environments only. Their Siteverify success response reports `hostname=example.com` and omits `action`; Apex intentionally rejects this response because it validates both fields. Do not weaken that check to make a test pass.

## Final approval and cutover remains blocked

- Do not set `APEX_PUBLIC_BOOKING_ENABLED=true` or link customers to the replacement form until Fatima approves the exact customer copy/terms and the one-address Pickup + Drop-off flow.
- Real Turnstile widget and live customer-style POST are not independently verified. A successful synthetic browser test is **not** a live launch.
- Production smoke is intentionally configured to fail if somebody enables public bookings prematurely. Update the monitor only as part of an explicitly approved launch.
- WhatsApp delivery, payable invoice issuance and notifications remain disabled/deferred. The new consent table collects opt-in evidence only; it does not authorize sending on its own.
