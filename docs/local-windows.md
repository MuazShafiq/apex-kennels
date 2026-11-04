# Windows local development (PowerShell 5.1 / Node 22)

**Target:** run Apex locally with the *same Cloudflare Workers code* using Wrangler. No production deployment, no live Google Form, no approved pricing, no customer messages.

## First-time setup

1. Install Git and **Node.js 22.x** if missing. Use the official Node.js 22 release; the generic 'latest LTS' installer may select a newer major version. Reopen PowerShell after installation.
2. Open PowerShell and run:

```powershell
node -v       # must start with v22.
git --version
cd $HOME
mkdir dev -ErrorAction SilentlyContinue
cd dev
git clone https://github.com/MuazShafiq/apex-kennels.git
cd apex-kennels
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup-local.ps1
```

If you already cloned the repository, open that folder, run `git pull --ff-only`, and run the same setup command. Do not clone a second copy unnecessarily.

The setup script is PowerShell 5.1-compatible, uses `npm.cmd` (avoids Windows `npm.ps1` execution-policy problems), installs dependencies, then validates TypeScript, automated tests and Wrangler bundling. It creates `.dev.vars` with **empty, disabled values** if missing and never overwrites an existing secrets file.

## Run and inspect locally

Terminal A (from the repository root):

```powershell
npm.cmd run dev
```

Worker listens at `http://127.0.0.1:8787` with hot reload. Open:

- [Synthetic booking dashboard](http://127.0.0.1:8787/demo/staff)
- [Non-payable invoice preview](http://127.0.0.1:8787/demo/invoice)
- [Local API health](http://127.0.0.1:8787/api/health)

In a **second** PowerShell terminal:

```powershell
cd $HOME\dev\apex-kennels
npm.cmd run local:check
```

The check uses only localhost, sends **no booking or secrets**, and expects the staff route to remain denied while access is unconfigured. It never contacts production.

## Optional: connect a separated Neon development database

Do this only after local previews work.

1. Open the [Neon project](https://console.neon.tech/), select project `apex-kennels` and branch **`local-development`** (ID `br-little-shape-az2ip3cp`). This branch was created on 2026-11-04 and is distinct from **production** (`br-dry-lab-azyb3ewl`). It currently contains only the synthetic data copied from production.
2. Under **Connect**, copy that branch's **pooled** PostgreSQL connection string. Verify branch selection *before copying*.
3. In the repository root, open the ignored local secrets file: `notepad .dev.vars`. Set:

```dotenv
DATABASE_URL="<NEON LOCAL-DEVELOPMENT BRANCH CONNECTION STRING>"
INTAKE_API_SECRET="<FRESH LOCAL RANDOM TOKEN, NOT THE PRODUCTION TOKEN>"
```

To generate a compatible token in Windows PowerShell 5.1:

```powershell
$b = New-Object byte[] 32
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($b); -join ($b | ForEach-Object { $_.ToString('x2') }) } finally { $rng.Dispose() }
```

Never commit `.dev.vars`, paste the connection string in a chat, or put production secrets on a laptop. Wrangler reads `.dev.vars` for local development. Restart `npm.cmd run dev` after editing the file.

4. Open another terminal and run:

```powershell
cd $HOME\dev\apex-kennels
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-local-ingest.ps1
```

The script asks for the **local** token and sends one clearly synthetic booking to **127.0.0.1**, repeating it once. Expect HTTP **201** then **200**, with one booking on the **development branch**. It never targets the production URL.

## Common problems

- `node` or `git` not recognized: install it and reopen PowerShell.
- Node v24/v26: this repository currently pins Node 22. Install or select Node 22.
- `npm.ps1 cannot be loaded`: use `npm.cmd`, not `npm`.
- Port 8787 in use: stop another Wrangler session first; don't silently switch port because `local:check` expects 8787.
- Intake HTTP 503: `.dev.vars` has deliberately empty placeholders. This is expected before connecting development secrets.
- Intake HTTP 401: secret supplied doesn't match the local token in `.dev.vars`.
- Intake HTTP 500: check terminal logs and verify the Neon **development** branch connection; do not print credentials.
- Staff HTTP 503: expected until Cloudflare Access is configured. Staff data is never exposed by the public synthetic preview.

## Boundaries

Do not run `npx wrangler deploy` for local work; deployments are already handled by Cloudflare GitHub integration. Do not reapply `db/schema.sql` to an existing Neon branch. Do not enable live Google Form import before Fatima confirms the form mapping and operational rules. Avoid seeding or testing against the production Neon URL.
