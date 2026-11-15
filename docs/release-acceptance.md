# Remaining release acceptance

Use this record for #28/#37/#39/#78. Existing automated checks and preparation are recorded in [the shared thread](agents/THREAD.md); they do not replace the human/device/provider checks below. The operational Google Form remains the customer path and fallback. This checklist does not change runtime flags or send messages.

## Real phone and network: #37

Record date, deployed Worker version, device/OS/browser, network (mobile data or the previously affected ISP), and pass/fail with a brief failure description. Repeat the connectivity checks on both networks. Keep private pins, customer details and staff screenshots out of Git/issues.

Open the [booking preview](https://apex-kennels-api.muaz-shafiq18.workers.dev/book) on a real Android or iPhone. While public submissions are closed, test these controls without submitting:

| Check | Expected result |
| --- | --- |
| Open page on mobile data and affected ISP | Preview loads; form controls remain usable; public submission remains closed. |
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

Record the exact deployed version and Fatima's decision on customer-facing copy, all six clauses, required terms acceptance, and the optional WhatsApp wording. Record corrections explicitly. Confirm that a request is not a confirmed reservation and does not automatically create a payable quote, invoice or message. The optional checkbox is purpose-specific evidence; historical Form phone numbers are not consent.

Suggested decision record (not a recorded approval):

> Reviewed `/book` at Worker version __ on __. Copy, six boarding clauses and consent wording: approved / changes required: __. This copy decision is separate from public-link cutover, financial issuance and messaging activation.

## Staff, transport and invoice acceptance

- #78: existing Access policy and positive staff acceptance are evidenced, as are anonymous/forged assertion denials. Still test a **valid signed-in identity outside the exact allowlist** and record denial without extracting JWTs, altering policy or exposing booking data.
- Authorized staff must verify the actual kennel entrance, Bawli driving access in both directions, customer gates and independent full driving loops; validate the current local pump fuel/exception basis. Transport remains review-only. National petrol notices are baseline evidence, not a pump-price verification.
- Confirm exact invoice approver identity, current manual four-digit invoice number and coordination with manual issuance; configure Fatima's payment details through the protected channel. Keep bank/account/contact information out of Git/issues. The Canva template remains unchanged.

## Database and provider release

- [Production migration preparation](production-migration-procedure.md) is implemented, digest-pinned, locally/CI tested and independently reviewed. Use fresh external Neon/Worker identity binding before any distinct production application. Never run the synthetic integration suites on production. Keep financial/send gates closed during schema application and readback.
- The Meta owner supplies the separate API sender, business/app access, approved utility/document templates, protected token/signing settings, subscription and purpose-specific consent. Preserve both existing everyday WhatsApp accounts. Verify app/version compatibility and the full live acceptance/recovery path with a consented synthetic recipient under its own release scope; provider acceptance is not delivery.
- Public booking cutover, invoice issuance and each send lane require their own completed acceptance. Founder-wide engineering/tool authorization does not supply another person's opt-in, physical-device evidence or provider credentials. Do not treat a waiting prerequisite as a reason to invent new features.

Record only sanitized version/branch IDs, timestamps, outcomes and evidence links. Existing real bookings/Form recovery must survive every step. Do not drop live migration objects, reset a production branch, backfill historical submissions or rotate tokens to recover from a failed acceptance check.
