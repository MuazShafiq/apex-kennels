# Customer map-pin collection: exact coordinates, never guessed addresses

Apex's current Google Form contains a typed owner address but **not a verified map pin**. Until the future booking website has an interactive map picker, staff can request a **static dropped pin** in Google Maps or WhatsApp for transport bookings.

`src/shared-map-pin.ts` now implements a conservative preparation helper:

- Accept raw `latitude,longitude` coordinates (Pakistan bounds), an exact coordinate `?q=` or `?query=` Maps link, or a Google Maps selected-place `!3dLAT!4dLON` link.
- Explicitly distinguishes the chosen place's point from the map **viewport** `/@LAT,LON`. The kennel's original link is a real test fixture: its map viewport longitude was 73.2508812 but its actual selected place longitude was **73.2534561**.
- Follows `maps.app.goo.gl` **short-link redirects** only to allowlisted HTTPS Google Maps hosts, with a strict redirect limit, no cookies, no external geocoding, no scraping and no arbitrary redirects to internal/private hosts.
- Returns numeric coordinates with `customerConfirmationRequired=true` and `roadEntranceConfirmed=false`. **A correctly parsed pin is not yet proof of a drivable pickup gate.**
- If a location is not exact or a shortlink does not resolve, no numeric pin or transport charge is fabricated.
- No extra dependencies, paid API, database changes, customer notification or Form edits.

**Current implementation boundary:** The pure helper is now accessible via a **staff-only** form at `GET/POST /staff/location` (behind Cloudflare Access identity + email allowlist). The staff console links to it. It **does not** save customer location or accept/price transport, and no production Worker deployment has been performed. Do not automatically resolve/retain locations from every booking until the UI and privacy/access workflow are complete. Real customer pins need staff/customer confirmation and a verified route through Bawli before billable distance is determined.

After Cloudflare Access is configured for named staff, a staff-only POST endpoint can use this helper to resolve a customer's explicitly shared pin, let staff confirm it visually, and persist numeric coordinates in the draft metadata. Route verification and pricing are separate steps.

See also [route policy](invoice-and-location-policy.md) and [staff quote review](staff-invoice-drafts.md).

## Staff-only workflow (source-ready, not deployed)

1. The owner shares a STATIC location (not continuous live location) using Google Maps or WhatsApp.
2. Signed-in, allowlisted staff visits `/staff/location` from the queue. It accepts a **single** Google Maps location link pasted into a small form.
3. The server performs strict host-limited shortlink resolution and displays exact coordinates plus a link back to Google Maps. No raw customer share link is reflected in HTML.
4. The staff member confirms the road gate with the customer. This check never creates a booking note, stored location or invoice, so those steps still need a future protected workflow.

Security: `POST /staff/location` requires the same Access audience + staff email checks as the booking queue, a valid same-origin `Origin` header, and a bounded `application/x-www-form-urlencoded` request. No CORS, no third-party JavaScript and no public pin resolver.

If a share URL cannot be resolved, request a dropped Google Maps pin again instead of silently geocoding the typed address. The user's Bawli restaurant access constraint and Fatima's road confirmation still apply independently.
