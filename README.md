# Apex Kennels

Cloudflare Worker + static booking page + Neon PostgreSQL + Google Form / Apps Script. The former Vercel project is retired.

## Current operational state (November 14, 2026)

| Area | State |
| --- | --- |
| Existing Google Form → Cloudflare → Neon | Active customer intake, retained during website cutover |
| Replacement `/book` | Deployed preview, **public submissions disabled**; independent pickup/drop-off configuration |
| Live Turnstile + website booking | A clearly synthetic production canary succeeded in the November 13 controlled test; the gate was closed again afterward (operator-verified) |
| Staff dashboard | Cloudflare Access-protected booking queue, booking details and saved review-only drafts |
| Geoapify + current petrol | A synthetic distinct-gate route and fuel quote were calculated live, saved to Neon and checked (operator-verified). **Physical entrance/Bawli road access still unverified** |
| Canva-based invoice PDF | Review-only, non-payable PDF; blank-page and alignment defects fixed in [PR #66](https://github.com/MuazShafiq/apex-kennels/pull/66), with live visual verification reported |
| Owner invoice approval / WhatsApp delivery | **Not enabled**; no payable invoices, customer messages, payment collection or automated booking acceptance |

The saved synthetic transport quote is an engineering verification, **not** a customer-approved transport rate. National notified petrol rates are not proof of local pump prices.

## Remaining release gates

1. Fatima approves the customer form and six owner-provided boarding terms.
2. Verify Google Maps sharing, geolocation and actual page connectivity on a real customer's phone/network ([issue #37](https://github.com/MuazShafiq/apex-kennels/issues/37)); investigate the previously reported ISP/ECH accessibility failure before replacing the Form.
3. Independently confirm the kennel's **drivable** entrance, mandatory Bawli approach, and each customer gate before making transport quotes payable.
4. Enable public booking and replace the Google Form link **only after approval**, then retain the Form as fallback. The existing Form keeps running until this cutover is explicitly authorized.
5. Build owner approval and customer-safe invoice delivery separately ([issue #39](https://github.com/MuazShafiq/apex-kennels/issues/39)); do not activate messaging without recorded opt-in, Meta integration and reliable delivery status.

Canonical implementation/release reference: [customer booking launch](docs/customer-booking-launch.md). Earlier date-specific handoff documents are preserved as historical checkpoints and may describe already-completed work.

## Development

Use Node 22 or 24. On Windows PowerShell, from your existing local clone:

```powershell
cd "$HOME\Downloads\Projects\apex-kennels"
npm.cmd ci
npm.cmd run cf:check
npm.cmd run dev
# In another terminal, while the dev server is running:
npm.cmd run local:check
```

The local smoke check verifies a **synthetic PDF**, not obsolete HTML invoice text. For customer/staff UI changes, run the Playwright checks configured by [mobile visual CI](.github/workflows/apex-mobile-visual.yml). GitHub Actions runs tests and the read-only production smoke monitor; **it does not deploy the Worker**.

Production deploys are explicit Wrangler operations from reviewed code. Do not accidentally enable the public booking gate, rotate intake credentials, or modify live customer records while deploying.

## Coding agent accounts and shared context

The per-account Windows Codex launchers (`cdx-18`, `cdx-74`), shared four-agent conversation thread, and secondary Codex invoice-delivery handoff are documented in [docs/agents/README.md](docs/agents/README.md). Existing Claude aliases (`cc-muaz`, `cc-umer`) remain independent. No credentials are stored in the repository.

## Architecture and operating references

- [Coding agent instructions](AGENTS.md) · [Windows setup](docs/local-windows.md) · [Cloudflare](docs/cloudflare-workers.md) · [Staff authorization](docs/staff-access.md)
- [Google Form intake](docs/form-automation.md) · [Google Maps selection](docs/customer-shared-map-pins.md) · [Customer booking cutover](docs/customer-booking-launch.md)
- [Confirmed invoice rules](docs/approved-invoice-rules-2026-11-05.md) · [Saved estimate workflow](docs/staff-saved-reviews.md) · [WhatsApp rollout gates](docs/whatsapp-rollout.md)

**Do not confuse a submitted booking request, a saved review estimate and an approved payable invoice.** They are distinct states.
