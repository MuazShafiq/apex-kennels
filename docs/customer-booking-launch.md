# Customer boarding site: preview-first release

## State
The customer booking site lives at `/book` on the **existing** Apex Cloudflare Worker. It replaces the repeated request for a Google Maps pin by collecting the exact pickup/drop-off point during booking. The legacy Google Form and its hourly recovery remain operational and separate.

**Default: preview-only, not accepting submissions.** Founder reports desktop link-location flow working. Real-phone verification is still pending in [issue #37](https://github.com/MuazShafiq/apex-kennels/issues/37). No payment, invoice, booking approval, customer notification, or outbound WhatsApp message runs from this feature. PR #29 is an implementation, not Fatima's approval of the form design or terms.

## User journey
1. Customer enters owner, dates, dog, health, emergency, and care details, matching the current mapped Form.
2. Chooses whether camera cage and transport are requested. If transport is requested: customer chooses pickup, drop-off, or both at the same address. They either tap **Use my current location**, or open Google Maps, find/drop their entrance pin, choose **Share → Copy link** and paste the share link back into Apex. The Worker extracts an explicit pin; no external search engine is embedded in the booking page.
3. Completes the Cloudflare Turnstile challenge and submits.
4. The Worker verifies the exact origin, JSON/body size, all booking answers and confirmed coordinates, and calls Turnstile Siteverify. Turnstile **hostname** and **action** must match.
5. A single Neon transaction saves the booking, original care information, and private confirmed pin. Existing staff booking queue and `/staff/booking` show it under Cloudflare Access. No amount is charged automatically.

## Setup, in order
1. Review the preview (not an active customer channel): update and deploy the Worker from the latest main, and open `https://apex-kennels-api.muaz-shafiq18.workers.dev/book`. Submission stays disabled with no flag.
2. Owner reviews the exact public copy and **actual boarding terms**. Before accepting real submissions, the terms must be linked or shown in full. The six owner-provided clauses are displayed in an expandable terms section; Fatima should review the exact legal wording before activation.
3. Apply the **additive** table migration `migrations/20261106_customer_transport_locations.sql` to production Neon. First tested on existing Neon `local-development` branch. Do not touch existing customer rows, intake flags, or historical Google Form entries.
4. In Cloudflare Turnstile, create a site widget scoped to the actual Worker hostname. Store the **public** widget key as `TURNSTILE_SITE_KEY` and the private server validation key as `TURNSTILE_SECRET_KEY` in Worker secrets. Do not place the private key in code or customer HTML.
5. Only after tests and Fatima's approval, set `APEX_PUBLIC_BOOKING_ENABLED=true` in the Worker environment and redeploy. `GET /api/book/config` returns `{enabled:false}` until that flag and both Turnstile keys and `DATABASE_URL` are present.
6. Make one explicitly synthetic test booking through the real new form, confirm the booking and its pin in authenticated staff detail, and verify `/api/health` and the original Form intake remain operational. Never send an invoice or customer message for the test.
7. Finally switch the customer-facing booking link from the existing Google Form to `/book`. Keep Google Form as a fallback until the replacement is independently verified.

## Operational boundaries
- Google Maps universal URLs open the installed Maps app or browser without an API key or billing. A normal website cannot receive the place the user selected inside Maps without the user sharing a link. Device geolocation is optional and permissioned. External Maps short links are resolved only through an existing, strict Google-domain allowlist.
- Pickup and drop-off are restricted to the Islamabad–Rawalpindi urban service envelope defined in `src/transport-service-area.ts`. Google Maps share-link resolution, device GPS and server intake enforce it; the envelope is approximate, not an official administrative boundary. Boarding without transport remains available regardless of customer address. This is a **customer-selected location**, not independently proven vehicle access. Geoapify route and petrol baseline calculation are already separate, review-only modules. Do not quote transport until staff confirms the kennel entrance, Bawli access waypoint and selected pickup/drop-off loops. Fatima's pricing basis is now confirmed as 20% markup on fuel cost; the current local petrol price and route still need review.
- Public `/api/book` cannot accept Google Form webhook requests; `/api/ingest` still requires its existing bearer token and only accepts `source='google_form'`.
- No public endpoint exposes individual bookings or animal-care records. /staff* remains protected behind Cloudflare Access.
- If the new table hasn't been created yet, existing staff booking details still work and simply omit the new location section. The public submission endpoint must remain disabled.
- No email is required for new customers because current Form submissions have only phone contacts. No mailing platform is added.

## Known release gaps
- Confirm owner-facing terms copy/link, existing Form's consent semantics, and whether pickup/drop-off can use different addresses in the same booking. The MVP supports one gate, clearly described.
- [Mobile release check #37](https://github.com/MuazShafiq/apex-kennels/issues/37): review on an actual phone, test Google Maps place links and dropped-pin share links (including `maps.app.goo.gl` short links), no-transport, device GPS, outside-area rejection and Turnstile before enabling. No search key is required for the customer location step. If a Maps URL has no exact pin, ask for a dropped pin rather than guessing coordinates.
