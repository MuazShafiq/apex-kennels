# Shadow intake: bounded recovery (source-ready, not activated)

**Scope:** Recover missed Google Form -> Cloudflare -> Neon deliveries **after** the owner-approved activation cutoff, without importing historical responses. This is a second-chance delivery path, not a new booking system or invoice process.

## Existing live flow is unchanged

- The existing `onApexFormSubmit` trigger stays installed, and Fatima's Google Form/Sheet remain the source of truth.
- `integrations/google-form/Code.gs` adds `reconcileApexRecentResponses`, `apexHourlyRecovery` and `apexInstallHourlyRecovery`. A GitHub commit **does not deploy** Apps Script changes.
- Reconciliation is strictly post-activation. It checks `APEX_RECONCILE_AFTER >= APEX_LIVE_START_AFTER`, runs with a script lock, sends at most **50** responses per run and saves a cursor **after each successful POST**.
- The Cloudflare ingestion endpoint already deduplicates the same Form response ID. A retry after a crash may replay a response safely; a changed response returns 409 and stops for human review.
- No customer email, invoice, payment, Google Form edit, database schema migration, paid service or historical backfill.

## One-time activation (operator only; do not silently enable)

1. Preserve the original live Form and script. From the existing local repository, review the source, verify that the Form/Sheet workflow still succeeds, and run `npm.cmd run form:sync -- --check-only` to create/check the remote backup and proposed sync. Do not run any staging-only preflight that requires intake to be disabled.
2. When ready, run `npm.cmd run form:sync` using the previously configured script target, or follow `docs/form-automation.md` for its one-time setup. Check that the existing `onApexFormSubmit` trigger, `APEX_LIVE_START_AFTER`, `APEX_RECONCILE_AFTER`, private API token and field map are preserved. The sync does **not** create any recovery trigger.
3. Run **`reconcileApexRecentResponses`** once in the original Form-bound Apps Script editor. Confirm a successful, PII-free `APEX RECOVERY` log and validate restricted Neon counts. This will idempotently replay up to 50 *post-activation* submissions; it never rewrites existing booking records.
4. Then run **`apexInstallHourlyRecovery`** once to install one native Apps Script hourly trigger. Repeating this installation as the same script owner is safe. The trigger resumes from the saved cursor; if intake is paused, it does nothing.
5. Check **Apps Script → Executions** for both the original submission trigger and recovery trigger. Google Apps Script has native installable-trigger failure notifications to the trigger creator; confirm the account receives these. Continue checking Form response IDs against database ingestions periodically, since successful HTTP health checks alone cannot prove completeness.

## Troubleshooting and safety

- **Delivery returns HTTP 409:** the saved response ID now carries different content. Stop; investigate privately. Never overwrite an existing customer booking automatically.
- **HTTP 401/503 or provider downtime:** the cursor is not advanced for the failed record; fix credentials/configuration/service, then rerun manually or allow the next hourly invocation.
- **50+ pending:** subsequent scheduled runs drain the backlog in bounded batches. Do not move the activation cutoff earlier to 'fix' an incomplete import.
- **Invalid cursor:** fail closed; inspect Form and Neon and record an explicit operator decision before adjusting `APEX_RECONCILE_CURSOR`.
- **Pause intake:** run the existing `apexPauseShadowIntake`. It also makes hourly recovery inert, without touching the Form or Sheet.
- **Security:** no response IDs, customer names, addresses, medication, vaccine information, tokens or pet care data belong in logs, screenshots, GitHub, or chat. Review restricted database counts, not raw records.

**Known limitation:** This is at-least-once delivery with a monotone cursor, not a proof that every real Form response reached Neon. The first likely genuine submission was observed in Neon on 2026-11-05, but independently matching it to original Form response #20 remains a separate operator check. Changing the source Form mid-flight or losing a long-running script's permissions still requires investigation.
