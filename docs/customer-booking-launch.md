# Customer boarding site: preview-first release

## State
The customer booking site lives at `/book` on the **existing** Apex Cloudflare Worker. It replaces the repeated request for a Google Maps pin by collecting the exact pickup/drop-off point during booking. The legacy Google Form and its hourly recovery remain operational and separate.

**Default: preview-only, not accepting submissions.** Founder reports desktop link-location flow working. Founder confirmed the two most recent mobile UX fixes on an actual phone (equal-height boarding cards and location pin fallback). Full real Turnstile + actual website booking submission are **not yet verified**; see [issue #37](https://github.com/MuazShafiq/apex-kennels/issues/37). No payment, invoice, booking approval, customer notification, or outbound WhatsApp message runs from this feature. PR #29 is an implementation, not Fatima's approval of the form design or terms.

## User journey
1. Customer enters owner, dates, dog, health, emergency, and care details, matching the current mapped Form.
2. Chooses whether camera cage and transport are requested. If transport is requested: customer chooses pickup, drop-off, or both. For Both, the same gate is the default, with an optional separate drop-off pin field. They either tap **Use my current location**, or open Google Maps, find/drop their entrance pin, choose **Share → Copy link** and paste the share link back into Apex. The Worker extracts an explicit pin; no external search engine is embedded in the booking page.
3. Completes the Cloudflare Turnstile challenge and submits.
4. The Worker verifies the exact origin, JSON/body size, all booking answers and confirmed coordinates, and calls Turnstile Siteverify. Turnstile **hostname** and **action** must match.
5. A single Neon transaction saves the booking, original care information, and private confirmed pin. Existing staff booking queue and `/staff/booking` show it under Cloudflare Access. No amount is charged automatically.

## Setup, in order
1. Review the preview (not an active customer channel): update and deploy the Worker from the latest main, and open `https://apex-kennels-api.muaz-shafiq18.workers.dev/book`. Submission stays disabled with no flag.
2. Owner reviews the exact public copy and **actual boarding terms**. Before accepting real submissions, the terms must be linked or shown in full. The six owner-provided clauses are displayed in an expandable terms section; Fatima should review the exact legal wording before activation.
3. **Done (2026-11-10/11):** Applied the additive `booking_transport_locations` and `booking_whatsapp_consents` tables in production Neon. Both are present and the consent table was empty when verified; no historical WhatsApp consent was inferred.
4. In Cloudflare Turnstile, create a site widget scoped to the actual Worker hostname. Store the **public** widget key as `TURNSTILE_SITE_KEY` and the private server validation key as `TURNSTILE_SECRET_KEY` in Worker secrets. Do not place the private key in code or customer HTML.
5. Only after tests and Fatima's approval, set `APEX_PUBLIC_BOOKING_ENABLED=true` in the Worker environment and redeploy. `GET /api/book/config` returns `{enabled:false}` until that flag and both Turnstile keys and `DATABASE_URL` are present.
6. Make one explicitly synthetic test booking through the real new form, confirm the booking and its pin in authenticated staff detail, and verify `/api/health` and the original Form intake remain operational. Never send an invoice or customer message for the test.
7. Finally switch the customer-facing booking link from the existing Google Form to `/book`. Keep Google Form as a fallback until the replacement is independently verified.

## Operational boundaries
- Google Maps universal URLs open the installed Maps app or browser without an API key or billing. A normal website cannot receive the place the user selected inside Maps without the user sharing a link. Device geolocation is optional and permissioned. External Maps short links are resolved only through an existing, strict Google-domain allowlist.
- Pickup and drop-off are restricted to the Islamabad–Rawalpindi urban service envelope defined in `src/transport-service-area.ts`. Google Maps share-link resolution, device GPS and server intake enforce it; the envelope is approximate, not an official administrative boundary. Boarding without transport remains available regardless of customer address. This is a **customer-selected location**, not independently proven vehicle access. Geoapify route and petrol baseline calculation are already separate, review-only modules. Do not quote transport until staff confirms the kennel entrance, Bawli access waypoint and selected pickup/drop-off loops. Fatima's pricing basis is now confirmed as 20% markup on fuel cost; the current local petrol price and route still need review.
- Public `/api/book` cannot accept Google Form webhook requests; `/api/ingest` still requires its existing bearer token and only accepts `source='google_form'`.
- No public endpoint exposes individual bookings or animal-care records. /staff* remains protected behind Cloudflare Access.
- A different drop-off pin is kept in two nullable columns on the private transport-location row. Distinct gates receive independently measured complete road loops, not an assumed double-distance.
- If the new table hasn't been created yet, existing staff booking details still work and simply omit the new location section. The public submission endpoint must remain disabled.
- No email is required for new customers because current Form submissions have only phone contacts. No mailing platform is added.

## Known release gaps
- Confirm owner-facing terms copy/link, existing Form's consent semantics, Different pickup and drop-off locations are supported and each must be independently confirmed when selected.
- [Mobile release check #37](https://github.com/MuazShafiq/apex-kennels/issues/37): review on an actual phone, test Google Maps place links and dropped-pin share links (including `maps.app.goo.gl` short links), no-transport, device GPS, outside-area rejection and Turnstile before enabling. No search key is required for the customer location step. If a Maps URL has no exact pin, ask for a dropped pin rather than guessing coordinates.

## 2026-11-11 engineering update

See [technical readiness](technical-release-readiness-2026-11-11.md) for the full synthetic browser submission test, validated Neon schema, Turnstile account setup, and strict final owner-approval gate. The old Google Form remains live. No public booking submissions have been enabled.

## 2026-11-12 transport UX revision

- **Independent service selections:** Customers check Pickup, Drop-off or both. An explicit **No transport needed** option is exclusive with the two services; no option is preselected, and unanswered transport selections cannot be submitted.
- Selecting a service reveals its own Google Maps pin controls, with no second address requirement for one-way bookings.
- When both are selected, **Use pickup location for drop-off** is checked by default; unchecking it reveals a second independent pin input. If a customer already selected a drop-off-only pin before adding pickup, the separate drop-off is preserved.
- The existing API contract remains unchanged: `transportLocation` holds the pickup or single-service pin and `transportDropoffLocation` is included only when Both uses different gates. The existing route-calculation and Neon schema require no changes.
- Transport, legal terms and WhatsApp checkboxes use explicit two-column checkbox/text alignment. Public submissions remain disabled until final owner approval and controlled live verification.
