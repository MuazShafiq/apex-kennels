# Apps Script automation for Apex (staging only)

**Single source of truth:** `integrations/google-form/Code.gs` in this repo, synced to the **existing** form-bound `ApexIntake.gs` file. The other remote script files (including `Code.gs`) and manifest are preserved from a fresh remote backup.

## One-time setup in VS Code

From `$HOME\Downloads\apex-kennels` on `feat/full-form-intake-staging`:

1. Open [Google's Apps Script API settings](https://script.google.com/home/usersettings) and enable **Google Apps Script API**, if disabled.
2. Log in with the account that already edits the real form:
   ```powershell
   npm.cmd run form:login
   ```
   Google OAuth authentication is local to your computer; **never copy credentials into this repo or chat**.
3. Sync to the **existing** script, using its Script ID from Apps Script → **Project Settings** (not the Form ID):
   ```powershell
   npm.cmd run form:sync -- --script-id=<YOUR_EXISTING_APPS_SCRIPT_SCRIPT_ID>
   ```

The first sync stores the Script ID in ignored `.apex-form-target.json`. Future changes need only:

```powershell
npm.cmd run form:sync
```

The script runs the local test suite, pulls a timestamped **unaltered backup** of all remote script files to `.apex-form-backups/`, detects global function duplicates, replaces only `ApexIntake.gs` in a separate upload copy, then uses `clasp push --force`. **Google's API replaces the entire script project per push**, so this pull-then-push method is deliberate; do not remove the backup or collision safety checks. `--check-only` compares code and backs up the remote project without pushing.

Once synced, use the function dropdown in the Apps Script editor to run **`apexPreflight`**. That **one run** independently remaps, validates and runs the fully in-memory synthetic fixture, then confirms `APEX_INTAKE_ENABLED=false`. It does not read or submit existing responses, install triggers, or send HTTP requests. This is the only Apps Script check required before a separately approved end-to-end activation.

## Hard safety boundaries

- This is **not live intake**. The production database has not received the new full-form migration, and the Cloudflare production Worker isn't updated. PR #9 remains draft.
- No installable form-submit trigger has been enabled. Do not enable one in this stage.
- Do not run `reconcileApexRecentResponses()` against historical responses.
- No payments, real invoices, or customer messages are generated.
- `.apex-form-backups/` and `.apex-form-target.json` must remain local and out of Git. OAuth credentials from clasp are especially sensitive.
- If **another editor** changed any remote script file since the pull, the tool cannot detect that race. Stop editing remote code while synchronizing; review the backup if source differences appear.
- Do not call `clasp run-function` just to automate the one-time preflight; Google's remote execution setup requires extra Cloud credentials and an API deployment, which isn't justified here.

This is optimized for **one login, one sync command, one safe preflight**, without introducing a separate background service or SaaS expense.
