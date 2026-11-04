# Staff access activation (not yet configured)

The live staff queue under `/staff` requires Cloudflare Access. It is READ-ONLY and returns 503 until configured. Do not put customer data or Neon credentials in browser code.

1. Cloudflare Zero Trust > Access controls > Applications > Add application > **Self-hosted and private**.
2. Protect hostname `apex-kennels-api.muaz-shafiq18.workers.dev` using the **path pattern `/staff*`**. Do **not** protect the entire Worker, which would block the Google Forms trigger. Verify both `/staff` and `/staff/api/bookings` are covered.
3. Allow only exact staff email addresses approved by Apex. Do not use a domain-wide policy.
4. Copy the application's **Application Audience (AUD) Tag**.
5. Worker Settings > Variables and Secrets: set `STAFF_ACCESS_AUD` to the exact tag and `STAFF_ALLOWED_EMAILS` to a comma-separated exact email allowlist (prefer Secret). Do not commit these values to GitHub.
6. Deploy settings and verify: unauthenticated `/staff` prompts Access sign-in; unauthorized addresses cannot see data; allowed staff can see the bounded read-only queue; unauthenticated `/staff/api/bookings` never returns customer records.
7. Verify `/api/health` still returns 200 publicly and unauthorized `POST /api/ingest` still returns 401. The Google Forms bearer token is separate.

Check Cloudflare's [Access application paths](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/) if path pattern selection differs.

Defense in depth: the Worker also checks the verified `ctx.access.aud` and signed-in email against the allowlist. It ignores spoofed JWT headers. No booking edits, invoice approvals, payments or messages are implemented.