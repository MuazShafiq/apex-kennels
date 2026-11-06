# Apex staff access

Apex's `/staff*` pages are protected by **Cloudflare Zero Trust Access**, plus a Worker-level audience and exact-email allowlist. This does not protect the public `/book` or Google Form `/api/ingest` endpoints.

## Required production configuration

1. In **Zero Trust → Access controls → Applications**, retain the existing **Apex Staff** application, protecting `apex-kennels-api.muaz-shafiq18.workers.dev/staff*`. Don't create a second app or protect the whole Worker.
2. The application allows only the owner's approved staff email addresses. The Worker's `STAFF_ALLOWED_EMAILS` must independently contain those exact comma-separated addresses.
3. In the Worker **Settings → Variables and Secrets**, keep `STAFF_ACCESS_AUD` set to the existing Apex Staff Application Audience (AUD) Tag.
4. **New for Workers Static Assets:** Set `STAFF_ACCESS_ISSUER` to the Cloudflare One team domain **including https**: `https://YOUR-TEAM.cloudflareaccess.com`. Find the actual team name in **Zero Trust → Settings → Team name and domain**. Do not guess or use the `workers.dev` hostname.
5. Deploy updated `main`. When Cloudflare provides `ctx.access`, Worker uses that verified identity. When the Static Assets router omits it, Worker verifies the `Cf-Access-Jwt-Assertion` signature against the team's Cloudflare public keys, exact issuer, application AUD, token expiry, and the email allowlist. Missing/invalid tokens fail closed. No personal email, JWT or key contents are logged.

## Verify after deployment

- Signed-in, allowlisted staff can load `/staff`, `/staff/booking?id=...` and `/staff/draft?id=...`.
- Signed-out staff get Cloudflare's login or access denial, not booking data. A forged `Cf-Access-Jwt-Assertion` must not work.
- An email outside the exact allowlist gets denied.
- `/api/health` stays public (200) and unauthenticated `POST /api/ingest` stays rejected (401). The Google Form webhook remains separate.
- Never put `STAFF_ACCESS_ISSUER` or tokens into the customer page. The domain is not a secret, but security relies on an exact trusted issuer and verified cryptographic signature.

**Why:** Cloudflare's static assets internal router can drop `ctx.access`, even after Access has authenticated the person. See official [Cloudflare Workers Access docs](https://developers.cloudflare.com/workers/configuration/cloudflare-access/) and [JWT validation guidance](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/). Existing page controls remain unchanged; no staff delegation or write permissions were added.
