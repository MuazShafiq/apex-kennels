# Customer map-pin collection: exact coordinates, never guessed addresses

Apex's current Google Form contains a typed owner address but **not a verified map pin**. Until the future booking website has an interactive map picker, staff can request a **static dropped pin** in Google Maps or WhatsApp for transport bookings.

`src/shared-map-pin.ts` now implements a conservative preparation helper:

- Accept raw `latitude,longitude` coordinates (Pakistan bounds), an exact coordinate `?q=` or `?query=` Maps link, or a Google Maps selected-place `!3dLAT!4dLON` link.
- Explicitly distinguishes the chosen place's point from the map **viewport** `/@LAT,LON`. The kennel's original link is a real test fixture: its map viewport longitude was 73.2508812 but its actual selected place longitude was **73.2534561**.
- Follows `maps.app.goo.gl` **short-link redirects** only to allowlisted HTTPS Google Maps hosts, with a strict redirect limit, no cookies, no external geocoding, no scraping and no arbitrary redirects to internal/private hosts.
- Returns numeric coordinates with `customerConfirmationRequired=true` and `roadEntranceConfirmed=false`. **A correctly parsed pin is not yet proof of a drivable pickup gate.**
- If a location is not exact or a shortlink does not resolve, no numeric pin or transport charge is fabricated.
- No extra dependencies, paid API, database changes, customer notification or Form edits.

**Current implementation boundary:** This is a pure reusable function and automated tests, not a public resolver endpoint or stored customer location. Do not automatically resolve/retain locations from every booking until the UI and privacy/access workflow are complete. Real customer pins need staff/customer confirmation and a verified route through Bawli before billable distance is determined.

After Cloudflare Access is configured for named staff, a staff-only POST endpoint can use this helper to resolve a customer's explicitly shared pin, let staff confirm it visually, and persist numeric coordinates in the draft metadata. Route verification and pricing are separate steps.

See also [route policy](invoice-and-location-policy.md) and [staff quote review](staff-invoice-drafts.md).
