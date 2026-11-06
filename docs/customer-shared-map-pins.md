# Customer location: Google Maps share link or device GPS

The new Apex booking preview (`/book`) does **not** embed a map or call a paid place-search API. For pickup or drop-off inside Islamabad–Rawalpindi, customers choose between:

1. **Use my current location**, when standing at the pickup address and granting location permission.
2. **Open Google Maps**, search for an address or drop a pin on the entrance, choose **Share → Copy link**, and paste the link into Apex.

The private Worker-side link handler `POST /api/book/location` uses `src/shared-map-pin.ts`, which was originally built for the legacy staff location checker. The resolver accepts explicit numeric pin coordinates and certain Google Maps selected-place URLs, plus short `maps.app.goo.gl` links that redirect to a resolvable exact pin. It never guesses a destination from a text address or from a map viewport's `/@` coordinates. Redirects are restricted to allowlisted HTTPS Google domains with bounded hops.

The customer-facing endpoint checks same-origin requests and payload size, returns only the parsed coordinates and a Google Maps review link, and rejects locations outside the configured Islamabad–Rawalpindi operating area. Customers who don't request transport don't need a pin.

**Limits:** Some Google Maps share URLs do not identify an exact point. Apex rejects those rather than silently producing a wrong transport price. Location accuracy and access for vehicles still need staff review. No invoice or payment action happens here.

The earlier `/staff/location` helper remains behind Cloudflare Access solely for legacy Form bookings; it does not save locations. Route estimation uses Geoapify separately once the kennel entrance, required Bawli access point and customer gate are verified.

**Mobile acceptance testing is deferred to [issue #37](https://github.com/MuazShafiq/apex-kennels/issues/37).** The founder has verified the desktop preview; a real-phone test is pending. Do not declare website cutover complete before that and the other launch checks in [customer-booking-launch.md](customer-booking-launch.md).
