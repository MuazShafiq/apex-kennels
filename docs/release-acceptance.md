# Remaining release acceptance

## Current gate-picker scope — 2026-11-17

Canonical [founder scope #93](https://github.com/MuazShafiq/apex-kennels/issues/93) supersedes the earlier customer-search approach. Use the free MapLibre/OpenFreeMap exact-gate picker, consumer Google Maps link/paste and optional GPS. Autocomplete and the scheduled F-10 provider probe are retired; [removal inventory and retained namespace compatibility](location-search.md). This source change is not deployment or physical-device acceptance. Keep every booking/financial/message flag closed.

## Historical Phase 1 checkpoint — 2026-11-16

**HOLD public cutover.** Engineering and live search evidence do not replace Fatima's own staff login, real-phone/affected-ISP acceptance, valid-unallowlisted identity denial, or explicit cutover approval. See #84's [current assignment](https://github.com/MuazShafiq/apex-kennels/issues/84#issuecomment-6923859043). Migrations 004–007 are already applied/read back; do not reapply. Cloudflare/Geoapify Free-account and search-guard verification is settled in that assignment.

| Evidence | Outcome and scope |
| --- | --- |
| Main `607796677ec9a3229d4414c3551b87ba83d60db4` foundation CI | PASS, run `43916929774`; local Node 24 cf:check also passes 353 tests/typecheck/Worker dry-run. |
| Current runtime | Version `6ca5541f-baa0-479b-82de-b870db3d7109`, 100%, created 2026-11-16 17:19:07 UTC. Fresh settings read has 13 bindings, all five activation flags absent. |
| Closed-gate/security and real search | PASS locally: production checker; wrong-origin 403 and same-origin 200 bounded F-10 suggestions, one provider request. Earlier main smoke `43916929769` failed provider-network before the current deployment; verification-only run `43917188010` passed. Fresh main workflow verification is recorded in the shared thread. |
| Browser acceptance | PASS synthetic booking combinations and all 42 responsive layouts; providers/persistence are stubs. Live desktop selected F-10 and confirmed a gate with submission disabled. No real phone/ISP, Turnstile, Neon write or message is inferred. |
| Fatima's exact identity in both enforcement layers | UNKNOWN: current admin API returns HTTP 200 with zero Access applications; Worker allowlist exists as encrypted secret. Neither observation proves a missing policy or an email match. Existing authenticated dashboard evidence remains valid history. Do not recreate Access or read/print secret values to resolve this. |
| Fatima login; valid unallowlisted identity; physical phone/ISP | UNKNOWN: human acceptance remains required. |
| Original services and six terms | Founder accepted reuse in #28 on 2026-11-16. Do not request duplicate reuse approval. Exact Form word-for-word comparison remains unverified. New optional WhatsApp consent and sending remain separate. |

### Fatima-only login and dashboard check

1. On her own phone, open [staff](https://apex-kennels-api.muaz-shafiq18.workers.dev/staff), sign in with her previously provided approved email and complete her own login challenge. No password, OTP or JWT should be shared with an agent.
2. Confirm the queue opens, an existing booking detail opens, and transport pin links are usable. Inspect privately; report only pass/fail and sanitized time/version, never booking details/screenshots.
3. Confirm who will check the queue and how often during Phase 1: with WhatsApp alerts off there is no automatic website-booking notification. Review transport manually; do not approve/issue/send an invoice during acceptance.
4. Separately, an owner-controlled existing identity outside the allowlist must authenticate and be denied. Do not change the policy or register an account to manufacture the test.

The operator still needs an existing authenticated Access-admin session to compare Fatima's previously supplied email privately against the exact policy and protected Worker allowlist configuration. Preserve other authorized staff. Any protected configuration change needs its own smallest scoped authorization; a denied login alone is not permission to change policy.

### Exact cutover and recovery actions (not authorized yet)

After the required acceptance and explicit founder approval, the sole operator sets remote plain-text `APEX_PUBLIC_BOOKING_ENABLED` to exactly `true`, retaining existing database/Turnstile secrets. Verify config `enabled:true`, Turnstile on the existing hostname and invalid empty same-origin POST rejection before any authorized real submission. No token rotation, migration or financial/message flag change is needed.

Replace the externally published customer booking link with `https://apex-kennels-api.muaz-shafiq18.workers.dev/book`. Inventory the actual publication locations privately before changing them; they are not tracked in this repository. Keep the current Google Form link available as fallback and leave its authenticated ingest/recovery unchanged. Do not guess a Form URL.

The existing production checker and manual deployment procedure intentionally require the booking gate closed. The separate `scripts/check-booking-cutover.mjs` checks live config, empty-envelope 400, wrong-origin 403 and anonymous staff denial, without a booking or Turnstile token. Scheduled monitoring defaults to the unchanged closed checker; only at approved persistent cutover set GitHub repository variable `APEX_PUBLIC_BOOKING_MONITOR_MODE=live`. That variable selects verification and cannot activate bookings. The no-write gate-picker check runs in both modes; it verifies current assets, exact local pin parsing and ambiguous/outside/cross-origin refusal without contacting map/geocoding providers. Independently check actual remote financial/message flags remain absent; HTTP checks alone do not prove those secret/configuration states. The guarded manual deploy procedure remains closed-state-only: do not invoke it against a live release or open a new deployment lane without a separately reviewed procedure.

Rollback sets the remote booking flag to `false`/absent, removes/resets the monitor variable, restores the customer link to the existing Form and verifies config `enabled:false`, POST 503 and the full existing production checker. Preserve already received bookings. No monitoring variable or Worker gate has been changed during preparation.

Use this record for #28/#37/#39/#78. Existing automated checks and preparation are recorded in [the shared thread](agents/THREAD.md); they do not replace the human/device/provider checks below. The operational Google Form remains the customer path and fallback. This checklist does not change runtime flags or send messages.

## Real phone and network: #37

Record date, deployed Worker version, device/OS/browser, network (mobile data or the previously affected ISP), and pass/fail with a brief failure description. Repeat the connectivity checks on both networks. Keep private pins, customer details and staff screenshots out of Git/issues.

Open the [booking preview](https://apex-kennels-api.muaz-shafiq18.workers.dev/book) on a real Android or iPhone. While public submissions are closed, test these controls without submitting:

| Check | Expected result |
| --- | --- |
| Open page on mobile data and affected ISP | Preview loads; form controls remain usable; public submission remains closed. |
| Choose on map | Map loads with attribution; pan/zoom beneath the central pin and explicitly confirm the exact entrance. Initial view is never selected automatically. |
| Move after confirming | Panning or another location choice clears stale confirmation; submission needs the new exact gate confirmed. |
| Separate drop-off picker | One reused map supports independently selected and confirmed pickup/drop-off gates. |
| Map/WebGL/tiles unavailable | Clear guidance and usable exact Google Maps link/coordinate/GPS fallback; there is no customer provider-search dependency. |
| No transport | Explicit selection; both service selections clear and pin controls hide. |
| Pickup only / drop-off only | Only the relevant gate input appears and retains its selected exact pin. |
| Both, same gate | Reuse-pickup is selected by default; no second required gate input. |
| Both, distinct gates | Uncheck reuse; each independently selected gate remains visible and distinct. |
| Maps app → Share → return/paste | An exact dropped-pin share, including `maps.app.goo.gl`, resolves to the selected gate. |
| Named-place or vague Maps link | Accept only an explicit exact pin; otherwise show correction guidance without guessing. |
| GPS permission granted, denied or unavailable | Valid location can be chosen; denial/failure offers Maps/coordinate alternative and does not fabricate a pin. |
| Out-of-service-area point | Clear rejection; customer can correct the pin or select no transport. |
| Change transport choices after choosing pins | Relevant pin survives; hidden pickup/drop-off controls do not submit a wrong gate. |

Separately scoped synthetic submission acceptance must use a preplanned disable/recovery path: exact deployed version and remote gate states, real Turnstile hostname/action, one clearly synthetic booking, protected staff-only readback of the same selected gate(s), and no invoice/provider message. Close the gate on success **or failure**; verify `/api/book/config` returns `enabled:false`, public POST rejects, and the production checker passes. Never leave it open while debugging. Browser emulation and the historical desktop canary do not complete real-phone acceptance.

## Fatima: exact copy, terms and consent

Review the current deployed `/book` page and its expandable **Read boarding terms** section, rather than approving a paraphrase. The six displayed clauses concern supervised play, emergency care/expenses, boarding stress/veterinary care, daily care, sickness/loss/injury liability, and property damage. This inventory identifies the text to review; it does not validate its medical or legal claims.

Founder accepted reuse of the original services and six clauses in #28 on 2026-11-16; do not ask for duplicate reuse approval. Record any requested corrections to the deployed copy explicitly. Approval of the newly introduced optional WhatsApp wording remains separate from Form reuse and public cutover. Confirm that a request is not a confirmed reservation and does not automatically create a payable quote, invoice or message. The optional checkbox is purpose-specific evidence; historical Form phone numbers are not consent.

Suggested decision record (not a recorded approval):

> Reviewed `/book` at Worker version __ on __. Copy, six boarding clauses and consent wording: approved / changes required: __. This copy decision is separate from public-link cutover, financial issuance and messaging activation.

## Staff, transport and invoice acceptance

- #78: existing Access policy and positive staff acceptance are evidenced, as are anonymous/forged assertion denials. Still test a **valid signed-in identity outside the exact allowlist** and record denial without extracting JWTs, altering policy or exposing booking data.
- Authorized staff must verify the actual kennel entrance, Bawli driving access in both directions, customer gates and independent full driving loops; validate the current local pump fuel/exception basis. Transport remains review-only. National petrol notices are baseline evidence, not a pump-price verification.
- Confirm exact invoice approver identity, current manual four-digit invoice number and coordination with manual issuance; configure Fatima's payment details through the protected channel. Keep bank/account/contact information out of Git/issues. The Canva template remains unchanged.

## Database and provider release

- Production migrations 004–007 are already applied/read back according to the current #84 handoff. Do not repeat them. The [preparation procedure](production-migration-procedure.md) remains recovery/reference material, not an outstanding Phase 1 application task. Never run synthetic integration suites on production.
- The Meta owner supplies the separate API sender, business/app access, approved utility/document templates, protected token/signing settings, subscription and purpose-specific consent. Preserve both existing everyday WhatsApp accounts. Verify app/version compatibility and the full live acceptance/recovery path with a consented synthetic recipient under its own release scope; provider acceptance is not delivery.
- Public booking cutover, invoice issuance and each send lane require their own completed acceptance. Founder-wide engineering/tool authorization does not supply another person's opt-in, physical-device evidence or provider credentials. Do not treat a waiting prerequisite as a reason to invent new features.

Record only sanitized version/branch IDs, timestamps, outcomes and evidence links. Existing real bookings/Form recovery must survive every step. Do not drop live migration objects, reset a production branch, backfill historical submissions or rotate tokens to recover from a failed acceptance check.
