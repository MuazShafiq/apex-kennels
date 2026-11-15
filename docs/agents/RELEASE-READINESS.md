# Technical release-readiness handoff

Scope: finish independently executable verification and engineering, merge verified changes, and retain every production activation gate closed. This brief does not authorize production migrations, provider sends, account registration, paid capacity, historical backfills or customer contact.

## Priority 1: authenticated Neon validation

**Development proof completed, 2026-11-15 00:19 UTC.** Follow [the guarded runner procedure and measured result](../neon-migration-validation.md). Authenticated target `br-solitary-boat-azi8jb9j` in project `holy-bar-96685960` reports `parent-schema` but omits `parent_id`; the previous linked-parent assumption falsely rejected it. The corrected fallback requires exact successful initial schema-copy operation evidence plus a fresh empty schema diff against explicit production `br-dry-lab-azyb3ewl` and database `neondb`. This establishes initialization and current equivalence, not historical source lineage. A present wrong/null parent still fails; existing data-copy branches remain ineligible.

The authenticated connector execution used endpoint `ep-wandering-river-azwakr4g`, database `neondb`, and the unchanged identity/URI/empty-owner/RLS guards with TLS verification. All migrations 004–006 rollback/commit checks, 18 invoice and 15 owner integration groups, and eight-table RLS checks passed with fake providers. An independent read-only target audit confirmed all eight tables have RLS enabled and zero policies. Digests and connector direct-host accommodation are recorded in the runbook; no standalone API-key CLI run is claimed.

The test branch retains synthetic rows and its original `2026-11-15T00:54:47Z` expiration; do not reuse it by bypassing schema comparison or emptiness checks. The standalone CLI still needs private API authentication for future fresh targets. Production application remains separately authorized; no production schema/data change, credential rotation, provider contact or activation occurred.

## Priority 2: infrastructure issue #78

Recheck existing OAuth using the normal refresh path before assuming an expired access token requires a new login. Use read-only settings, deployment, Workers Builds and Access APIs; never change scopes or security settings to make a check pass. GitHub feature failure and main success alone do not identify the build cause. An empty Access application list does not prove absence of protection or correctness of exact-email policy.

Record current results in [the shared thread](THREAD.md) and [issue #78](https://github.com/MuazShafiq/apex-kennels/issues/78). Leave administrator-only diagnosis and authorized-session acceptance explicitly unresolved when inaccessible.

Measured recheck, 2026-11-14 22:24 UTC (2026-11-15 PKT): normal noninteractive Wrangler OAuth refresh succeeded. Settings and deployment reads returned 200; all five activation bindings remain absent. Deployment `859ecd87-98d9-4757-8d44-d8ac18684283`, version `f5022688-7a7f-41db-851b-a3cd2e76c2df`, matches main `8d1eb08` and successful main build `02e2d43a-e344-43ed-b23a-6721818fb572`. Feature build `77d4b6bd-54a0-4852-a9e1-9edd136c856c` failed; both feature detail/log and main-build API reads still return 403/code 12004. Access app listing returns 200 with total count zero. Administrator read access remains required; no build cause or exact Access policy is established.

## Priority 3: Meta integration

Use [the WhatsApp operator guide](../whatsapp-rollout.md) and [invoice release procedure](../invoice-approval-delivery.md). Callback engineering and fake-provider tests do not establish approved templates, sender registration, app/WABA subscription, billing readiness or delivery. Preserve both everyday WhatsApp accounts and require a separate API sender.

Provider/owner inputs remain: existing Meta business/app access, separate registered sender, approved owner utility and invoice document templates, supported Graph version, protected credentials, exact owner identity and purpose-specific opt-in. Invoice consent must be explicit and recorded; historical Form phone numbers are not consent. No Meta credentials are configured in the inspected local environment. Do not create provider assets or send a test without separately scoped authorization.

The shared `/api/whatsapp/webhook` now routes signed sender-filtered status evidence to both stores using dedicated receipt secrets. Legacy endpoints remain available. Invoice acceptance, reconciliation and callbacks share a provider-ID transaction lock; replay reapplies retained evidence without duplicate audits. Both stores and migrations 004–006 are required for the shared callback. Local verification: 318 application tests/typecheck/dry-run; 18 invoice plus 15 owner PostgreSQL groups on synthetic database `apex_neon_rehearsal_1794695374869_c5ad70a5`, including restricted SCRAM, rollback, RLS, callback overlap and duplicate repair. Independent review found the invoice race and approved its fix; 14 relevant tests were independently rerun. This is local/fake evidence, not Neon or Meta acceptance.

## Completion evidence

The task owner records changed files/commit/PR, actual CI and local results, independent review, merge identity, measured deployment and remote gate states in the shared thread. Post-merge production smoke must verify health, closed booking config and rejected POST, intake authentication, anonymous/forged staff denial and synthetic previews. Preserve existing real bookings and the Google Form. Do not describe authenticated Form success from endpoint-auth smoke alone.
