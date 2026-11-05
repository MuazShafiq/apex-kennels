# Apex invoice transport: source-backed petrol rate on each draft

**Code implemented on feature branch; NOT DEPLOYED.** No real invoices, customer messages, bank data or Neon's booking records have been touched.

## Actual source and limitations

- Primary machine-readable JSON: `https://oilprices.pk/api/latest` (independent OilPrices.pk parser of OGRA notifications; no account or API key).
- Fallback (SAME publisher, NOT independent verification): `https://raw.githubusercontent.com/quantanow/pakistan-fuel-prices/main/data/latest.json`.
- License/required attribution: **Fuel price data from [OilPrices.pk](https://oilprices.pk), CC BY 4.0**.
- **Not an official OGRA API.** The underlying government notification is official, but the machine-readable feed is independent third-party parsing. For exceptions verify against OGRA notification: `https://www.ogra.org.pk/index.php/notified-petroleum-prices`.
- These prices are **Pakistan national notified petrol baselines**, NOT Islamabad pump-specific forecourt rates. OGRA's district/pump-wise rate publications can include **secondary freight**. This implementation intentionally does NOT invent the local differential. The amount is a fuel-cost-based **draft** requiring Fatima's confirmation.
- Data is notification-based, not ticks-per-second market pricing. API publisher reports approximately 5-minute HTTP caching. We request no-store and perform a fresh network lookup for each **transport draft**, but this is not a guarantee the publisher has ingested the latest OGRA notice.

## What happens per order

1. Booking arrives via the existing Google Form. **No fuel request happens during intake.**
2. Staff reviews a route and determines **total vehicle km actually driven**, including relevant return legs. This is **not** derived from the owner's street address automatically.
3. When creating an invoice draft with `transport.requested=true`, `buildApexDraftWithFreshFuel` fetches the published current petrol baseline. If transport is not requested, there is **no API call**.
4. Validate product is petrol, not diesel; unit must be **litre**, currency is PKR; rate must be finite, plausible (PKR 150–1000), and have two decimal places or less; date must be a real non-future date within **7 calendar days** (Islamabad date).
5. Compute transport only when total vehicle distance, explicit 20%-profit interpretation, and a validated petrol snapshot are present. Fuel assumption remains 12 km/litre. **20% markup**: `km/12 × petrolPkrPerLitre × 1.20`; **20% gross margin**: `km/12 × petrolPkrPerLitre ÷ 0.80`. No default profit interpretation.
6. Snapshot publisher, URL, effective date, retrieval timestamp, notified rate, currency, geographic scope, distance and chosen profit basis with the **review-only draft**. Historical invoice amounts must never change as fuel prices move.
7. If the primary API fails, try its GitHub mirror. If both fail, return a normal boarding draft **with transport UNPRICED** and a manual-review reason. **Never quietly use Fatima's old PKR 400/litre assumption.**

## Operational safety

- User-facing amount must not be sent or marked payable until staff approves **route distance**, **20% margin-versus-markup interpretation**, **Islamabad pump freight adjustment** and any additional vehicle costs. No customer notification, WhatsApp or invoice delivery occurs.
- No new database columns or production secrets are needed for this pure quote/lookup module. The quote and fuel metadata are presently in-memory data structures only; **persistent booking→invoice draft integration is future work**.
- The API and mirror share the same underlying data lineage; fallback protects availability, **not data correctness**.
- If the feed is older than 7 days, claims to contain a future notification, changes shape or returns invalid values, transport pricing is intentionally blocked.
- API usage relies on the publisher continuing free access; since it is independent, verify health regularly and keep the manual override available.

## Verify locally without using customers

```powershell
git switch main
git pull --ff-only
npm.cmd ci
npm.cmd run invoice:preview:fuel
```

This **single** preview command attempts a real network price lookup and writes clearly synthetic review-only `output/apex-current-fuel-draft.html` plus an accompanying JSON provenance snapshot. The preview illustrates **24 actual vehicle km and 20% markup** purely as a test assumption, not Fatima's confirmed transport policy. If the network lookup fails, the draft has **no transport charge**.

## Remaining integration

Build the staff review/download workflow that combines real bookings, route distance and rate snapshot, stores drafts durably, and exports an approved, accurate PDF. The existing database and Google Form intake need no changes for this isolated fuel module. Keep invoice sending manual per Fatima's instruction.
