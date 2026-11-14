# Shared context across four local coding profiles

| Alias | Runtime | Purpose |
| --- | --- | --- |
| `cc-umer` | Claude Code account-specific wrapper | Routine engineering and coordination |
| `cc-muaz` | Claude Code account-specific wrapper | Design lane |
| `cdx-18` | Codex CLI, `~/.codex-18` | Primary Codex |
| `cdx-74` | Codex CLI, `~/.codex-74` | Secondary Codex; invoice-approval task owner |

## Install Windows Codex launchers

From the Apex repo in PowerShell:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-codex-profiles.ps1
```

This appends an idempotent dot-source block to the user's all-hosts Windows PowerShell 5.1/7 profiles, creating two isolated `CODEX_HOME` directories; **it does not overwrite `cc-muaz` or `cc-umer`**, copy tokens, or log in on the user's behalf.

Open a **new PowerShell terminal**, then sign into the intended ChatGPT browser account separately:

```powershell
cdx-18 login
cdx-74 login
cdx-18 login status
cdx-74 login status
```

Verify the account chosen in each **browser OAuth flow**. `login status` establishes login method, **not** the exact email identity. The profiles require ChatGPT login, not API-key billing; authentication lives under each private home. If you already use an older isolated Codex home (e.g. one from another project), this setup **leaves it untouched**, including its conversation history. Do not copy auth files between accounts.

Normal use from this repo:

```powershell
cdx-74
cdx-74 resume --last
cdx-18
```

All additional Codex CLI arguments pass through; the launcher restores inherited environment variables afterward.

## What conversations are actually shared?

- **Project instructions:** root `AGENTS.md` for Codex, and `CLAUDE.md` imports the same file for Claude Code.
- **Shared repo conversation:** [THREAD.md](THREAD.md), a chronological handoff/decision thread that all four profiles are instructed to read and update. Commit only sanitized summaries and evidenced decisions, using separate branches/worktrees when concurrent.
- **Full transcripts (opt-in, local only):** inside each CLI conversation run `/export` and save an export under `.agent-conversations/` in this repo. This directory is **gitignored** to keep secrets/customer data out of GitHub. Agents on the **same local checkout** can read those exports on demand; agents in separate worktrees will need a deliberate file copy.
- **Native session continuation:** `cc-muaz`, `cc-umer`, `cdx-18`, and `cdx-74` retain **four independent interactive session stores**. There is no single cross-vendor `resume` that can safely load and continue all four as one chat. Exported text is context, not a native resumable session.

Avoid linking raw session directories or auth stores across the four profiles. They contain private account-specific data and may be concurrently written.

## Current task

[Owner approval and WhatsApp invoice delivery](INVOICE-APPROVAL.md) is assigned to `cdx-74` for implementation on an isolated branch. Do not enable public bookings, issue real invoices, mutate production Neon, or send Meta messages. Surface genuine approval/credential blockers without stalling the rest of the engineering work.
