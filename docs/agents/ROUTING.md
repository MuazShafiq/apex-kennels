# Agent routing SOP

At session start, after `/clear`, compaction, or a handoff, reload `AGENTS.md`, this policy, and the current task handoff before choosing a route. The tracked files are the recoverable policy; private chat history is not required.

Use the tools and models **actually available in the authenticated runtime**. Routing is an operating procedure, not an automatically implemented model switcher.

## Default model choices (updated 2026-11-18)

- **GPT-6 Luna / Low or Medium:** economical default for exploration, routine implementation, straightforward tests, cleanup, and narrowly bounded tasks. Use Low when sufficient.
- **GPT-6.1 Terra / Medium** (`gpt-6.1-terra`): selective middle tier for screenshot/visual QA, real-browser and computer-use work, responsive interface inspection, document and invoice/PDF layout review, and narrowly scoped code/writing work that needs more than Luna but not Sol. Do **not** automatically use Terra for bulk routine tests, large codebases, or hard security/debugging tasks.
- **GPT-6.2 Sol / Medium** (`gpt-6.2-sol`): default strong model for substantial engineering, implementation across multiple files, integrations, nontrivial refactoring, and technical decisions.
- **GPT-6.2 Sol / High:** difficult debugging, security, concurrency, data integrity, complex integrations and high-stakes release analysis. De-escalate to Luna or Terra for bounded follow-up work after the hard part.
- **GPT-6 Astra, GPT-6.2 Astra, and Fable:** remain prohibited for this repository until the founder explicitly changes the restriction, including fallback and subagent use. This update does **not** authorize them.

Choose a model per task based on observed performance and usage efficiency, not simply because it is newer. Terra costs more per token than Luna and less than Sol; Sol 6.2 retains Sol 6.1's published API rates. **Subscription-authenticated Codex usage is not the same as direct API billing.** Do not start a paid API workflow to enforce this policy.

## Execution and authorization

- The founder's **explicitly selected profile is the only authorized agent by default**. The presence of `cc-umer`, `cc-muaz`, `cdx-18`, `cdx-74` or other profiles in the repo is an inventory, **not permission to launch them**. Do not spawn Claude Code, subagents, other Codex accounts or review agents without task-specific authorization. If review needs a separate agent, report the need instead of launching it.
- Use `--model gpt-6.2-sol` or `--model gpt-6.1-terra` only when the current CLI exposes the model and the selected user account can use it. Verify the applied model/effort rather than claiming a switch. Do not silently revert to GPT-6.1 Sol if 6.2 Sol is unavailable; use another already permitted, appropriate model or report the blocker.
- The Windows `cdx-18` and `cdx-74` launchers intentionally isolate logins and **do not override each account's model configuration**. A repo policy change does not change a running session or a private `config.toml`; model selection is explicit in the session/CLI. No automatic cross-account switching.
- Use `/fast` where actually supported. Do not claim a speed/mode change without evidence.
- The task owner implements, tests, self-reviews, and reports. Independent review is valuable for security/concurrency work **when separately authorized**. Preserve one writer per file, one production operator, existing customer data, and all human authentication/consent/launch gates.
- `cc-umer` is an available Claude engineering lane and `cc-muaz` is an available design lane, **not default collaborators**.

Sources: [GPT-6.2 Astra and Sol](https://openai.com/index/introducing-gpt-6-2-astra-sol/) and [GPT-6.1 Terra](https://openai.com/index/introducing-gpt-6-1-terra/). Model choices are a working policy to revisit after real workflow evaluations, not claims of benchmark-proven superiority for Apex.
