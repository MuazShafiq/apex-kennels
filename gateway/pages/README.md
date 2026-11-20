# Apex public booking alias (Cloudflare Pages)

**Proposed hostname:** `apexkennels.pages.dev`, subject to availability. This is a short public entry point for the existing Cloudflare Worker; it does not replace the Worker, Google Form, Neon, or Cloudflare Access.

## Restricted gateway

- `GET /` forwards to the public homepage. `/site/*` serves shared public assets and `/book` serves the booking preview.
- The only exposed API paths are `GET /api/book/config`, `POST /api/book/location`, and `POST /api/book`.
- Staff, intake, webhook, health, demo and all other routes return local 404 without reaching the Worker.
- The `APEX_BACKEND` Service Binding points to `apex-kennels-api` within Cloudflare; no public external proxy, new database, API key or broader CORS.
- The existing upstream booking feature flag remains authoritative. **This gateway does not enable public submissions.**

The Pages Wrangler configuration is deliberately nested to avoid changing the root Worker build or deployment. The candidate Pages project name is not reserved until created in Cloudflare.

## Verification

From repo root, run `node --test gateway/pages/gateway.test.mjs` and `npm.cmd run cf:check`. Node tests cover restricted routes and proxy behavior, not actual Pages deployment or the Turnstile hostname.

## Controlled provisioning (authenticated Cloudflare operator)

1. Verify the existing Cloudflare account supports Pages on its free plan **without adding a payment card or upgrading**; confirm `apexkennels` is available. If occupied, agree another brand name and update the nested config before provisioning.
2. From `gateway/pages` execute `npx wrangler pages project create apexkennels --production-branch main`, then `npx wrangler pages deploy site --project-name apexkennels --config wrangler.jsonc`. Confirm the resulting deployment has a Service Binding named `APEX_BACKEND` bound to the existing `apex-kennels-api` Worker. Do not substitute a public reverse proxy.
3. Verify the actual hostname over HTTPS. `/` and `/book` must display the homepage and booking preview respectively, and the public fonts, website assets and booking JS/CSS/MapLibre resources must load, `/api/book/config` must report `enabled:false`, and an empty POST to `/api/book` must fail with 503. `/staff`, `/api/ingest`, and all webhook/demo/private paths must return 404 at the new host. Inspect original CSP and `X-Robots-Tag` response headers.
4. Check on physical phone/Safari and affected ISP/mobile data, including map selection, precise Google Maps sharing, fallback and area checks. Browser mocks do not establish real-device/network acceptance.
5. **Do not publish this as the replacement customer booking link yet.** A later public cutover still requires Fatima/device/Access acceptance and explicit founder approval. Before real submissions on the alias, add the new hostname to the existing Turnstile site's allowed hostnames and verify a planned, controlled synthetic challenge/booking with rollback. Backend challenge verification checks the hostname against the incoming request URL.

If the new Pages project fails, keep the existing Worker and operational Google Form untouched. Never enable an activation flag, rotate intake credentials, weaken staff protection, or run production migrations just to fix the short URL.
