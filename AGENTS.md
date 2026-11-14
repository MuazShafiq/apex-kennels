# Apex Kennels: repository instructions

These rules apply to coding agents working in this repository. Keep changes focused, test them, and distinguish implemented, mock-tested, deployed, and independently verified. Do not infer production state from old docs or passing unit tests.

## System and boundaries

- **Runtime:** Cloudflare Worker (`src/cloudflare-worker.ts`) and static assets (`public/`), Neon Postgres, and Google Form / Apps Script (`integrations/google-form/`). The Vercel app is retired.
- **Booking:** `public/book/` -> `src/public-booking.ts` / `src/intake.ts` -> `src/booking-store.ts` -> Neon. Public `/book` is a preview until its release gate is explicitly opened. The existing Google Form, authenticated `/api/ingest`, and its recovery flow must keep working.
- **Staff:** `/staff*` requires Cloudflare Access AND Worker-side signed identity/audience/email checks. Code: `src/staff-access-jwt.ts`, `src/staff-console.ts`, `src/staff-booking-detail.ts`, `src/staff-invoice-draft.ts`, `src/staff-saved-review.ts`, `src/staff-transport-review.ts`.
- **Pricing:** `src/apex-invoice-draft.ts`, `src/pricing.ts`; Geoapify and petrol lookup: `src/transport-route.ts`, `src/transport-quote-from-pins.ts`, `src/islamabad-petrol-rate.ts`. PDF uses the existing Canva-derived template (`src/canva-invoice-pdf.ts`, `public/invoice/canva-blank.pdf`).
- **WhatsApp:** owner alerts are prepared; invoice approval/issuance, private PDF delivery and status recovery are implemented behind separate disabled-by-default gates. None of these customer/financial features is live or authorized for production activation. No automatic approval or payment collection exists. Keep synthetic demos clearly marked and non-payable. See `docs/invoice-approval-delivery.md` before work on this lane.

Open task-specific docs as needed, not all on every task: `docs/customer-booking-launch.md` (release), `docs/staff-access.md` (auth), `docs/approved-invoice-rules-2026-11-05.md` and `docs/fatima-handoff.md` (business), `docs/staff-saved-reviews.md` (drafts), `docs/whatsapp-rollout.md` (future messaging). Some older sections are superseded. Prefer current code, owner decisions, live configuration, and measured results; fix stale docs if editing them.

## Established product and pricing rules

- Boarding: standard **PKR 2,500** per dog per billed day; camera **PKR 3,000**. **Exactly 30 inclusive billed days** may use the staff-selected package price **PKR 65,000 standard / 80,000 camera** per dog. Grooming is always free. Do not invent additional packages, discounts, or multi-dog rules.
- Transport UX: **Pickup** and **Drop-off** are independent choices; **No transport** is explicit and mutually exclusive. Both may be selected. Default to reusing the pickup pin for drop-off, but support separate gates. Show only relevant location inputs. Keep checkboxes aligned with labels and mobile behavior sound.
- Use exact customer-selected pins, never guessed street addresses, Google Maps viewport centres, or place names. Apply the Islamabad/Rawalpindi transport service envelope; preserve optional distinct drop-off coordinates and backward compatibility.
- Transport route must follow verified kennel vehicle entrance, **Bawli** access approach in both directions, and customer gate(s). Each service is a full driving loop; different pickup and drop-off gates require **independent route distances**, not 2× one loop.
- Transport charge = **total driven km / 12 km per litre × validated current petrol price × 1.20**, using the existing rounding rule. The **20% is markup on fuel cost**, not gross margin. The national petrol notification is a baseline, not a confirmed pump-specific Islamabad price. Never silently use the old PKR 400 assumption or invent route distance/tolls.
- All transport pricing remains **review-only** until approved by authorized staff after checking driving access, fuel rate and exceptions. Fatima's HBL recipient details and existing four-digit Canva numbering remain private; their existence does not authorize invoice issuance.

## Security and production

