# Production migrations 004–006: prepared application and recovery

This procedure prepares and reviews an atomic schema change. Generating files does **not** connect to Neon, execute SQL, enable bookings, approve/issue invoices or send messages. Execution is a distinct release action; preserve the existing Google Form and all five disabled activation gates throughout.

## Prepare and review

From the reviewed checkout, run:

```powershell
node scripts/prepare-production-migrations.mjs output/production-migrations-reviewed
```

The output directory must be new. The generator refuses overwriting it and refuses changed migration contents. It validates the recorded development-proof SHA-256 values from [the Neon runbook](neon-migration-validation.md), using CRLF canonical text because those measured hashes came from the Windows checkout. LF and CRLF checkouts produce identical LF SQL bundles; no other text normalization occurs. Review both generated files and retain their own SHA-256 hashes with the release record.

`apply.sql` embeds the exact unchanged 004 → 005 → 006 text in one transaction. It enables psql error-stop, requires the expected database and non-superuser owner role, obtains the shared migration advisory lock, rejects target relation/type/function/trigger name collisions and partial installation, and bounds lock/statement/idle-transaction waits. Before COMMIT it checks all eight owner-managed RLS tables with no policies, four private guard functions, eight enabled immutable triggers, three explicit indexes and unchanged pre-existing public relation identities. Exact column/constraint/function definitions derive from the pinned source executed successfully in that transaction; these catalog checks supplement that provenance.

`readback.sql` runs a separate read-only transaction and checks installation/security again, returning only database/role/time and schema/trigger metadata. Neither file reads customer records, seeds invoice numbers, configures bank details, writes outbox messages or runs synthetic application suites. Never run the development migration validator against production: it creates synthetic records and intentionally requires an empty target.

## Release preflight and execution

One operator owns the production lane. Immediately before a separately scoped production application:

1. Inspect current `origin/main`, reviewed migration content and generated artifact hashes. Verify current Worker deployment/version and that all five actual remote activation bindings are absent/false. Run `node scripts/check-production.mjs`; preserve existing Google Form ingestion/recovery. A green smoke proves endpoint behavior, not authenticated Form submission or database identity.
2. Independently bind Neon project `holy-bar-96685960`, production branch `br-dry-lab-azyb3ewl`, direct read-write endpoint `ep-bold-mud-azjqt3cx`, database `neondb`, role `neondb_owner` through fresh authenticated control-plane evidence. Privately confirm this is the deployed Worker's database target. **SQL database/role names cannot prove Neon branch identity**: another branch can have both names. Do not infer binding from a copied URL, old issue comment or this generated SQL.
3. Use the exact authenticated direct endpoint hostname with certificate verification (`PGSSLMODE=verify-full`) and the provider's trusted CA setup. Supply credentials through the existing private PostgreSQL credential mechanism; never put URLs/passwords in command arguments, logs, issues or Git. Configure `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER` privately for that verified target. Do not use a pooler, disable TLS verification or guess a hostname.
4. Use a fresh **psql** process, without startup customization and without interactive password fallback:

```powershell
psql -X --no-password --file output/production-migrations-reviewed/apply.sql
if ($LASTEXITCODE -ne 0) { throw 'Application did not confirm success: follow recovery below; do not replay.' }
psql -X --no-password --file output/production-migrations-reviewed/readback.sql
if ($LASTEXITCODE -ne 0) { throw 'Readback failed: preserve schema and closed gates; investigate.' }
node scripts/check-production.mjs
if ($LASTEXITCODE -ne 0) { throw 'Post-application endpoint acceptance failed: keep gates closed.' }
```

Do not paste the bundle into a connector that batches statements in separate transactions or ignores psql commands. Do not use `--single-transaction` around its existing explicit transaction. The plan is deliberately one-shot: an already installed or partial schema is rejected rather than silently treated as complete. A lock/collision/identity failure requires investigation and a fresh review, not automatic retries.

## Failure and unknown-outcome handling

- **Confirmed SQL/pre-COMMIT failure:** psql stops and closes the connection; PostgreSQL rolls back the complete transaction, including tables/functions/indexes/sequences. Confirm the original catalog remains and keep gates closed. Existing Form records must remain intact. Fix the demonstrated cause and repeat the review before a new application attempt.
- **Connection loss or missing COMMIT acknowledgement:** outcome is unknown. Do not assume rollback and do not replay `apply.sql`. Reconnect read-only to the independently verified target and inspect installation. A successful `readback.sql` establishes the expected installed schema. If it fails, inspect the exact catalog and transaction outcome; absence, partial state and wrong identity are distinct causes. Preserve evidence and use reviewed recovery rather than guessing.
- **COMMIT acknowledged but readback/smoke fails:** committed DDL cannot be undone by issuing ROLLBACK afterward. Keep the new objects inert and all gates closed, preserve data/audits, and prepare a reviewed additive repair if needed. Do not drop tables, reload `db/schema.sql`, restore an old branch over newer Form submissions, seed numbering or activate a lane to debug it.

Record sanitized project/branch/endpoint/database identity, source/artifact digests, timestamps, exit status, COMMIT acknowledgement, catalog/security readback, deployed Worker identity and actual closed gates. No booking-count equality claim is appropriate while real Form intake continues. Financial activation, public booking cutover and Meta onboarding/sends remain their own release decisions and acceptance checks.

## Verification scope

`scripts/prepare-production-migrations.test.mjs` checks deterministic preparation/newline handling, digest tamper refusal and refusal to overwrite artifacts. With explicit `APEX_PLAN_LOCAL_POSTGRES_URL` it accepts only a disposable loopback `/postgres` connection, creates a uniquely named synthetic database/owner and exercises the generated bundle through real psql. The populated baseline verifies preservation, wrong-target refusal, failure after 004, late precommit rollback, relation/sequence/function collisions, operator contention, lock timeout, successful application/readback, replay refusal and postcommit security-failure detection without destructive recovery. It exercises the recovery/readback path after a successful commit; it does not simulate network loss of COMMIT acknowledgement. Local/CI PostgreSQL evidence is not production Neon application proof. Synthetic databases are retained for inspection.
