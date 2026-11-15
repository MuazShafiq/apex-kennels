# Development Neon migration validation

This procedure tests migrations 004–006 with synthetic data and fake providers. It does not authorize production schema/data changes, financial issuance, messages, gate activation, paid services or credential rotation. Authenticated development Neon validation passed on 2026-11-15 through the connected operator using the shared validation core; see the measured result below. The standalone CLI still requires private API management authentication. Do not substitute an existing data-copy branch. A local database URL is not control-plane branch identity.

## What the runner checks

`scripts/check-neon-migrations.mjs` uses only control-plane GET requests. It requires explicit project, production branch/endpoint and development branch IDs; checks their actual relationships; accepts only a ready, non-default, unprotected `parent-schema` target named `apex-migration-validation-*`; and uses the exact development endpoint and URI returned by Neon. It never reads `.dev.vars`, `DATABASE_URL`, CLI credentials, or a caller-supplied database URL. TLS certificate verification is explicit. It issues no explicit branch/compute creation request and changes no credential or billing setting. A schema comparison GET may start temporary computes; confirm included/free capacity before using this fallback.

Neon's documented [`init_source`](https://neon.com/docs/reference/api/branches/create-project-branch) supports `parent-schema` for copying schema without rows. The earlier claim that this necessarily retains `parent_id` was contradicted by the measured response below. When `parent_id` is present, it must equal the explicit production branch ID; null, blank, undefined or another branch is rejected. A correctly linked parent keeps the existing validation path without an operation ID or comparison. `schema-only`, `parent-data` and all other initialization sources remain rejected.

Only an actually omitted `parent_id` can use the fallback. Set `NEON_TEST_SCHEMA_COPY_OPERATION_ID` to the explicit initial schema-copy operation ID. After static identities pass, the runner fetches `/projects/{project}/operations/{operation}` directly, without relying on a paginated operations list. Its exact ID, project, target branch and target endpoint must match; action must be `apply_schema_from_branch`, status `finished` and numeric `failures_count` zero. The operation creation timestamp must be at or after branch creation and within five minutes; its final update must be at or after operation creation and no later than the current time. Missing or invalid timestamps fail closed.

Only then does it GET `/projects/{project}/branches/{target}/compare_schema?base_branch_id={explicit-production}&db_name={explicit-database}`. The response must contain exactly `diff: ''`; whitespace, absent/null values, nonstrings and nonempty diffs are rejected before URI retrieval or SQL. These records establish initial schema-copy completion and current schema equivalence. The operation does **not** identify its source branch, so the fallback does **not** prove historical production lineage. `validateSchemaCopyEvidence` is exported for an authenticated connected operator using the same records; `validateNeonIdentity` still requires full evidence on the omitted-parent path. There is no CLI evidence-file, supplied-URL or skip-validation mode.

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

Create a fresh schema-only target only after confirming available included/free branch and compute capacity. The following is an explicit development creation request; it does not run in the validator. Capture the response without printing connection credentials. The earlier authenticated target observation does not establish that this example command was used:

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

If an included/free branch cannot be created, or this API feature/expiration setting is unavailable, stop at that boundary. Do not upgrade, substitute a data-copying branch, or silently drop the identity checks. Inspect the branch record and its initial operation after initialization finishes. If `parent_id` is omitted, explicitly set the operation ID from authenticated control-plane evidence:

```powershell
$env:NEON_TEST_SCHEMA_COPY_OPERATION_ID = '<verified initial apply_schema_from_branch operation ID>'
```

Then run:

```powershell
npm.cmd ci --ignore-scripts --no-audit --no-fund
npm.cmd run cf:check
npm.cmd install --no-save --package-lock=false --ignore-scripts --no-audit --no-fund pg@8.16.3
node --experimental-strip-types --test scripts/check-neon-migrations.test.mjs
node --experimental-strip-types scripts/check-neon-migrations.mjs
```

Retain only the project/branch/endpoint IDs, migration digests, test outcomes and timestamps in the handoff. Inspect failed development runs before starting a fresh branch. Expiration applies only to this synthetic branch; do not change production, drop production tables, or rerun `db/schema.sql` there. Production release remains separately authorized.

## Authenticated Neon result: 2026-11-15

The connected operator ran the shared guards and actual PostgreSQL suites at approximately 00:14–00:19 UTC, finishing successfully by 00:19:28 UTC. This was authenticated Neon SQL execution, not the local rehearsal and not a standalone API-key CLI invocation.

- Project: `holy-bar-96685960`; explicitly identified production reference: `br-dry-lab-azyb3ewl`, endpoint `ep-bold-mud-azjqt3cx`.
- Test target: `br-solitary-boat-azi8jb9j`, named `apex-migration-validation-20261115045447`; endpoint `ep-wandering-river-azwakr4g`; database `neondb`.
- Target creation: `2026-11-14T23:54:47Z`; unchanged automatic expiration: `2026-11-15T00:54:47Z`. Its authenticated record has `init_source=parent-schema` and omits `parent_id`.
- Initialization operation: `fc027e6a-5ad7-447c-a7c0-70e266724230`, `apply_schema_from_branch`, exact target project/branch/endpoint, finished with zero failures at `23:54:51Z`. A fresh authenticated comparison against the explicit production branch and `neondb` returned `diff: ''` before SQL.
- Passed: non-superuser database/table ownership and all-user-table emptiness; migration transaction rollback and relation/function inventory preservation; migrations 004–006 committed together; eight-table RLS/no-policy inventory; all **18 invoice + 15 owner-alert integration groups**; untrusted-role read denial and status-insert rejection. Providers were fake throughout.

The connector returned a pooled URI and exposes no direct-URI option. Two initial attempts were rejected by the unchanged URI guard **before SQL**, and their private inputs were removed. A reviewed, gitignored one-run bridge then required the returned hostname to equal the authenticated endpoint's `hosts.read_write_pooled_host`, and required its distinct `hosts.read_write_host` to equal the already verified `endpoint.host`. It changed only the parsed hostname to that exact recorded direct host, then applied unchanged `validateTargetConnection` and explicit TLS verification before `validateMigrationDatabase`. No hostname suffix was guessed, and no committed CLI bypass, supplied-URL mode or evidence-file input was introduced. The private connection input was removed in `finally` and its absence checked after the successful run.

Migration digests recorded by the actual run:

| Migration | SHA-256 |
| --- | --- |
| `004_invoice_approval.sql` | `e47be8e34c3cef212fd79f4af8d7a844951ffab5e3159de1507c77904f70b568` |
| `005_invoice_delivery.sql` | `e6ab0eed51e383ebb9a7e1a0f04a28a0cfcf2cf8bd699fadf07b209e1d241f2a` |
| `006_owner_booking_alerts.sql` | `ca764706012b853d782a1deb911b150eba90ff9fa292bf4bed6e9c2dc5900f0b` |

At 00:19:59 UTC an independent reviewer made authenticated, read-only queries against this exact test branch and confirmed all eight migrated tables have RLS enabled and zero policies; only aggregate synthetic row counts were read. That independently verifies the resulting schema/security state, not a second execution of the 33 integration groups. The reviewer also independently passed all 17 guard regressions and found no remaining code blocker.

Synthetic test rows are retained under the unchanged scheduled expiration; expiration itself has not been independently observed. The schema now intentionally differs from production and the target is populated: do not rerun or weaken the comparison/empty-table checks to reuse it. No production migration, credential rotation, gate activation or Meta request occurred. Production application and live Meta acceptance remain separately authorized release work. Initialization evidence plus schema equality does not establish historical parent lineage. The one-run private bridge was removed after use as well as its connection input.

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
