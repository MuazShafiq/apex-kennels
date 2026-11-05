# Apex operational truth and remaining gates | 2026-11-06

This is the **current handoff**. Older README paragraphs, `docs/fatima-handoff.md` and `docs/shadow-intake-activation.md` preserve earlier development checkpoints; do not interpret historical "trigger disabled" statements as today's configuration.

## Status by subsystem

| Subsystem | Evidence-backed status | Limit |
| --- | --- | --- |
| Existing Google Form → Google Sheet | Continues as Fatima's operational workflow | No automated acceptance or invoice sending |
| Form → Cloudflare → Neon shadow intake | Activated 2026-11-04 for **new submissions only**; one synthetic canary and Apps Script activation verified | First **genuine** customer submission not independently cross-checked at the documented checkpoint; do not claim all real bookings are synchronized |
| Public Cloudflare Worker | Intake authentication and health verified in earlier production tests; scheduled public security smoke exists | Source changes are **not deployed automatically** |
| Staff queue | Read-only, Cloudflare Access-gated source exists | Staff email allowlist/AUD not yet configured and independently verified; not operational for Fatima |
| Staff invoice estimates | **Source-only:** review estimate links, owner-confirmed daily and monthly calculations, explicit unresolved checks, synthetic demo, no DB mutations | No saved invoice drafts, approval, number, bank account, PDF issuance or email |
| Customer-shared map pin checker | **Source-only:** Google Maps selected-place and shortlink resolution; Access-gated staff form; no URL persistence | Pins still require customer confirmation of the vehicle gate; Worker update not deployed |
| Bawli → kennel access | Real **local** Geoapify test returned 2.40 km each direction, about 5 minutes and 10–35 m snap offsets; two directions plotted on corrected Geoapify map | Road passability/entrance not confirmed by Fatima; `roadApproachValidated=false` |
| Live petrol baseline | Source module tested against OilPrices.pk; user independently ran a live lookup returning PKR 362/L effective Nov 5 | National OGRA-notified baseline, not guaranteed at any Islamabad pump; no live booking quote or staff billing integration |
| Customer transport price | Route and calculation modules implemented and tested with synthetic coordinates | No approved customer route, no verified 20% profit interpretation, not billable |
| Customer-facing invoice | Clean HTML renderer for approved document, review-only demos | Not a live workflow; no payable invoice number, verified bank details or automated sending |
| Automation tests | GitHub CI tests Node 22 & 24 and Wrangler dry-run; PR-specific counts recorded in GitHub | Passing tests are NOT a production deployment |

## Fatima confirmations received (Nov 5)

- Normal cage **PKR 2,500 per dog per day**, camera cage **PKR 3,000 per dog per day** (daily rates supported by invoice evidence and previous WhatsApp confirmation).
- **PKR 65,000 per dog** for one normal-cage month.
- Grooming always free.
- Invoice generation can be automatic, but **Fatima/staff review and send manually**.
- Car fuel efficiency **12 km/L**, former assumed petrol rate **PKR 400/L** (now superseded as a default by per-draft published petrol check), and target **20% transport profit**.
- Distance-based transport rather than a fixed trip charge.

## Only nondelegable confirmations

1. **Road**: Fatima or driver confirms that the Bawli → kennel trace matches the actual gate and road. If wrong, adjust the actual turning waypoint and re-test before quoting.
2. **Monthly definition**: what qualifies as one month: calendar month or days/nights, and what happens on 28-, 29-, 30-, 31-day periods and extra days.
3. **Transport profit policy**: 20% markup on petrol-only cost versus 20% gross margin; whether tolls, driver time, maintenance, minimum fee and local Islamabad pump variation are included.
4. **Payment and invoice**: exact authorized payment account, invoice numbering continuation/format, legal/business details needed on customer invoices, and review of the final design.
5. **Staff identity**: Fatima's specifically authorized login email address(es), configured privately in Cloudflare Access and Worker secrets; never commit these.
6. **First genuine intake verification**: reconcile a real Form response ID, Apps Script execution, one ingestion event and booking rows through **non-sensitive identifiers/counts only**. No further synthetic canary or historical replay needed.

The customer pickup/dropoff location is per-booking input, not a global owner decision; each customer must share/confirm a static pin when transport is requested.

## Next integration when gates clear

1. Set Cloudflare Access app protecting `/staff*`, exact audience and email allowlist; verify both denied and allowed identities before enabling staff viewing.
2. Deploy Worker after access review. Verify public health, unauthorized intake, denied staff, and synthetic demos against actual deployed code.
3. Confirm Bawli road and customer gate; configure Geoapify key as an encrypted Cloudflare secret (never GitHub) and test route comparison in production-like staging.
4. Persist **review-only** invoice drafts with frozen pricing and fuel/route snapshots; avoid duplicate records on retries, never auto-send or auto-approve.
5. Implement Fatima's review/download workflow and approved bank details/numbering. All sending remains manual unless a later explicit owner decision changes it.
6. Build premium public website and location picker after the low-touch invoice workflow is stable.

## Security and expense boundary

Do not turn on customer messaging, payment capture, background email, additional monitoring vendors, recurring paid mapping subscriptions, or production data migrations without appropriate approval. Retain current Cloudflare Workers, Neon and Google Form. Public GitHub contains no customer records or API keys. Only staff-facing private workflows can read billing records; do not share medical/care notes in invoice previews.

**No ongoing autonomous agent is running.** Source changes were made in bounded sessions and verified through GitHub CI. Future progress beyond today's blockers requires explicit access, real-world validation or owner decisions.
