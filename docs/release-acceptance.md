# Remaining release acceptance

## Stage 1 controlled production test — 2026-11-22 PKT

**Closed. Stage 1 booking, v2 consent and distinct transport pins verified.** This checkpoint supersedes the earlier migration and widget status below. Production migration 008 was already applied. A read-only catalog check in Neon project `holy-bar-96685960`, branch `br-dry-lab-azyb3ewl`, compute `ep-bold-mud-azjqt3cx`, database `neondb`, independently confirmed the validated constraint allows exactly v1 and v2. The managed **Apex Kennels Booking** widget was updated and read back with both `apex-kennels-api.muaz-shafiq18.workers.dev` and `apexkennels.pages.dev`.

For the distinct-gate run, the founder confirmed the visible **Pickup · gate confirmed, drop-off · gate confirmed** summary in a standalone browser before submitting once. Protected Neon readback matched one website booking to the unique synthetic marker, with transport requested, one confirmed `both` transport row, and exact matches for both submitted coordinate pairs. The earlier booking recorded transport requested=false and was preserved.

The booking-only window used deployment `edf8c308-52ab-4900-b5fa-24a5dd41904e` with a separate five-minute watchdog. On positive readback, rollback restored V10.6 baseline version `d30cb893-b3c5-4458-8d6a-84a6783d3e66` at 100% via deployment `11ab6b68-6085-4119-a964-38e1be66c0c5`. The watchdog independently confirmed closure. Both hosts returned config HTTP 200 with `enabled:false` and booking POST HTTP 503. The full closed production smoke passed and all five activation flags were absent.

In the first standalone retry, the founder confirmed Cloudflare browser compatibility before opening, operated the browser independently, and reported one successful confirmation. Protected Neon readback matched the confirmation reference to exactly one website booking in requested status and one website v2 consent record. The saved record differed from the staged synthetic marker and dates and had zero transport rows. This verified real Pages submission and v2 consent persistence before the distinct-gate run above.

The standalone window armed a separate 180-second watchdog and served the temporary booking-only version in deployment `457b46ef-7d2b-4562-ac2a-052c0d6da07b`. Timed rollback restored baseline version `d30cb893-b3c5-4458-8d6a-84a6783d3e66` at 100% via deployment `5bf7ce26-7129-4eae-b133-4cdaccadd945`. The watchdog, independent Worker and Pages HTTP probes, full production smoke and all five activation-flag checks passed. No widget, schema, Form, staff, customer-link, monitor or financial configuration was changed during this retry.

The closed Pages rehearsal reached the final step with two independently confirmed synthetic pins and explicit service consent. The timed attempt armed a separate 90-second watchdog before sending traffic to the temporary version. The live Pages form reached the real widget, which presented an unchecked **Verify you are human** checkbox and kept submit disabled. No booking POST occurred. The protected database count for the unique synthetic marker remained zero, so production persistence, gate readback and v2 consent readback remain pending.

The immediate rollback restored exact Worker version `d30cb893-b3c5-4458-8d6a-84a6783d3e66` at 100% via deployment `04304f45-9b43-4d66-a487-c3f26ac5137d`. Independent probes of both hosts returned config HTTP 200 with `enabled:false` and empty booking POST HTTP 503. The full closed smoke passed. All five booking, invoice and WhatsApp activation flags were absent in the restored version. The temporary test version `bdac6ea4-ec4c-4a3d-ab14-bd4406ce7201` is inactive and carries the enabled booking flag. Use the serving closed version as the baseline for later configuration work. Google Form, staff, links, monitor mode, invoice settings and payments were left untouched.

