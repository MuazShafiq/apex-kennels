# Apex staff booking → invoice draft preview (code-ready; not production-enabled)

## Scope completed

A read-only staff estimate workflow now exists in source:

1. `/staff` shows bounded recent bookings and a **Review estimate** link.
2. `GET /staff/draft?id=<uuid>&package=daily|monthly` uses the **same Cloudflare Access identity and exact email allowlist** as the staff booking queue. Missing settings return 503, invalid identity 403, invalid ID/choice 400.
3. The server reads **only** owner name, pet names/count, dates, booking status, two Form add-on flags and synthetic marker from Neon. It does **not** read vaccination, medication, veterinary, address, contact number or other sensitive care notes.
4. The server constructs an internal review-only estimate from owner-confirmed rates and flags unresolved decisions. The page cannot approve, send, print a payable invoice, charge a customer, create an invoice DB row or update booking status.
5. `GET /demo/draft` displays only a hardcoded sample and needs no database. Use it for visual review, not customer communication.

**This is deliberately not automatically wired to incoming Google Forms submissions or production Worker deployment.** The existing live ingestion route remains unchanged.

## Pricing and review policy

- Normal: PKR 2,500 per pet per inclusive billed day.
- Camera requested: PKR 3,000 per pet per inclusive billed day. Requested is not confirmed allocation.
- Normal month: PKR 65,000 per pet, **only when staff explicitly selects monthly**. The preview blocks the option for camera cage and durations outside a provisional 28–31 inclusive-day window. **Eligibility is not approved by this heuristic.**
- Grooming free, but no automatic line if not requested.
- Transport requested: the preview is **boarding-only** with a prominent warning that the total is incomplete. It does NOT use an old 24 km example or a fixed petrol rate; no Google Maps address is silently geocoded.
- If cage preference, transport preference or pet count is missing, suppress the monetary estimate rather than making assumptions.
- All estimates require Fatima's review; invoice issue date, payment account, customer-facing number and discounts are not resolved.
- No external notification, PDF transmission, payment collection, or invoice creation occurs.

## Security

- Cloudflare Access is still an independent prerequisite. Protect **`/staff*`** with a correctly configured Access self-hosted application; configure `STAFF_ACCESS_AUD` and `STAFF_ALLOWED_EMAILS` separately. Unauthenticated and nonallowlisted requests fail closed.
- Cloudflare's Worker bypasses public demo guards only for static synthetic sample routes; **there are no real bookings in public demos**.
- No new secrets, schema migrations, network providers or paid services.
- Staff draft GET has no side effects, uses a parameterized, UUID-scoped query and limits sensitive fields.
- CSP on staff HTML does not permit third-party JavaScript. Both staff pages and responses use no-store.
- Tests include wrong audience, fake JWT header, invalid UUID, injected query, server errors, XSS, unknown booking, incomplete extras, monthly and multi-pet rules.

## Production blockers

**Do not claim a working Fatima-facing dashboard until:**

1. Cloudflare Access is configured and verified for Fatima's specific address(es). Do not share a real personal email with public GitHub.
2. New Worker version is deployed with the correct environment bindings and access configuration, then independently tested as an authorized user and an unauthorized user.
3. The actual Bawli access road and vehicle entrance are confirmed, then customer location workflow is established before quoting transport.
4. Monthly qualification/day count, profit margin vs markup, payment recipient and invoice numbering are approved.
5. A durable invoice draft table workflow, revision history and protected approval route are implemented. Until then these are **volatile previews**, not saved drafts.

See [staff access](staff-access.md), [invoice presentation](invoice-and-location-policy.md), and [approved pricing rules](approved-invoice-rules-2026-11-05.md).
