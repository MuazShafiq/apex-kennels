# Retired autocomplete: decision history and removal inventory

**Superseded 2026-11-17 by [canonical founder scope #93](https://github.com/MuazShafiq/apex-kennels/issues/93).** Customer Geoapify autocomplete is retired. The current experience is [the exact vehicle-gate picker](customer-shared-map-pins.md): one locally served MapLibre library, the free OpenFreeMap basemap, consumer Google Maps link/paste and permissioned GPS. No billing account, Places SDK, metered map provider or reverse geocoding is used.

## Removed

- `public/book` autocomplete controls, candidate ranking/selection and provider attribution (replaced by the explicit gate picker).
- `/api/book/search`, `src/place-search.ts` and search-only tests: no customer geocoding, routing-key use or provider credits through this route.
- Search benchmark and local active-budget checker scripts; obsolete example configuration and detailed ranked-result JSON/refinement documents. Historical relevance measurements are summarized below rather than maintained as current instructions.
- Scheduled F-10 provider smoke and its CI syntax check; replaced with `scripts/check-production-gate-picker.mjs` asset/retired-route/exact-pin checks. The replacement does not fetch tiles, follow Google short links, call Geoapify or write bookings. Closed-booking, intake authentication, staff denial and PDF checks remain.
- Search-only production/preview rate-limit bindings. These stateless bindings no longer protect an active endpoint and need no persisted-object migration.

## Deliberately retained

`wrangler.jsonc` retains `location-search-budget-v1`, `LocationSearchBudget`, and the production/preview `LOCATION_SEARCH_BUDGET` namespace bindings. The class export is a minimal inert HTTP 410 implementation: no storage reads/writes, counter, provider access or Worker caller. The old runtime types, budget consumption helper and active-budget tests are removed. Previously deployed SQLite namespaces have persistence and migration constraints; deleting a class or introducing `deleted_classes` could destroy persisted objects and complicate rollback. No destructive migration is proposed or executed for cleanup. Any future namespace retirement needs a separately reviewed Cloudflare migration and recovery plan. A rollback to old code must retain its original namespace/counter identity and explicit authorization; this compatibility class does not reset old counters.

`GEOAPIFY_API_KEY` and the Geoapify account remain private and untouched for staff transport routing. Exact Google Maps resolver, GPS, Islamabad/Rawalpindi service envelope, Bawli routing/access review, pricing, Google Form ingestion, Access enforcement and every booking/financial/message gate remain separate and preserved. A stale remote `APEX_LOCATION_SEARCH_DISABLED` variable, if present, is harmless and unused; no secret/configuration mutation is required for this retirement.

## Historical evidence and its limits

On 2026-11-16 the previous search implementation measured seven scoped Geoapify queries (F-10 Markaz, DHA Phase II, Bahria Phase 7, G-13, Saddar, US Embassy and Centaurus). Conservative spelling/identity ranking refinements improved those API results; DHA remained an unverified mosque/address candidate. Local workerd tests measured a 250/day persisted budget. Later production configuration and bounded API checks succeeded. These were API/runtime observations, not reliable real-browser, physical iPhone or affected-ISP acceptance. The founder subsequently observed raw `Failed to fetch` for Bahria in a real browser and replaced the search-first requirement. Passing F-10 CI did not resolve that failure.

This change is local implementation until its PR/CI/deployment evidence is recorded by the sole release operator. No production migration, namespace deletion, remote flag/secret change, booking submission, invoice or message is authorized here.
