# Agent routing SOP

At session start, after `/clear`, compaction, or a handoff, reload `AGENTS.md`, this policy, and the current task handoff before choosing a route. The tracked files are the recoverable policy; private chat history is not required.

Use the tools actually available in the current runtime. Routing is an operating procedure, not an automatically implemented model switcher.

- Default: **GPT-6 Luna**, using **Low** or **Medium** for exploration, routine implementation, testing, cleanup, and lightweight subagents.
- Escalate substantial engineering to **GPT-6.1 Sol / Medium**. Use **Sol / High** for difficult debugging, concurrency, integrations, or security work; de-escalate to Luna when that work is complete.
- Straightforward bounded tasks: **Low** when economical.
- **GPT-6 Astra and Fable are explicitly prohibited until a plan upgrade**, including automatic escalation, fallback routing, and subagents. Do not select either even if available.
- Use `/fast` where the installed CLI supports it. Do not claim a switch or speed mode without evidence that it was applied.
- Delegate independent work when worthwhile and supported; inspect actual tool/CLI capabilities first. Keep one writer per file and one production operator. Independently review security/concurrency changes before merging.
- `cc-umer` is the Claude orchestration lane; `cc-muaz` is the design lane. Neither is mandatory for every milestone.

The task owner owns implementation, tests, independent review, authorized merge, and verification. Adapt effort to new evidence. Report unavailable capabilities honestly and continue authorized work with available tools; do not invent delegation or dynamic routing. Repository production gates and human authentication/consent boundaries still apply.
