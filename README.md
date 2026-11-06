# Apex Kennels

Booking intake, customer requests, staff review and invoice estimation. **Production runs on Cloudflare Workers and Neon.** The old Vercel project was deleted; its code and build artifacts are no longer maintained.

## What works

- **Google Form intake:** live, via Apps Script → authenticated Cloudflare Worker → Neon, with an opt-in recovery trigger. Keep it active until the website replaces it.
- **Staff review:** Cloudflare Access-protected `/staff` queue, private booking details at `/staff/booking?id=<uuid>`, read-only estimate at `/staff/draft?id=<uuid>`. Staff management and invoice sending aren't implemented.
- **Customer booking preview:** `/book`. Transport customers can use device GPS or open Google Maps and paste a shared exact pin. Apex resolves the link and enforces the Islamabad–Rawalpindi transport area. This is **not yet the live booking channel**.
- **Routing and pricing:** Geoapify driving-route and current petrol-price logic are separate, review-only calculations. No real invoice is approved, sent, or made payable automatically.
- **Synthetic demos:** `/demo/staff`, `/demo/invoice`, `/demo/draft` contain only fictional data.

## Release gates

Public website submission remains disabled unless `APEX_PUBLIC_BOOKING_ENABLED=true` and the configured Turnstile and database prerequisites are satisfied. Before turning it on, complete the production transport-location migration, review the owner-provided boarding terms, test one synthetic website booking end to end, and complete the real-phone Google Maps test in [issue #37](https://github.com/MuazShafiq/apex-kennels/issues/37). The active cutover checklist is [docs/customer-booking-launch.md](docs/customer-booking-launch.md).

## Development

Use Node.js 22 or 24. On Windows:

```powershell
cd $HOME\Downloads\apex-kennels
npm.cmd ci
npm.cmd test
npm.cmd run cf:check
npm.cmd run dev
```

Run `npm.cmd run cf:deploy` only when the reviewed `main` branch is ready. Never commit production environment files, API keys, customer records or payment information.

## Operational references

- [Local setup](docs/local-windows.md) · [Cloudflare setup](docs/cloudflare-workers.md) · [Staff access](docs/staff-access.md)
- [Form automation](docs/form-automation.md) · [Google Maps link handling](docs/customer-shared-map-pins.md) · [Customer website launch](docs/customer-booking-launch.md)
- [Fatima's approved pricing rules](docs/approved-invoice-rules-2026-11-05.md) · [Invoice review](docs/staff-invoice-drafts.md)
- [Design/UX release checks](docs/experience-guardrails.md) · [Staff delegation backlog](https://github.com/MuazShafiq/apex-kennels/issues/27)

**Guardrails:** Booking submission does not confirm a stay. Only staff can accept bookings and manually send an owner-reviewed invoice. A map pin is not proof of a drivable gate. Keep the original Google Form running until the replacement is independently verified.
