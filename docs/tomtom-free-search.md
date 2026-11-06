# Apex place search (TomTom, no Google billing)

The customer booking page uses **TomTom Orbis Places Suggest** while someone types, then **Details** after they choose a place. This avoids repeatedly calling TomTom Discover, which its documentation explicitly says is not suitable for as-you-type use.

- `TOMTOM_API_KEY` remains an encrypted Cloudflare Worker secret, never embedded in the page.
- TomTom suggestions are constrained by a rectangular operating envelope around the Islamabad–Rawalpindi urban area, with an Islamabad preference for ranking. Results include a named place and ID, **not coordinates**. The selected place ID is resolved through `/api/book/place` for coordinates, and customers can drag the marker to their exact entrance.
- Searches are debounced at 750 ms and recent results are cached in the current page session (up to 20 queries).
- `U.S. Embassy` and `US Embassy` normalize to the same provider text without overwriting the original text box.
- Provider rate limits (429) show a specific retry message. Failed provider lookups never guess a location.
- Geoapify remains the fallback address search if `TOMTOM_API_KEY` is removed and the route provider for staff-only pricing. It follows the same geographic coverage restriction.
- The service-area rectangle is a practical operational coverage limit, not an authoritative municipal-boundary polygon. Staff must approve borderline requests. Website intake rejects outside pins; booking without transport is not geographically restricted.
- Free-tier quotas and endpoint allowances are set by TomTom; check actual Suggest and Details usage in the TomTom dashboard. No Google billing is involved.

## Deployment and verification

1. With the existing `TOMTOM_API_KEY` secret configured, pull latest `main` and run `npm.cmd run cf:deploy`.
2. Refresh `/book`. Search `U.S. Embassy`, `US Embassy Islamabad`, `Saddar Rawalpindi`, and `Bahria Town Phase 8`. Verify the selected pin is within the Islamabad–Rawalpindi operating area. A Lahore landmark such as `Raya Fairways` must not be accepted as a transport destination.
3. If the first query returns **Search is busy**, the upstream provider is rate limiting. A recurring **Search could not load** on all queries requires checking the provider access/response in Cloudflare logs. Neither can be diagnosed from a key existing alone.
4. Keep customer booking submissions disabled until the separately documented Turnstile, terms and production database migration gates are verified. The original Google Form is still the customer channel.