- Never commit, echo, log, or expose secrets, JWTs, customer contact details, private pet-health notes, or bank credentials. No inferred WhatsApp opt-in from phone numbers or historical Form submissions.
- Retain request validation, same-origin checks, strict Turnstile hostname/action validation, idempotency, parameterized SQL, Cloudflare Access checks, and fail-closed behavior. Anonymous users must never see staff data or issue invoices.
- Do not activate public bookings, customer alerts, messages, payments, invoice issuance, historical backfills, token rotation, paid services, or destructive DB changes without explicit scope authorization. Never contact real customers as part of synthetic testing.
- A specifically authorized **temporary** production test is not launch approval. Plan and verify the disable/recovery path **before** enabling a gate; use clearly synthetic data; restore `APEX_PUBLIC_BOOKING_ENABLED` to false/absent even on failure; verify `/api/book/config` returns `enabled:false` and public booking POST is rejected. Never leave it enabled while debugging. Preserve existing real bookings.
- `wrangler.jsonc` sets `keep_vars`: check actual remote variables/secrets and deployed Worker identity, not assumptions from local files. `scripts/check-production.mjs` intentionally requires the public gate **closed**; run it after, not during, temporary testing. Do not weaken it to pass a test.
- Use additive and reviewed Neon migrations only; never rerun `db/schema.sql` against production. Make test records synthetic and identify the database branch for every result.
- Another agent may be running: inspect branch, `git status` and current remote state first. Never blindly `reset`, `clean`, stash, switch, or overwrite a shared worktree. Use a distinct branch/worktree for independent changes; coordinate shared deploys and production mutations.

## Shared agent conversation and handoffs

- At the start of substantive work, read `docs/agents/THREAD.md` and the current task brief under `docs/agents/`, in addition to these instructions. This is the **common repo-facing conversation** for Claude and Codex profiles, not a native session to resume.
- After substantive changes or a change of writer, append a concise dated entry to `docs/agents/THREAD.md` describing actual changed files/commits, evidence, blockers and the next owner. Preserve older entries; do not paste full chat logs or secrets.
- Use `cc-umer` for the normal Claude engineering lane, `cc-muaz` for design, `cdx-18` as primary Codex, and `cdx-74` as secondary Codex. Profile mapping is a local launcher matter; never put auth tokens or complete user credential records in Git.
- Each profile has a private native history. Selected full transcripts may be exported to gitignored `.agent-conversations/` for **local** reading by another profile, but cannot be resumed as a single cross-vendor conversation. One writer per file/production lane.

## Agent routing

Follow [the tool-aware routing SOP](docs/agents/ROUTING.md) at session start, after `/clear`, compaction, and handoff. GPT-6 Luna is the economical default for routine work; escalate substantial engineering to GPT-6.1 Sol as specified there. GPT-6 Astra and Fable are prohibited, including automatic escalation, fallback, and subagents, until a plan upgrade.

## Development and proof

- Node **22 or 24**, TypeScript ES modules with `.ts` import extensions. Match local conventions; prefer small focused changes and no new paid infrastructure or unnecessary dependencies.
- PowerShell: use `npm.cmd`; Unix: `npm`. After `npm ci`, run `npm run cf:check` (typecheck, Node tests, Worker dry-run). For Google Form changes run `npm run form:check`.
- For customer booking, transport UI, or staff UI changes, run the existing Playwright scripts `scripts/check-mobile-visual.mjs` and `scripts/check-booking-e2e.mjs` using setup from `.github/workflows/apex-mobile-visual.yml`. Cover mobile, focus/labels, location error states, and pickup/drop-off combinations. These tests use synthetic stubs; they do **not** verify real Turnstile or production Neon writes.
- CI runs Node 22/24 via `.github/workflows/test.yml`. `scripts/check-production.mjs` verifies live fail-closed endpoints and the PDF preview. `scripts/check-local.mjs` now verifies the local synthetic PDF header, trailer, type and size; it remains a loopback-only smoke check.
- Never claim a deployment, live Geoapify route, live fuel lookup, booking submission, invoice, or message delivery works based solely on mocked CI. Verify real results when authorized; report passes, failures, and unknowns separately.
- For production deployment, inspect diff, current `origin/main`, and relevant tests. Follow the authorized deploy path; do **not** rotate the intake token just for code deployment. Re-check health, anonymous staff denial, Google Form continuity, and closed public booking gate.
- Report changed files, tests/results, deployment state, verifiable evidence, and blockers. Ask for human intervention only at genuine authentication/approval/security boundaries. Keep agent fan-out proportional; never create competing production operators.
