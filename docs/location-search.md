# Search-first transport locations (#93)

Search candidates are not vehicle entrances. Customers search within the same Islamabad/Rawalpindi rectangle enforced by intake, choose a candidate, inspect its Google Maps link, adjust the exact coordinates or paste an exact gate pin, and explicitly confirm the vehicle gate. The pickup and separate drop-off controls have independent cancellation, debounce, results and confirmation state. Existing exact-pin and GPS paths work without search or tiles. No map imagery is required to submit a pasted pin.

The Worker calls Geoapify autocomplete privately with `filter=rect:72.81,33.43,73.3,33.84` and `bias=proximity:73.06,33.65`, as documented in the [official autocomplete API](https://apidocs.geoapify.com/docs/geocoding/address-autocomplete/). It returns at most five bounded local Pakistani results. Provider responses, redirects, size, timeout and unsafe labels are checked. Customer query text and keys are never logged. Provider failures return a fallback instruction. No Google Places service, billing or new paid capacity is provisioned.

## Configuration and usage protection

`POST /api/book/search` requires same origin, a JSON body with only `query` (3–120 characters), the existing private `GEOAPIFY_API_KEY`, and both Cloudflare rate-limit bindings:

- `LOCATION_SEARCH_RATE_LIMIT`: per trusted `CF-Connecting-IP`, recommended 10 requests / 60 seconds.
- `LOCATION_SEARCH_USAGE_LIMIT`: shared `apex-location-search` key, recommended 30 requests / 60 seconds.

Missing either limiter or the private key fails closed with 503. No bindings are automatically added by this change: provider quality must be measured first. Cloudflare rate limiting applies per Cloudflare location, so the shared key is an edge usage bound, **not a worldwide daily credit cap**. Keep the account on an authorized no-charge plan with an account credit ceiling; paid expansion requires approval. If the account cannot enforce that ceiling, keep the search unavailable pending an explicitly approved quota solution. Never infer that a successful route lookup proves autocomplete relevance.

## Live relevance evidence

Run `node --experimental-strip-types scripts/benchmark-location-search.mjs` with an already authorized key in the private process environment. It makes exactly seven sequential scoped queries and prints only public query names and ranked candidate labels/coordinates. Review the named place and phase in each ranked result; a successful HTTP status is insufficient. Retain timestamped output and a human relevance assessment before configuring public search. Empty or unrelated results require a provider decision, not fabricated landmarks.

At implementation time, no Geoapify key was available in the process or private sibling-worktree environment files. **No live benchmark was executed and relevance is unverified.** Mock tests prove filtering and UI behavior only. Google Places Autocomplete (New) remains a benchmark option requiring separately approved existing billing/restricted credentials; this implementation does not select or enable it. Real-phone/ISP acceptance under #37 remains separate from browser emulation.

No public booking, invoice, customer-send or payment gate changes are part of this work.
