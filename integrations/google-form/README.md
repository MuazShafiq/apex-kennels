# Apex original Google Form adapter

**Current state (2026-11-06): shadow intake is active.** The existing Form submission trigger copies new responses after the approved 2026-11-04 activation cutoff into the restricted Neon database through Cloudflare. The original Form and linked Sheet remain the operational source of truth. Real invoice creation and customer notifications are off.

- Canonical Apps Script source: [`Code.gs`](Code.gs), synced to the **existing** Form-bound `ApexIntake.gs`.
- Controlled updates: [`docs/form-automation.md`](../../docs/form-automation.md). `npm.cmd run form:sync -- --check-only` first backs up and checks the real remote script without replacing it. Then `npm.cmd run form:sync` updates only the owned script code; it does **not** alter existing triggers or Script Properties.
- Do **not** run `apexPreflight`, `stageApexFieldMapDisabled`, `apexArmRealFormCanary` or `apexActivateShadowIntake` while shadow intake is active. Those are historical setup functions with disabled-intake preconditions.
- Optional bounded recovery (not yet deployed or installed): [`docs/shadow-intake-recovery.md`](../../docs/shadow-intake-recovery.md). After source sync and a successful manual run, a human operator may opt into an hourly Apps Script trigger. It retries new submissions idempotently and stops on conflicts.
- Never change `APEX_LIVE_START_AFTER`, set `APEX_RECONCILE_AFTER` before activation, import past submissions or log customer care details. The current Form source is private; this public repository stores no Form item IDs or credentials.

**Emergency pause:** Run `apexPauseShadowIntake` in the original bound script. New webhooks and the proposed scheduled recovery stop; the Form and Sheet continue. Reopening after a pause requires a review of any missed responses, not a casual new cutoff.
