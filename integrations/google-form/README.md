# Google Form → Apex backend (not connected yet)

This is a **form-bound Apps Script adapter**, not a deployed integration. Do not install or enable it until Fatima grants editor access and we inspect the complete five-page form.

## Setup once access is available

1. Open the real Google Form as an editor. Under **Extensions → Apps Script**, add `Code.gs`.
2. Run `listApexFormItemIds()` and map exact **item IDs** into the secure script property `APEX_FIELD_MAP`. Do not assume customer email, phone, or pet name questions exist until checked.
3. Set Script Properties `APEX_API_URL`, `APEX_INTAKE_TOKEN`, for the Cloudflare Worker. Do not put any secret in GitHub, the form, or a Sheet.
4. Create one clearly marked synthetic response. Add `APEX_TEST_RESPONSE_ID` to Script Properties, run `validateApexSyntheticResponseMapping()`, and review the presence-only logs. Nothing is posted by this diagnostic helper.
5. Create the installed trigger: function `onApexFormSubmit`, event source **From form**, event type **On form submit**.
6. Keep `APEX_INTAKE_ENABLED=false` until the complete mapping, fields, and privacy handling have been owner-reviewed.
7. After approval, enable intake and test a synthetic submission, retry, and staff review; never auto-send invoices.

Sample `APEX_FIELD_MAP` structure (values are **placeholders**, not actual form IDs):

```json
{
  "customerName": "<FORM_ITEM_ID>",
  "email": "<FORM_ITEM_ID_IF_COLLECTED>",
  "phone": "<FORM_ITEM_ID_IF_COLLECTED>",
  "petName": "<FORM_ITEM_ID>",
  "startDate": "<FORM_ITEM_ID>",
  "endDate": "<FORM_ITEM_ID>",
  "accommodationType": "<FORM_ITEM_ID_IF_PRESENT>"
}
```

The adapter currently imports only one pet and the basic booking fields. The existing Google Sheet remains the original record for unimported questions. Prices, extras, approval, PDF invoices and notifications stay inactive until Fatima approves the business rules.

**Reliability:** The unique Google Form response ID prevents duplicate bookings on retry. A changed submission with the same ID returns HTTP 409 for manual review. Google Apps Script trigger failures must be monitored; they are not equivalent to guaranteed delivery.

## Recover missed submissions (not scheduled)

The form-bound script also supplies `reconcileApexRecentResponses()` for **manual, opt-in** replay. It does not create a timer automatically. Before invoking it, Fatima must approve the earliest timestamp whose responses may be imported and set Script Property `APEX_RECONCILE_AFTER` to that ISO date/time (include timezone). It requires `APEX_INTAKE_ENABLED=true`, checks at most 50 responses, and refuses larger backfills until separately reviewed. Re-sending a previous response is safe: the backend returns HTTP 200 with the same booking ID. Errors stop processing and are not logged with customer data or credentials.

Do not use reconciliation to scrape historical bookings without permission. No real customer import or email is enabled by this repository.
