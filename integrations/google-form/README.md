# Apex Google Form adapter (staging; not live)

The canonical Apps Script source is [`Code.gs`](Code.gs), synced to the **existing** form-bound `ApexIntake.gs` file. It is not a deployed integration. **Do not enable a submit trigger, import past responses, send invoices or turn on `APEX_INTAKE_ENABLED`**.

The real five-section Google Form was inspected on 2026-11-04. All 19 item IDs were successfully discovered and verified in Apps Script. The in-memory synthetic mapping check passed without reading past responses or sending requests. A separate local Worker + Neon development-branch test already passed HTTP **201 / 200 / 409**, including detailed pet-care storage.

## Working routine

Follow **[the one-time VS Code setup](../../docs/form-automation.md)**. The normal update command is:

```powershell
npm.cmd run form:sync
```

It runs tests, backs up the entire current remote Apps Script project, checks for duplicate functions, and updates the existing `ApexIntake.gs`. It does not create a trigger or enable ingestion. After an update, run **`apexPreflight()`** once from the Apps Script editor, which consolidates mapping verification and synthetic response conversion while keeping intake disabled.

The old manual workflow of copying a new `Code.gs` into `ApexIntake.gs` and running several separate diagnostics is retired for routine development. See [staging and database migration notes](../../docs/full-form-intake-staging.md).

## Cutover gates

- Owner-approved full pricing rules, consent/data handling and staff access.
- Production database migration applied and verified *before* the new Worker is deployed.
- Real, clearly synthetic Form submission end-to-end verified without touching the existing customer records.
- Install the Form submit trigger and enable `APEX_INTAKE_ENABLED` only after the preceding steps are satisfied.
- Monitor failures/retries. Historical backfill is separate and requires explicit approval.

No real Form submission, customer notification, production invoice or production migration has been performed by this staging branch.