The human-assisted retry used deployment `f8697209-0c6c-4c60-8a52-8f7f2e3685c3` after founder readiness and armed a separate 120-second watchdog. The headed, automation-connected Chrome window showed **Verification failed** and submit stayed disabled. The console recorded `600010`. The booking observer saw no POST, and protected Neon readback found zero bookings, transport rows and v2 consent rows for the new marker. Cloudflare documents `600*` as a generic challenge failure and excludes automation frameworks from supported production challenge environments. The error alone does not identify the cause. [Turnstile error codes](https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/error-codes/) and [supported browsers](https://developers.cloudflare.com/cloudflare-challenges/reference/supported-browsers/).

Failure rollback restored the exact baseline at 100% via `9c848aa1-e320-4a1a-8a8c-cb6d146541b1`, about 84 seconds after the temporary deployment. The watchdog independently confirmed closure. Fresh probes on both hosts returned `enabled:false` and POST 503, the full production smoke passed, and all five activation flags were absent. Migration 008, Turnstile settings, monitor mode, customer links and Form/staff configuration were untouched in the retry.

Persistent activation and customer-link cutover require separate approval. The current closed state preserves the existing Google Form and its recovery path.

## Current booking release decision — 2026-11-22 PKT

**HOLD. cdx-18 owns booking release engineering.** Approved V10.6 + CTA Motion is merged at `fa3dc4d` and served by Worker deployment `0bbf3142-6133-41fa-b597-11a2f918645b`, version `d30cb893-b3c5-4458-8d6a-84a6783d3e66` at 100%. The [main Node 22/24 run](https://github.com/MuazShafiq/apex-kennels/actions/runs/44940356936), [browser suite](https://github.com/MuazShafiq/apex-kennels/actions/runs/44940131451) and [production monitor](https://github.com/MuazShafiq/apex-kennels/actions/runs/44940356930) passed. Booking browser persistence and provider responses were synthetic.

- Fresh production and gate-picker checks passed. Both the [Worker](https://apex-kennels-api.muaz-shafiq18.workers.dev/book) and [Pages alias](https://apexkennels.pages.dev/book) serve V10.6, return `enabled:false` and reject empty booking POSTs with 503. Pages returns 404 for staff, intake and WhatsApp webhook. The serving version's binding inventory includes database, intake and both Turnstile bindings. All five booking/invoice/WhatsApp activation gates are absent. Staff drafts are enabled. The repository monitor mode is unset.
- Read-only production Neon catalog inspection confirmed the validated v1-only consent constraint in project `holy-bar-96685960`, branch `br-dry-lab-azyb3ewl`, compute `ep-bold-mud-azjqt3cx`, database `neondb`. [Migration 008](../db/migrations/008_whatsapp_service_consent.sql) replaces that constraint atomically, retaining v1 and allowing v2. The [PR rehearsal](https://github.com/MuazShafiq/apex-kennels/pull/116) applied it twice on disposable local PostgreSQL, retaining v1 evidence and validating v2. Production application and readback are pending authorization.
- The managed **Apex Kennels Booking** Turnstile widget currently lists only `apex-kennels-api.muaz-shafiq18.workers.dev`. The production pair is stored in Worker bindings. Confirm privately that the widget matches the bound pair. If Pages is the intended customer link, separately authorize adding exact hostname `apexkennels.pages.dev` while retaining the Worker hostname. The gateway forwards the incoming hostname and the Worker expects Siteverify success, that exact hostname and action `apex-booking`. Use the real widget on the selected host. [Cloudflare Siteverify requirements](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)

### Human acceptance before opening

1. Fatima opens the Worker staff link with her own approved identity, confirms queue and private detail access, and names the primary and backup queue checkers and their cadence while alerts are off. Privately verify the exact Access/Worker allowlist match and test denial using an existing authenticated unallowlisted identity.
2. Fatima approves the exact V10.6 **required, initially unchecked** WhatsApp service-consent wording for booking updates and the approved invoice. The founder already accepted reuse of the original Form services and six boarding clauses. Any WhatsApp sending requires separate approval.
3. On physical iPhone/Safari, run the [phone and network checklist](#real-phone-and-network-37) on the intended customer hostname with mobile data and the previously affected ISP. Record device/OS/browser, host, network, time and pass/fail for each scenario. In the final form step verify the consent checkbox starts unchecked and reads as approved. Keep identities, screenshots with private data and precise pins out of issue comments.
4. An authorized Form operator privately confirms recent successful authenticated ingest and recovery status from existing Form/Apps Script records. The closed smoke only verifies unauthenticated ingest rejection. Record the existing Form URL and external booking-link locations privately for restoration.

### Production sequence after authorization

1. Agree on the customer hostname and obtain explicit approval for migration 008, any widget hostname change, and a timed synthetic production acceptance window. Assign one operator to open and close the gate. Keep the existing Form as customer entry during the window. Record the currently serving version and prove access to the Cloudflare production variable editor and link-restoration controls before opening.
2. With the gate closed, confirm the direct, TLS-verified Neon connection targets the production branch/compute above and read the catalog constraint again. If it is already validated for exactly v1/v2, record that and skip DDL. If it is missing or has another definition, stop and reconcile. For the observed v1-only state apply only the tracked 008 file in one direct psql session with `ON_ERROR_STOP` and bounded lock/statement timeouts. The file supplies its own transaction.

   ```powershell
   # Supply the authorized direct connection privately through libpq settings.
   psql -X -v ON_ERROR_STOP=1 -c "SET lock_timeout = '5s'; SET statement_timeout = '30s';" -f db/migrations/008_whatsapp_service_consent.sql
   ```

   Read back the named constraint from `pg_constraint` on `public.booking_whatsapp_consents` with `pg_get_constraintdef(oid)`. Require `convalidated=true` and exactly `website-booking-v1` and `website-booking-v2` allowed. No backfill. On failure keep the gate closed. Verify closed smoke and Form continuity again.
3. Confirm the production widget allows the selected exact hostname. If Pages is selected, verify both the Pages gateway and Worker baseline, including private-route 404s on Pages. At the approved test time set only `APEX_PUBLIC_BOOKING_ENABLED=true` in the deployed Worker's production variables. Run `node scripts/check-booking-cutover.mjs` on the Worker. For Pages also check config reports enabled, same-origin empty POST returns 400, cross-origin POST returns 403 and private paths stay 404. Keep the scheduled monitor in closed mode during the short test.
4. Submit one clearly synthetic booking from the real phone on the actual customer host with the real Turnstile widget, explicit service consent and distinct confirmed pickup/drop-off gates. Privately verify one corresponding staff detail, both exact gates and one v2 consent record on the identified production branch. Record only sanitized outcomes. Close the shared gate immediately on success, failure or timeout. Verify both hosts report `enabled:false` and POST 503, rerun `node scripts/check-production.mjs`, and confirm Form continuity. Leave approved additive schema in place and preserve bookings.
5. Obtain separate persistent launch approval. Reconfirm binding inventory, schema, widget, acceptance and queue coverage. Set only the production public-booking flag to `true`, verify the open-state checks, set repository variable `APEX_PUBLIC_BOOKING_MONITOR_MODE=live`, and verify the scheduled monitor. Publish the accepted `/book` URL in the agreed locations and retain the existing Form fallback. Invoice approval/issuance, owner and customer messaging stay closed. There is no payment collection to activate in this release.
6. On cutover failure set the production flag to `false` or remove it first, restore the prior customer links, remove/reset the monitor variable, and verify both hosts reject submission with 503 and show `enabled:false`. Rerun the closed production checker and privately verify Form continuity. Preserve real bookings and migration 008. The guarded manual deployment procedure expects the booking gate closed.

The dated sections below preserve earlier findings. Use this checkpoint for current booking release decisions and the phone matrix below for device acceptance.

## Current gate-picker scope — 2026-11-17

Canonical [founder scope #93](https://github.com/MuazShafiq/apex-kennels/issues/93) supersedes the earlier customer-search approach. Use the free MapLibre/OpenFreeMap exact-gate picker, consumer Google Maps link/paste and optional GPS. Autocomplete and the scheduled F-10 provider probe are retired; [removal inventory and retained namespace compatibility](location-search.md). This source change is not deployment or physical-device acceptance. Keep every booking/financial/message flag closed.

PR #110 merged at `bc08963feb36a36631f8652bbc9733aec315cdc2`. Measured deployment `15341daf-b322-4356-a87c-dab5ac71a54f`, version `64e7a9c7-5b99-434e-8159-29f5a740e3ed`, 100%, created 2026-11-16 22:03:11 UTC. Fresh 11-binding inventory confirms all five activation flags absent/false. Main Node 22/24 CI `43966002361`, Workers Build `ff0db47d-0266-4526-92ce-1de6dca6ae44` and smoke `43966002410` attempt 2 pass. Attempt 1 fetched the old page four seconds before deployment; fresh local full smoke and no-write gate-picker smoke also pass.

Sole authorized cdx-74 completed engineering/security self-review and personally reran 340 tests/typecheck/dry-run, booking E2E, 42 page plus six picker layouts, and real MapLibre/CSP-worker/live OpenFreeMap vector-tile loading. Browser booking persistence/providers and mobile basemap remain synthetic. Physical iPhone/Safari, affected ISP/mobile data, real Google Maps app sharing and physical gate acceptance remain **unverified human checks**. No public cutover, production booking, invoice, payment or message occurred. Earlier Claude-review requirements are withdrawn by the canonical founder instruction; no further agents are authorized.

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

### Historical Phase 1 cutover and recovery actions

After the required acceptance and explicit founder approval, the sole operator sets remote plain-text `APEX_PUBLIC_BOOKING_ENABLED` to exactly `true`, retaining existing database/Turnstile secrets. Verify config `enabled:true`, Turnstile on the existing hostname and invalid empty same-origin POST rejection before any authorized real submission. No token rotation, migration or financial/message flag change is needed.

Replace the externally published customer booking link with `https://apex-kennels-api.muaz-shafiq18.workers.dev/book`. Inventory the actual publication locations privately before changing them; they are not tracked in this repository. Keep the current Google Form link available as fallback and leave its authenticated ingest/recovery unchanged. Do not guess a Form URL.

The existing production checker and manual deployment procedure intentionally require the booking gate closed. The separate `scripts/check-booking-cutover.mjs` checks live config, empty-envelope 400, wrong-origin 403 and anonymous staff denial, without a booking or Turnstile token. Scheduled monitoring defaults to the unchanged closed checker; only at approved persistent cutover set GitHub repository variable `APEX_PUBLIC_BOOKING_MONITOR_MODE=live`. That variable selects verification and cannot activate bookings. The no-write gate-picker check runs in both modes; it verifies current assets, exact local pin parsing and ambiguous/outside/cross-origin refusal without contacting map/geocoding providers. Independently check actual remote financial/message flags remain absent; HTTP checks alone do not prove those secret/configuration states. The guarded manual deploy procedure remains closed-state-only: do not invoke it against a live release or open a new deployment lane without a separately reviewed procedure.

Rollback sets the remote booking flag to `false`/absent, removes/resets the monitor variable, restores the customer link to the existing Form and verifies config `enabled:false`, POST 503 and the full existing production checker. Preserve already received bookings. No monitoring variable or Worker gate has been changed during preparation.

Use this record for #28/#37/#39/#78. Existing automated checks and preparation are recorded in [the shared thread](agents/THREAD.md); they do not replace the human/device/provider checks below. The operational Google Form remains the customer path and fallback. This checklist does not change runtime flags or send messages.

## Real phone and network: #37

Record date, deployed Worker version, device/OS/browser, network (mobile data or the previously affected ISP), and pass/fail with a brief failure description. Repeat the connectivity checks on both networks. Keep private pins, customer details and staff screenshots out of Git/issues.

Open the intended production booking preview on a physical iPhone in Safari. Use the Worker or Pages URL from the current checkpoint. While public submissions are closed, test these controls without submitting:

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

## Historical Fatima checklist before V10.6

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
