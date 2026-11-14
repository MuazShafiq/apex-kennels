# Apex shared agent conversation

This is the **cross-agent project thread** read by `cc-muaz`, `cc-umer`, `cdx-18` and `cdx-74`. It is a Git-tracked **decision-and-handoff conversation**, not a replayable Claude or Codex session. Native session histories remain under their respective account-specific directories.

## Rules

1. On starting substantial work, read `AGENTS.md`, this thread, and the relevant task brief. Do not assume another profile can resume your native session.
2. Append a dated, attributed entry after a substantive decision or completed handoff: **goal, what changed, evidence, remaining risk, next owner**. Preserve existing entries.
3. One agent owns a production mutation or a shared file at a time. Other agents can conduct isolated read-only reviews or use separate Git worktrees. Avoid concurrent writes to this file; merge sequentially.
4. Keep entries compact. Never include credentials, full customer identities, private pet-care information, raw logs with secrets, or claimed results without evidence.
5. Full exported chats, if needed for **local** cross-model reading, go under gitignored `.agent-conversations/` and are not automatically committed. The shared thread is the durable repo-level truth.

## Entries

### 2026-11-14 | ChatGPT | Infrastructure handoff (prepared, not locally activated)

- **Goal:** Make both Codex subscription logins easy to launch from Windows, preserve two existing Claude Code launchers, and share project context across all four without sharing auth credentials.
- **Design:** `cdx-18` and `cdx-74` use independent `CODEX_HOME` directories. `AGENTS.md` + this thread are the common reading surface. Existing `cc-muaz` and `cc-umer` are untouched. Native conversation resumes remain account-specific.
- **Next owner:** User performs the one-time local installer and separate ChatGPT OAuth logins; `cdx-74` then implements [invoice approval and delivery engineering](INVOICE-APPROVAL.md) on a separate branch.
- **Evidence to add later:** Successful installer/CI test, both Codex `login status` results, and PR number for invoice workflow. Do not claim login or engineering implementation completed before it happens.

### 2026-11-14 | Apex production verification | Confirmed historical checkpoint

- Existing Google Form remains the customer intake. Public website booking gate is **closed** after a controlled real Turnstile + synthetic Neon booking test.
- A synthetic transport estimate with separate pickup and drop-off loops was saved and read back; Canva-based review PDF was corrected in PR #66. Physical kennel/Bawli road access and local pump-specific petrol price remain unverified. These estimates must not become payable automatically.
- PR #69 removed one-off deployment audit tooling, repaired local PDF smoke and updated responsive staff checks. The next substantive software lane is approval plus WhatsApp invoice delivery, with explicit owner/business and Meta prerequisites.

### 2026-11-15 | cdx-74 | Invoice approval and delivery engineering (not deployed)

- **Goal/change:** Isolated worktree `apex-invoice-approval`, branch `feat/invoice-approval-delivery`. Added approval/domain/store + migrations 004/005, owner-only mobile routes, immutable Canva PDF issuance, direct Meta document-template adapter, durable outbox, signed webhook replay/status handling and bounded owner reconciliation. Combined **Approve, issue & send** persists intent; issuance/PDF/outbox/audits are atomic. Review PDFs remain visibly non-payable. Existing Google Form, booking gates and owner-alert lane are unchanged.
- **Evidence:** Node 24 `cf:check` passes typecheck, 303 tests and Worker dry-run. New loopback PostgreSQL checker passes 15 integration groups on `apex_invoice_test_1794684432194_a93867db` (local disposable cluster; no Neon branch). Invoice browser checker passes 6 groups with actual Worker routes/synthetic signed Access identity and injected persistence/provider fakes. Existing booking E2E and six-viewport mobile checker pass; 320px owner page inspected with agent-browser. Existing no-credential production smoke passes (health, closed booking, intake auth, anonymous staff denial, synthetic PDFs). CI Node 22/24 + PR evidence to be appended after publication.
- **Independent review:** Fixed JSONB key-order comparison, exact current transport pin/service binding, legacy Form pin provenance, missing delivery-table RLS, ambiguous HTTP classification and PDF digest verification. Re-reviewed combined auth/recovery paths; no outstanding high/blocking finding was reported. PDF tests decode actual saved text and coordinates. Fakes/local PostgreSQL do not verify live Access, Neon writes, Meta acceptance or delivery.
- **Release boundary/next owner:** No deployment, remote flag change, production migration/data write, invoice issuance or customer contact. Keep production approval/issuance/sending off. Owner must confirm exact Fatima identity, HBL secret, latest manual number, Meta sender/template/consent and physical road/fuel checks; release operator must verify migrations on an identified development Neon branch and obtain explicit production/live-test authorization. Operator procedure: `docs/invoice-approval-delivery.md`.

### 2026-11-15 | cdx-74 | PR #74 verification and handoff

- **PR/commits:** [PR #74](https://github.com/MuazShafiq/apex-kennels/pull/74), implementation `8027fb2`; mobile timing fix `e31a2bb`. Branch remains isolated and original `apex-kennels` worktree remains clean on `main`. No merge/deployment requested or performed.
- **CI evidence:** [Node 22/24 foundation](https://github.com/MuazShafiq/apex-kennels/actions/runs/43633224226) passes 303 tests, typecheck, Worker dry-run, Form syntax checks and 15 actual disposable-PostgreSQL groups per runtime. [Browser CI](https://github.com/MuazShafiq/apex-kennels/actions/runs/43633224232) passes mobile visuals, booking E2E and all 6 invoice browser groups. Replaced fixed pin-lookup delays with observable completion waits. A separate push run exposed a replay-test fixture regenerating its timestamp across a wall-clock second; the fixture now preserves the original provider timestamp. The corrected checker again passes all 15 groups locally on `apex_invoice_test_1794685275255_01d7ccb3`. Local PostgreSQL stopped after verification; retained databases are synthetic and gitignored.
- **Production/external checks:** Authenticated read-only Cloudflare settings show public-booking, approval, issuance, customer-send and owner-alert enablement flags all absent; deployment list still ends at existing version `e0d09d48-c415-4205-9216-51b3e7ad4adf`. Production smoke passes. Cloudflare's automatic feature-branch build check fails, but its Builds/logs APIs return 403 / code 12004 to the available credential; diagnosis needs an operator with Workers CI read access. Do not change deployment settings, grant scopes or activate gates just to make that check green. The invalid `codex-profile-checks.yml` workflow failure is also present on unchanged `origin/main` (`2b502ad`), with no job execution; launcher-lane owner should handle it separately.
- **Next owner:** Engineering reviewer reviews PR #74; Cloudflare build administrator inspects the external failure. Business/provider prerequisites and any Neon production migration or live send remain separate explicit release approvals. No live Access/Neon/Meta success is claimed from synthetic verification.
