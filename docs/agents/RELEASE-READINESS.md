# Technical release-readiness handoff

Scope: finish independently executable verification and engineering, merge verified changes, and retain every production activation gate closed. This brief does not authorize production migrations, provider sends, account registration, paid capacity, historical backfills or customer contact.

## Priority 1: authenticated Neon validation

Follow [the guarded runner procedure](../neon-migration-validation.md). Project `holy-bar-96685960` and production branch `br-dry-lab-azyb3ewl` are identified by authenticated connector reads. The 2026-11-15 recheck still finds four `parent-data` branches, with no eligible validation target. Do not use the existing development or backup data-copy branches.

The current connector can read branches but cannot specify `init_source=parent-schema` when creating one. The runner has no `NEON_API_KEY` in its process, user or machine environment; the documented local CLI credential paths are absent. An operator must provide an included/free fresh `parent-schema` child named `apex-migration-validation-*` and existing private runner API authentication. Do not mint a key, downgrade identity checks, copy production rows, or substitute a caller-provided database URL.

Identity/URI guard regressions pass locally. Previously recorded restricted PostgreSQL rehearsal and CI are synthetic evidence, not authenticated Neon migration proof. Once prerequisites arrive, run migrations 004–006 rollback/commit, both integration suites and eight-table RLS checks; record actual branch/endpoint IDs, timestamp and digests. Production application remains separately authorized.

## Priority 2: infrastructure issue #78

Recheck existing OAuth using the normal refresh path before assuming an expired access token requires a new login. Use read-only settings, deployment, Workers Builds and Access APIs; never change scopes or security settings to make a check pass. GitHub feature failure and main success alone do not identify the build cause. An empty Access application list does not prove absence of protection or correctness of exact-email policy.

Record current results in [the shared thread](THREAD.md) and [issue #78](https://github.com/MuazShafiq/apex-kennels/issues/78). Leave administrator-only diagnosis and authorized-session acceptance explicitly unresolved when inaccessible.

Measured recheck, 2026-11-14 22:24 UTC (2026-11-15 PKT): normal noninteractive Wrangler OAuth refresh succeeded. Settings and deployment reads returned 200; all five activation bindings remain absent. Deployment `859ecd87-98d9-4757-8d44-d8ac18684283`, version `f5022688-7a7f-41db-851b-a3cd2e76c2df`, matches main `8d1eb08` and successful main build `02e2d43a-e344-43ed-b23a-6721818fb572`. Feature build `77d4b6bd-54a0-4852-a9e1-9edd136c856c` failed; both feature detail/log and main-build API reads still return 403/code 12004. Access app listing returns 200 with total count zero. Administrator read access remains required; no build cause or exact Access policy is established.

## Priority 3: Meta integration

Use [the WhatsApp operator guide](../whatsapp-rollout.md) and [invoice release procedure](../invoice-approval-delivery.md). Callback engineering and fake-provider tests do not establish approved templates, sender registration, app/WABA subscription, billing readiness or delivery. Preserve both everyday WhatsApp accounts and require a separate API sender.

Provider/owner inputs remain: existing Meta business/app access, separate registered sender, approved owner utility and invoice document templates, supported Graph version, protected credentials, exact owner identity and purpose-specific opt-in. Invoice consent must be explicit and recorded; historical Form phone numbers are not consent. No Meta credentials are configured in the inspected local environment. Do not create provider assets or send a test without separately scoped authorization.

## Completion evidence

The task owner records changed files/commit/PR, actual CI and local results, independent review, merge identity, measured deployment and remote gate states in the shared thread. Post-merge production smoke must verify health, closed booking config and rejected POST, intake authentication, anonymous/forged staff denial and synthetic previews. Preserve existing real bookings and the Google Form. Do not describe authenticated Form success from endpoint-auth smoke alone.
