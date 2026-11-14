# Windows local development (PowerShell 5.1 / Node 22 or 24)

**Target:** edit Apex in **VS Code at `C:\Users\<YOU>\Downloads\Projects\apex-kennels`** and run the *same Cloudflare Workers code* locally using Wrangler. No production deployment, no live Google Form, no approved pricing, no customer messages.

## First-time setup

1. Install Git and **Node.js 24.x LTS** if missing. Existing Node.js 22.x is also supported. Reopen PowerShell after installation.
2. Open PowerShell and run:

```powershell
node -v       # v22.x or v24.x
git --version
cd "$HOME\Downloads\Projects"
git clone https://github.com/MuazShafiq/apex-kennels.git
cd apex-kennels
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup-local.ps1
```

If you already have a clone, keep using that directory. Do not clone over it, move it during an active agent session, or discard uncommitted work; synchronize only when the worktree is safe.

The setup script is PowerShell 5.1-compatible, uses `npm.cmd` (avoids Windows `npm.ps1` execution-policy problems), installs dependencies, then validates TypeScript, automated tests and Wrangler bundling. It creates `.dev.vars` with **empty, disabled values** if missing and never overwrites an existing secrets file.

## Run and inspect locally

Terminal A (from the repository root):

```powershell
code .
npm.cmd run dev
```

`code .` opens the repository in **VS Code**. If `code` is not recognized, use VS Code → **File → Open Folder** and select `Downloads\apex-kennels`. In VS Code, **Terminal → New Terminal** can run `npm.cmd run dev`; or **Terminal → Run Task → Apex: Dev server**. This local server is simply your usual VS Code development runtime, not another hosting project.

Worker listens at `http://127.0.0.1:8787` with hot reload. Open:

- [Synthetic booking dashboard](http://127.0.0.1:8787/demo/staff)
- [Non-payable invoice preview](http://127.0.0.1:8787/demo/invoice)
- [Local API health](http://127.0.0.1:8787/api/health)

In a **second** PowerShell terminal:

```powershell
cd "$HOME\Downloads\Projects\apex-kennels"
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
cd "$HOME\Downloads\Projects\apex-kennels"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-local-ingest.ps1
```

The script asks for the **local** token and sends one clearly synthetic booking to **127.0.0.1**, repeating it once. Expect HTTP **201** then **200**, with one booking on the **development branch**. It never targets the production URL.

## Common problems

- `node` or `git` not recognized: install it and reopen PowerShell.
- Node v24: supported. Node v26: not yet verified by our CI; use Node 24 LTS until tested.
- `'wrangler' is not recognized`: setup stopped before installing dependencies. Run `npm.cmd install --no-audit --no-fund` in the repository directory and retry `npm.cmd run dev`.
- `npm.ps1 cannot be loaded`: use `npm.cmd`, not `npm`.
- Port 8787 in use: stop another Wrangler session first; don't silently switch port because `local:check` expects 8787.
- Intake HTTP 503: `.dev.vars` has deliberately empty placeholders. This is expected before connecting development secrets.
- Intake HTTP 401: secret supplied doesn't match the local token in `.dev.vars`.
- Intake HTTP 500: check terminal logs and verify the Neon **development** branch connection; do not print credentials.
- Staff HTTP 503: expected until Cloudflare Access is configured. Staff data is never exposed by the public synthetic preview.

## Boundaries

Do not run Wrangler deploy commands for local work. Production deployments currently use an explicitly authorized Wrangler session; GitHub CI does **not** automatically deploy. Do not reapply `db/schema.sql` to an existing Neon branch, change the already-active Google Form forwarding or recovery rules, or seed/test production Neon without a narrowly authorized synthetic procedure.
