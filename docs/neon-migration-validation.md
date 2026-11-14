# Development Neon migration validation

This procedure tests migrations 004–006 with synthetic data and fake providers. It does not authorize production schema/data changes, financial issuance, messages, gate activation, paid services or credential rotation. No live Neon migration proof was obtained on 2026-11-15. Takeover connector reads now identify project `holy-bar-96685960`, production branch `br-dry-lab-azyb3ewl` and three other branches, all using `parent-data`. None qualifies as a fresh schema-only target. The connector cannot request `init_source=parent-schema`; the local runner has no API management credential. The external dependency is an operator-provided schema-only child and private runner authentication. Do not substitute an existing data-copy branch. A local database URL is not control-plane branch identity.

## What the runner checks

`scripts/check-neon-migrations.mjs` uses only control-plane GET requests. It requires explicit project, production branch/endpoint and development branch IDs; checks their actual relationships; accepts only a ready, non-default, unprotected `parent-schema` child named `apex-migration-validation-*`; and uses the exact development endpoint and URI returned by Neon. It never reads `.dev.vars`, `DATABASE_URL`, CLI credentials, or a caller-supplied database URL. TLS certificate verification is explicit. It creates no branch, compute, credential or billing setting.

Neon's documented [`init_source`](https://neon.com/docs/reference/api/branches/create-project-branch) supports `parent-schema` for copying schema without rows while retaining the parent relationship. The newer CLI `--schema-only` option creates a `schema-only` root branch, which does not retain that verifiable relationship; this runner conservatively rejects that form. These checks use the published API/SDK contract, not a measured authenticated API response from this session.

Before changing the development schema, the runner requires its non-superuser database owner to own every user table, disables silent RLS filtering and verifies every table is empty. Foreign tables are rejected without querying their external source. A populated or FORCE-RLS-hidden table fails before migrations. Partial migration inventories also fail.

Missing migrations first run inside a transaction that is rolled back; relation/function inventory must match the original afterward. They then commit together. Existing complete migration inventories are retained; these SQL files are not advertised as independently rerunnable. The existing invoice and owner suites then test concurrency, idempotency, rollback, callback overlap, immutable evidence and recovery with fake providers. An untrusted role with table grants must see zero rows across all eight tables and be unable to insert status evidence. Temporary test-role grants are rolled back. Test rows remain on the development branch for inspection; the runner refuses to reuse a populated branch.

## Authenticated operator commands

Use an existing management credential privately as `NEON_API_KEY`; do not paste it into a command, issue or chat, create another key, rotate credentials, or provide the production database URL. With an already authenticated CLI, the next read-only command is:

```powershell
npx.cmd --yes neonctl@9.5.0 projects list --no-analytics --output json
```

Identify the project and actual production branch/endpoint from Neon control-plane records and the deployed Worker endpoint fingerprint. Do not assume the default branch is production. Set these non-secret IDs plus the existing database and owner-role names privately in the shell:

```powershell
$env:NEON_PROJECT_ID = '<verified project ID>'
$env:NEON_PRODUCTION_BRANCH_ID = '<verified production branch ID>'
$env:NEON_PRODUCTION_ENDPOINT_ID = '<verified production endpoint ID>'
$env:NEON_TEST_DATABASE = '<existing database name>'
$env:NEON_TEST_ROLE = '<existing database owner role>'
```

Create a fresh schema-only child only after confirming available included/free branch and compute capacity. The following is an explicit development creation request; it does not run in the validator. Capture the response without printing connection credentials. The API contract is documented, but this creation command has not been executed against Neon in this session:

```powershell
$neonHeaders = @{ Authorization = "Bearer $env:NEON_API_KEY" }
$neonBranchName = 'apex-migration-validation-' + (Get-Date -Format 'yyyyMMddHHmmss')
$neonRequest = @{
  branch = @{
    name = $neonBranchName
    parent_id = $env:NEON_PRODUCTION_BRANCH_ID
    init_source = 'parent-schema'
    expires_at = (Get-Date).ToUniversalTime().AddHours(1).ToString('yyyy-MM-ddTHH:mm:ssZ')
  }
  endpoints = @(@{ type = 'read_write' })
} | ConvertTo-Json -Depth 5
$neonCreated = Invoke-RestMethod -Method Post `
  -Uri "https://console.neon.tech/api/v2/projects/$env:NEON_PROJECT_ID/branches" `
  -Headers $neonHeaders -ContentType 'application/json' -Body $neonRequest
$env:NEON_TEST_BRANCH_ID = $neonCreated.branch.id
```

If an included/free branch cannot be created, or this API feature/expiration setting is unavailable, stop at that boundary. Do not upgrade, substitute a data-copying branch, or silently drop the identity checks. Wait for branch initialization to finish, then run:

```powershell
npm.cmd ci --ignore-scripts --no-audit --no-fund
npm.cmd run cf:check
npm.cmd install --no-save --package-lock=false --ignore-scripts --no-audit --no-fund pg@8.16.3
node --experimental-strip-types --test scripts/check-neon-migrations.test.mjs
node --experimental-strip-types scripts/check-neon-migrations.mjs
```

Retain only the project/branch/endpoint IDs, migration digests, test outcomes and timestamps in the handoff. Inspect failed development runs before starting a fresh branch. Expiration applies only to this synthetic branch; do not change production, drop production tables, or rerun `db/schema.sql` there. Production release remains separately authorized.

## Executable local fallback

The original `check-invoice-db.mjs` and `check-owner-alert-db.mjs` CLI URL guards remain loopback-only. The additional rehearsal creates a uniquely named local database and non-superuser owner, applies the pre-004 baseline there, then runs the same validation path. It proves that real PostgreSQL transactions, RLS and role-membership checks work under a restricted owner; it does not establish Neon compatibility or branch creation.

```powershell
$env:NEON_VALIDATION_LOCAL_POSTGRES_URL = '<disposable loopback /postgres admin connection>'
node --experimental-strip-types scripts/check-neon-migrations-local.mjs
```

The local databases/roles are synthetic and retained for inspection. CI runs this rehearsal and the identity/URI regressions on Node 22/24 with disposable PostgreSQL, alongside the original suites. A copied FORCE RLS table containing hidden data is explicitly rejected before migration. The role-membership probe uses an explicit transactional grant before `SET LOCAL ROLE`, which is required for non-superuser role creators on recent PostgreSQL versions.

The rehearsal generates a private random SCRAM password for its non-superuser, `NOBYPASSRLS` role. A wrong-password connection must fail with SQLSTATE `28P01`; trust authentication is deliberately rejected. Configure the disposable cluster loopback host rules to require `scram-sha-256` for test roles (an admin-only trust rule may precede it). No generated password is logged or committed. Partial migration inventory and populated-target refusal are executable regressions.

Measured local result (2026-11-15): PostgreSQL 18.6 / Node 24.19.0, database `apex_neon_rehearsal_1794691335665_cbc1bf1b`: non-superuser SCRAM authentication and wrong-password denial, FORCE RLS hidden-data refusal, partial migration refusal, migrations 004–006 with rollback rehearsal, eight RLS tables, both 15-group integration suites, concurrent issuance/dispatch/callbacks and atomic rollback passed. All providers were fake. This is local PostgreSQL evidence, not authenticated Neon SQL validation.

A session advisory lock covers the entire validator, including both integration suites. A second invocation on the same database fails before inventory/DDL; the local rehearsal verifies contention and successful recovery after release. Connection closure releases the lock even when validation fails. This coordinates this runner only; keep unrelated writers off the validation branch.
