# Owner booking alerts: issue #43

Implementation owner: Codex. Scope is durable owner alerts for new Google Form and website bookings. PR #74's invoice delivery machinery supplies bounded Meta response reading, signature verification and status parsing; owner consent, enablement, persistence and owner authorization remain independent of invoice issuance and customer delivery.

## Engineering evidence

Migration `db/migrations/006_owner_booking_alerts.sql` is additive. A configured/enabled new booking commits one immutable owner alert intent in the booking transaction. Messaging runs after commit and cannot undo a saved booking. Replays do not enroll again, even if alerts were disabled at first submission. Existing canaries and deliberately synthetic records are suppressed. No historical backfill is performed.

Committed claims prevent duplicate sends across request and five-minute cron dispatch. Definite Graph client rejections retry after five minutes, at most three attempts. Timeouts, malformed success, proxy/server errors and stale sending claims become ambiguous and require owner evidence before retry. Accepted is distinct from delivered; callbacks are signed, replay-safe, recipient-bound and serialized against provider-ID attachment. Delivery wins over late failure. Accepted status missing for 24 hours is flagged overdue without resending.

`/staff/owner-alerts` provides private paginated unresolved-first tracking, booking lookup, and evidence-backed retry/reconciliation. Only configured owner identity passes Worker Access/audience/allowlist checks; POST additionally requires a fresh signed Access JWT, same-origin form and confirmation. Status reconciliation never sends. Exhausted attempts and known-provider failures cannot auto-retry.

All test fixtures/provider calls are synthetic. Disposable loopback PostgreSQL is **not a Neon branch**. Live Access, Neon migration/write and Meta delivery remain unverified until separately authorized release testing.

## Operator boundary

Follow `docs/whatsapp-rollout.md`. Keep `WHATSAPP_ALERTS_ENABLED` false/absent. Do not activate public booking, customer delivery or invoice gates. Do not apply a production migration, backfill historical bookings or contact real recipients as part of engineering verification. Existing Google Form intake/recovery stays independent.

Next operator must review/apply the migration first on an identified development Neon branch, verify explicit owner opt-in, separate sender/template onboarding and exact Access owner identity, then obtain scoped production/live-test authorization. Test disabled recovery before any enablement.

## Merged and disabled deployment checkpoint

PR [#75](https://github.com/MuazShafiq/apex-kennels/pull/75) merged as `785af2f` and closed #43. Main's automatic Cloudflare build deployed version `102d6265-4d20-4b9f-9704-00a95c08b8b7` (deployment `543a09a0-6714-4be5-8018-7cd436b0a2cb`). Post-merge read-only settings show all five booking/invoice/customer-send/owner-alert enablement flags absent. Main Node 22/24 CI and production smoke pass; unconfigured owner webhook returns 503 and anonymous owner UI redirects to Access. This does not prove live Meta delivery or a production migration. Code is deployed with messaging disabled; migration 006 and activation remain release work.
