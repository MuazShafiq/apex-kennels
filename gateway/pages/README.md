# Apex public booking alias (Cloudflare Pages)

**Public hostname:** `apexkennels.pages.dev`. This is a short public entry point for the existing Cloudflare Worker; it does not replace the Worker, Google Form, Neon, or Cloudflare Access.

## Prepared private staff URL (disabled pending Access approval)

**Candidate:** `https://apexkennels.pages.dev/staff`. The approved public website is unchanged. This is an implementation candidate, **not yet a working staff URL**.

The Pages gateway has a separate, fail-closed `APEX_STAFF_PAGES_ENABLED` flag, currently tracked as `"false"`. With the flag closed, `/staff` and all `/staff/*` return 404 without contacting the Worker. With the flag enabled, the gateway accepts only GET/POST, requires an Access JWT assertion, strips cookies/authorization/spoofable forwarding headers, passes the assertion to the existing backend over the Cloudflare Service Binding, and forces no-store/noindex. The backend independently verifies the Access JWT signature, exact issuer/AUD and allowlisted staff email. A JWT-shaped string alone does **not** grant access.

**Access preflight and controlled rollout**

1. In an authorized Zero Trust session, check whether the existing **Apex Staff** app can protect both exact Pages destinations, `apexkennels.pages.dev/staff` and `apexkennels.pages.dev/staff/*`, with the existing Worker destination, AUD, issuer and exact staff policy preserved. The Pages preview toggle and the documented whole-host setup do not prove staff-only coverage. Keep the route closed if the account cannot configure both paths while preserving public `/` and `/book`. [Pages Access setup](https://developers.cloudflare.com/pages/platform/known-issues/#enable-access-on-your-pagesdev-domain) · [Access path matching](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/).
2. After separately authorized Access configuration, keep the Pages gateway flag closed. Confirm signed-out requests to both staff paths reach Access, an existing unallowlisted identity is denied, Fatima can complete her login, and the signed-in route reaches the closed gateway. Verify public URLs remain reachable and the original Worker staff URL still works. A closed gateway cannot establish assertion delivery to the Worker.
3. For separately authorized end-to-end acceptance, change only `env.production.vars.APEX_STAFF_PAGES_ENABLED` to `"true"` and deploy the existing nested Pages project to its production branch. Keep the top-level default `"false"` for local and preview use. Capture the prior closed Pages deployment and check the actual Worker activation bindings before opening. Verify Fatima's login reaches the existing JWT-verifying Worker, signed-out/forged and unallowlisted requests disclose no data, and staff queue, detail, location, review forms and draft PDF work with permitted inputs. Keep invoice issuance, messaging and payments closed. Report outcomes without tokens or private booking details.
4. Recheck public Pages routes, protected API 404s, original Worker staff access, Google Form continuity, and booking config false with POST 503 on both hosts. If any check fails, restore the previous closed Pages deployment or deploy the production flag as `"false"`. Verify gateway 404 after Access, then revert only the separately added Pages Access paths if needed. Confirm both staff URLs and the public booking boundaries again.

Do not treat `/staff` routing tests with mocked backend as real authentication evidence. No production Access, Pages, Worker or database setting was changed in this PR. Booking, invoice issuance, messaging and payment gates must stay closed.

## Restricted gateway

- `GET /` forwards to the public homepage. `/site/*` serves shared public assets and `/book` serves the booking preview.
- The only exposed API paths are `GET /api/book/config`, `POST /api/book/location`, and `POST /api/book`.
- Staff remains 404 by default. Only after explicit Access acceptance and a separate staff-route activation may authenticated `/staff*` paths proxy through to the existing JWT-verifying Worker. Intake, webhook, health, demo and all unrelated routes stay locally restricted.
- The `APEX_BACKEND` Service Binding points to `apex-kennels-api` within Cloudflare; no public external proxy, new database, API key or broader CORS.
- The existing upstream booking feature flag remains authoritative. **This gateway does not enable public submissions.**

The Pages Wrangler configuration is deliberately nested to avoid changing the root Worker build or deployment. Apex already uses the existing `apexkennels` project.

## Verification

From repo root, run `node --test gateway/pages/gateway.test.mjs` and `npm.cmd run cf:check`. Node tests cover restricted routes and proxy behavior, not actual Pages deployment or the Turnstile hostname.

## Historical provisioning notes

1. Verify the existing Cloudflare account supports Pages on its free plan **without adding a payment card or upgrading**; confirm `apexkennels` is available. If occupied, agree another brand name and update the nested config before provisioning.
2. From `gateway/pages` execute `npx wrangler pages project create apexkennels --production-branch main`, then `npx wrangler pages deploy site --project-name apexkennels --config wrangler.jsonc`. Confirm the resulting deployment has a Service Binding named `APEX_BACKEND` bound to the existing `apex-kennels-api` Worker. Do not substitute a public reverse proxy.
3. Verify the actual hostname over HTTPS. `/` and `/book` must display the homepage and booking preview respectively, and the public fonts, website assets and booking JS/CSS/MapLibre resources must load, `/api/book/config` must report `enabled:false`, and an empty POST to `/api/book` must fail with 503. `/staff`, `/api/ingest`, and all webhook/demo/private paths must return 404 at the new host. Inspect original CSP and `X-Robots-Tag` response headers.
4. Check on physical phone/Safari and affected ISP/mobile data, including map selection, precise Google Maps sharing, fallback and area checks. Browser mocks do not establish real-device/network acceptance.
5. **Do not publish this as the replacement customer booking link yet.** A later public cutover still requires Fatima/device/Access acceptance and explicit founder approval. Before real submissions on the alias, add the new hostname to the existing Turnstile site's allowed hostnames and verify a planned, controlled synthetic challenge/booking with rollback. Backend challenge verification checks the hostname against the incoming request URL.

If the new Pages project fails, keep the existing Worker and operational Google Form untouched. Never enable an activation flag, rotate intake credentials, weaken staff protection, or run production migrations just to fix the short URL.
