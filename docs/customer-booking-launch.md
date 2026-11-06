# Customer boarding site: preview-first release

## State
The customer booking site lives at `/book` on the **existing** Apex Cloudflare Worker. It replaces the repeated request for a Google Maps pin by collecting the exact pickup/drop-off point during booking. The legacy Google Form and its hourly recovery remain operational and separate.

**Default: preview-only, not accepting submissions.** No payment, invoice, booking approval, customer notification, or outbound WhatsApp message runs from this feature. PR #29 is an implementation, not Fatima's approval of the form design or terms.

## User journey
1. Customer enters owner, dates, dog, health, emergency, and care details, matching the current mapped Form.
2. Chooses whether camera cage and transport are requested. If transport: picks pickup, drop-off, or both at the same gate; taps/drags a pin on the OpenFreeMap map or uses opt-in device location; explicitly confirms the entrance.
3. Completes the Cloudflare Turnstile challenge and submits.
4. The Worker verifies the exact origin, JSON/body size, all booking answers and confirmed coordinates, and calls Turnstile Siteverify. Turnstile **hostname** and **action** must match.
5. A single Neon transaction saves the booking, original care information, and private confirmed pin. Existing staff booking queue and `/staff/booking` show it under Cloudflare Access. No amount is charged automatically.

## Setup, in order
1. Review the preview (not an active customer channel): update and deploy the Worker from the latest main, and open `https://apex-kennels-api.muaz-shafiq18.workers.dev/book`. Submission stays disabled with no flag.
2. Owner reviews the exact public copy and **actual boarding terms**. Before accepting real submissions, the terms must be linked or shown in full. Current preview assumes the existing terms but does not publish them; do not launch with an inaccessible terms checkbox.
3. Apply the **additive** table migration `migrations/20261106_customer_transport_locations.sql` to production Neon. First tested on existing Neon `local-development` branch. Do not touch existing customer rows, intake flags, or historical Google Form entries.
4. In Cloudflare Turnstile, create a site widget scoped to the actual Worker hostname. Store the **public** widget key as `TURNSTILE_SITE_KEY` and the private server validation key as `TURNSTILE_SECRET_KEY` in Worker secrets. Do not place the private key in code or customer HTML.
5. Only after tests and Fatima's approval, set `APEX_PUBLIC_BOOKING_ENABLED=true` in the Worker environment and redeploy. `GET /api/book/config` returns `{enabled:false}` until that flag and both Turnstile keys and `DATABASE_URL` are present.
6. Make one explicitly synthetic test booking through the real new form, confirm the booking and its pin in authenticated staff detail, and verify `/api/health` and the original Form intake remain operational. Never send an invoice or customer message for the test.
7. Finally switch the customer-facing booking link from the existing Google Form to `/book`. Keep Google Form as a fallback until the replacement is independently verified.

## Operational boundaries
- OpenFreeMap supplies the interactive map tiles without another account or API key. It is free for commercial usage with required OpenStreetMap/OpenMapTiles attribution, but has no service-level guarantee. Device geolocation is **optional** and explicitly permissioned.
- This is a **customer-selected location**, not independently proven vehicle access. Geoapify route and petrol baseline calculation are already separate, review-only modules. Do not quote transport until the kennel entrance, Bawli access waypoint, correct pickup/drop-off legs, and Fatima's profit interpretation are confirmed.
- Public `/api/book` cannot accept Google Form webhook requests; `/api/ingest` still requires its existing bearer token and only accepts `source='google_form'`.
- No public endpoint exposes individual bookings or animal-care records. /staff* remains protected behind Cloudflare Access.
- If the new table hasn't been created yet, existing staff booking details still work and simply omit the new location section. The public submission endpoint must remain disabled.
- No email is required for new customers because current Form submissions have only phone contacts. No mailing platform is added.

## Known release gaps
- Confirm owner-facing terms copy/link, existing Form's consent semantics, and whether pickup/drop-off can use different addresses in the same booking. The MVP supports one gate, clearly described.
- Review the responsive form in a real browser and test manual point selection, location permissions, and the Turnstile challenge before enabling.
