# Free search provider migration (TomTom)

Apex keeps **OpenFreeMap + MapLibre** for map display and **Geoapify routing** for quotes. We do not add Google billing.

The old address-only Geoapify autocomplete is a fallback. When `TOMTOM_API_KEY` is available on the Cloudflare Worker, `/api/book/places` uses the **TomTom Orbis Places Discover API** with an Islamabad location bias and Pakistan-only results. This is a full place search (not continuous autocomplete): it returns named POIs and their coordinates in one call. No changes to booking records, prices, or the Google Form.

At the time of implementation, TomTom advertises a **no-card free tier** with **5,000 Discover calls/month** and states that requests above the free usage limit receive HTTP 429, not a charge. Its older Fuzzy Search API has a different allowance; don't confuse the two.

Required next steps:
1. Sign up at https://developer.tomtom.com/ without a card; generate an API key and verify Places Search API permissions. Do not put the key in GitHub, a chat or source code.
2. Set the key as the existing Cloudflare Worker's encrypted variable `TOMTOM_API_KEY`.
3. Redeploy the main branch, then test `US Embassy Islamabad`, `Raya`, `Bahria Town Phase 8`, and street addresses on `/book`. Confirm map markers are in the right locations. Results have not yet been benchmarked with a real key.
4. If search quality is poor, remove/disable `TOMTOM_API_KEY` to revert to Geoapify without code changes. Do not enable customer submissions without separate Turnstile/DB/terms gates.

Implementation keeps the key server-only. The browser only receives bounded labels and coordinates. No payment method, spending authorization or subscription is needed for the test.
