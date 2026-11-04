# Google Form → Apex backend (not connected yet)

This is a **form-bound Apps Script adapter**, not a deployed integration. Access to the original five-section form editor was verified on 2026-11-04. See the [non-PII field inventory](../../docs/form-field-inventory.md). **Do not enable the trigger** until we capture stable Form item IDs, implement and restrict the pet-care details, and agree a cutover with Fatima.

## Setup once access is available

1. Open the real Google Form as an editor. Under **Extensions → Apps Script**, add `Code.gs`.
2. Run `listApexFormItemIds()` and map exact **item IDs** into the secure script property `APEX_FIELD_MAP`. The required owner name, phone, pet name and dates have been verified. Email is collected as a separate required form field, which must be checked through a synthetic response.
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

The adapter currently imports only one pet and the basic booking fields. The source form also collects address, pickup preference, CCTV preference, emergency contact, vaccination/health information, care instructions and consent. **Those are not yet imported**, so this adapter must not be used as the sole operational booking record. Keep the original Form responses and Sheet as the source for those details. Prices, extras, approval, PDF invoices and notifications stay inactive until Fatima approves the business rules.

**Reliability:** The unique Google Form response ID prevents duplicate bookings on retry. A changed submission with the same ID returns HTTP 409 for manual review. Google Apps Script trigger failures must be monitored; they are not equivalent to guaranteed delivery.

## Recover missed submissions (not scheduled)

The form-bound script also supplies `reconcileApexRecentResponses()` for **manual, opt-in** replay. It does not create a timer automatically. Before invoking it, Fatima must approve the earliest timestamp whose responses may be imported and set Script Property `APEX_RECONCILE_AFTER` to that ISO date/time (include timezone). It requires `APEX_INTAKE_ENABLED=true`, checks at most 50 responses, and refuses larger backfills until separately reviewed. Re-sending a previous response is safe: the backend returns HTTP 200 with the same booking ID. Errors stop processing and are not logged with customer data or credentials.

Do not use reconciliation to scrape historical bookings without permission. No real customer import or email is enabled by this repository.
