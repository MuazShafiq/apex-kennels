# Cloudflare Workers migration

**Migration status:** Implementation proposed on `feature/cloudflare-workers`, not deployed to a Cloudflare account. The current Vercel deployment is kept as a development fallback until the Cloudflare Worker is tested.

## Architecture

- Cloudflare Worker running TypeScript on `workerd`, using Web Fetch handlers
- Neon PostgreSQL remains the **same** dedicated `apex-kennels` database
- `@neondatabase/serverless` uses a new WebSocket `Client` per request
- Existing `saveBooking` transaction (BEGIN/COMMIT/ROLLBACK) remains unchanged
- No live Google Form ingestion, pricing decisions, invoice delivery, or customer data import are enabled

The API accepts `GET /api/health` and authenticated `POST /api/ingest`. There is no public submission endpoint. The worker refuses intake with HTTP 503 until **both** secrets exist.

## Create the Worker (once)

1. Open [Cloudflare Workers & Pages](https://dash.cloudflare.com/?to=/:account/workers-and-pages) and select **Create application**.
2. Choose **Import a repository**, connect GitHub, and select **MuazShafiq/apex-kennels**.
3. Use Worker name **apex-kennels-api**, repository root `/`, production branch `main` after the migration PR is merged. The name must match `wrangler.jsonc`.
4. Build command: `npm run cf:check` (tests, type check and Wrangler dry run).
5. Deploy command: `npx wrangler deploy`.
6. In the Worker dashboard under **Settings → Variables & Secrets**, securely add **Secret** variables:
   - `DATABASE_URL`: Neon connection URI for `apex-kennels` / `neondb`. Copy directly from Neon dashboard. Never commit it.
   - `INTAKE_API_SECRET`: a **new** random 32+ byte secret. Do not reuse Vercel's secret or paste the value into ChatGPT or GitHub.
7. Allow the deployment to build. Check `/api/health` returns `{"status":"ok","service":"apex-intake"}` and `GET /api/ingest` returns HTTP 405.
8. Perform a controlled synthetic **authenticated POST** through an authorized test client, verify a new database row and that a repeated POST yields HTTP 200 without duplicates. Do not use any real customer details.
9. Keep `APEX_INTAKE_ENABLED=false` in Google Apps Script until Fatima's complete Form field mapping is approved and the synthetic test passes.

No Cloudflare login or API token is available to this ChatGPT integration, so deployment must be completed through the dashboard connection. Don't treat a successful GitHub commit as a deployment.

## Local development

```bash
npm install
npm run cf:check   # no account required; TypeScript + tests + Worker bundle dry run
npx wrangler dev
```

For local development only, copy `.dev.vars.example` to `.dev.vars` and fill it with temporary credentials. `.dev.vars` is gitignored. Do not use real production customer records for local tests.

## Rollback

The existing Vercel Node API remains in `api/` and the source in `src/ingest-handler.ts`. Do not disable or delete it until an actual Cloudflare request has been verified. Switching the Google Apps Script `APEX_API_URL` back to the approved previous endpoint is the connector rollback; do **not** try to migrate or duplicate the Neon database.

## Limitations to test

Cloudflare Workers Free currently caps CPU at **10 ms** per request, excluding network wait time. Test real auth, JSON parsing, database transaction and cold-start behavior with synthetic traffic. HTML-to-PDF rendering may exceed this limit; keep PDF rendering as a separate step/provider. There is no full pricing or invoice workflow yet.

A user-entered promo code isn't redeemed atomically yet. Existing tests only validate promo-code arithmetic. Until Fatima approves pricing, never bill or send automatically.
