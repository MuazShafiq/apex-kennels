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
