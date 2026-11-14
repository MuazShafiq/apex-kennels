# Customer boarding site: preview-first release

## State
The customer booking site lives at `/book` on the **existing** Apex Cloudflare Worker. It replaces the repeated request for a Google Maps pin by collecting the exact pickup/drop-off point during booking. The legacy Google Form and its hourly recovery remain operational and separate.

**As of 2026-11-14: deployed preview; public submissions remain disabled.** A real Turnstile and production website submission were exercised using explicitly synthetic data during a controlled temporary gate opening on 2026-11-13; the gate was subsequently closed and HTTP 503 was verified (operator-reported live results). This is **not customer launch approval**. Visual/mobile browser CI passed, but real-phone Google Maps flow and network connectivity still need acceptance under [issue #37](https://github.com/MuazShafiq/apex-kennels/issues/37). No payment, automatic approval, customer messages, or invoice issuance is enabled.

## User journey
1. Customer enters owner, dates, dog, health, emergency, and care details, matching the current mapped Form.
2. Chooses whether camera cage and transport are requested. If transport is requested: customer chooses pickup, drop-off, or both. For Both, the same gate is the default, with an optional separate drop-off pin field. They either tap **Use my current location**, or open Google Maps, find/drop their entrance pin, choose **Share → Copy link** and paste the share link back into Apex. The Worker extracts an explicit pin; no external search engine is embedded in the booking page.
3. Completes the Cloudflare Turnstile challenge and submits.
4. The Worker verifies the exact origin, JSON/body size, all booking answers and confirmed coordinates, and calls Turnstile Siteverify. Turnstile **hostname** and **action** must match.
5. A single Neon transaction saves the booking, original care information, and private confirmed pin. Existing staff booking queue and `/staff/booking` show it under Cloudflare Access. No amount is charged automatically.

## Setup, in order
1. Review the **already-deployed** preview at `https://apex-kennels-api.muaz-shafiq18.workers.dev/book`. Confirm public submissions remain disabled until owner-approved launch.
2. Owner reviews the exact public copy and **actual boarding terms**. Before accepting real submissions, the terms must be linked or shown in full. The six owner-provided clauses are displayed in an expandable terms section; Fatima should review the exact legal wording before activation.
3. **Done (2026-11-10/11):** Applied the additive `booking_transport_locations` and `booking_whatsapp_consents` tables in production Neon. Both are present and the consent table was empty when verified; no historical WhatsApp consent was inferred.
4. **Verified in the controlled 2026-11-13 test:** the real Cloudflare Turnstile widget, hostname/action checks, and production Neon write succeeded for a synthetic booking (operator report). Preserve the existing `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` Worker secrets; do not copy them into GitHub or customer HTML.
5. Only after Fatima's explicit form/terms approval and the remaining mobile/connectivity checks, set `APEX_PUBLIC_BOOKING_ENABLED=true` through the authorized Worker configuration procedure. Confirm the full booking-to-staff path. A temporary test authorization is **not** approval to leave the public gate enabled.
6. **Completed for a controlled synthetic production booking (2026-11-13):** real Turnstile, production Neon save and staff review were verified by the operator. The gate was closed afterward. For launch, still verify an actual mobile customer journey and that `/api/health` plus the original Google Form remain functional. Never send an invoice or customer message during synthetic tests.
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
- Obtain Fatima's final approval of customer-facing copy, six boarding terms and consent wording. Separate pickup and drop-off locations are already supported; they are not another business decision.
- [Mobile release check #37](https://github.com/MuazShafiq/apex-kennels/issues/37): verify on a real phone/network, including Google Maps place links and dropped-pin shares (including `maps.app.goo.gl`), no transport, GPS permission handling and outside-area rejection. The real Turnstile/backend canary already passed; do not mistake that for real-phone acceptance. Test connectivity on the previously affected ISP as well as mobile data before cutover. Vague links still require a dropped pin, never guessed coordinates.

## Historical 2026-11-11 checkpoint

[Technical readiness](technical-release-readiness-2026-11-11.md) describes the pre-live-test state. It is retained as history, not the current production verification result. The old Google Form remains active; public website submissions were only enabled temporarily for the 2026-11-13 synthetic test and are currently disabled.

## 2026-11-12 transport UX revision

- **Independent service selections:** Customers check Pickup, Drop-off or both. An explicit **No transport needed** option is exclusive with the two services; no option is preselected, and unanswered transport selections cannot be submitted.
- Selecting a service reveals its own Google Maps pin controls, with no second address requirement for one-way bookings.
- When both are selected, **Use pickup location for drop-off** is checked by default; unchecking it reveals a second independent pin input. If a customer already selected a drop-off-only pin before adding pickup, the separate drop-off is preserved.
- The existing API contract remains unchanged: `transportLocation` holds the pickup or single-service pin and `transportDropoffLocation` is included only when Both uses different gates. The existing route-calculation and Neon schema require no changes.
- Transport, legal terms and WhatsApp checkboxes use explicit two-column checkbox/text alignment. Public submissions remain disabled until final owner approval and controlled live verification.
