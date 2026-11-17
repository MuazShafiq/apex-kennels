# Customer location: choose and confirm the exact vehicle gate

The Apex booking preview (`/book`) uses one gate picker for independent pickup/drop-off, with three clear choices:

1. **Choose on map.** A lazily loaded, locally served pinned MapLibre GL JS library shows OpenFreeMap's free vector basemap. Pan/zoom beneath the central pin, then explicitly confirm the vehicle entrance. The initial map view is never a selected gate. Movement or a changed point clears earlier confirmation. The same map is reused for pickup and drop-off. Loading feedback is shown while the style and first frame initialize. Panning and zooming leave the map and attribution visible while tiles load. Once movement stops, a valid gate at entrance-level zoom can be confirmed while tile requests finish. The map retries tiles when the browser comes back online.
2. **Find your gate in Google Maps.** Expand this option to read the four steps before tapping **Open Google Maps**. Search for your address or area, touch and hold the exact vehicle entrance, then tap **Share → Copy link**. Return to the same Apex tab and paste into the field beside those instructions. Apex cannot automatically receive a point from the Maps app. Review and confirm the exact pin on the Apex map when available.
3. **Use my current location.** Grant device permission only when at the intended gate; GPS selects a candidate but never confirms it automatically.

No transport requires no pin. Pickup and drop-off are independent; when both are requested, reuse-pickup is selected by default. Unchecking reuse requires a separately confirmed drop-off gate. Only Islamabad/Rawalpindi points within the existing service envelope are accepted. Staff still review physical vehicle access and all transport pricing.

If the map cannot initialize, close and reopen it to retry, or use the exact Google Maps link, pasted coordinates or GPS. When confirming without the Apex map, use the exact-pin link to check the entrance before confirming. There is no billable Places SDK, map billing account, API key in the browser, reverse geocoding during panning, or provider failover. OpenFreeMap has no uptime SLA; functional text/link/GPS fallbacks are required.

`POST /api/book/location` and `src/shared-map-pin.ts` accept explicit numeric coordinates and exact selected-pin Google URLs. Short `maps.app.goo.gl` redirects are bounded and restricted to allowlisted HTTPS Google domains. The resolver never guesses from names, addresses, directions or `/@` viewport centres. Same-origin/body validation and server-side area bounds remain enforced; pin preparation neither saves a booking nor issues an invoice.

The legacy `/staff/location` checker remains protected by Cloudflare Access. Geoapify is retained privately for staff routing through the verified kennel entrance and Bawli approach, separately from this customer picker. The original Google Form and its authenticated ingest/recovery remain the live customer path until explicit cutover approval.

Physical iPhone/Safari and affected-ISP/mobile-data acceptance remain human checks: map selection, Google Maps search → share an exact dropped pin → return/paste → confirm, same/separate gates and outage fallback. Synthetic browser emulation cannot establish these. See [release acceptance](release-acceptance.md) and [retirement inventory](location-search.md).
