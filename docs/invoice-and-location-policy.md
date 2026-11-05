# Apex invoice presentation and transport location design (proposed)

## Invoices: customer document vs private review record

### Customer-facing invoice

Only show **Apex Kennels**, invoice number/date, billed-to owner, pet identity, stay dates, named boarding/transport services, quantity/rate, discounts (if approved), total PKR, and **owner-approved** payment details where applicable. Keep typography consistent and printable on A4. Never display blank payment account placeholders.

Do not show:
- fuel provider URLs, petrol rate/effective/retrieval timestamps, route API credentials, calculation formulas, km, 20% margin versus markup discussions or secondary-freight warnings
- internal status such as APPROVED/SENT or employee reminders, customer vaccination/medication/private pet-care notes, system identifiers
- automatic grooming line when grooming was not requested
- "provisional fuel-based quote" as the customer-visible name for transport

The printable invoice renderer now uses a clean design with only an **internal preview banner on DRAFT/sample output**. For an approved customer invoice, internal flags/warnings are not rendered. **The HTML renderer is not an invoicing or sending workflow**, and owner approval remains mandatory.

### Internal staff review data

Retain source fuel, notified rate, effective date, retrieval time, selected 20% profit basis, verified customer and kennel pins, route provider, return vehicle distance, exceptions, overrides and approval timestamps in private draft metadata. This is not the PDF sent to a customer.

## Real distance: no text-address guessing

**Current state:** No kennel coordinates have been supplied, and no customer pin has been verified. Previous `24 km` was synthetic, not calculated. The synthetic fuel preview now intentionally has **no transport charge** unless a verified route is provided.

### Minimum working flow with existing Form

1. Fatima supplies **one exact Apex kennel vehicle entrance pin** (Google Maps dropped pin). Store it privately in the staff system.
2. Keep the existing Google Form address field as contact information only. If transport is requested, staff asks the owner to share a **static pinned Google Maps/WhatsApp location for the pickup/drop-off entrance** and to confirm it; **do not request ongoing live-location sharing**.
3. Staff opens the pin to confirm the correct property gate, not just a road map centroid. The location is recorded as numeric latitude/longitude; arbitrary text addresses are **never** converted directly into a billable distance.
4. Staff must choose **pickup**, **drop-off**, or **both**. The Form's current yes/no transport checkbox does not distinguish these.
5. The backend requests a drivable loop **kennel → owner location → kennel** from Geoapify Routing; this includes the actual road distance for the outward and return segments. If both pickup and drop-off are separately needed, budget two such loops (adjust manually if driver has another confirmed route).
6. The quote service uses the route's **total vehicle km**, not straight-line map distance, and fetches the fresh notified petrol baseline only after a valid route is available. Fatima reviews local pump/freight adjustments, actual driver operations and margin versus markup before sending an invoice.
7. If pins or route fail verification, transport remains unpriced and the customer invoice remains pending review.

### Full booking website (future)

Replace the WhatsApp step with a **customer location picker** on the website: geolocate/search → move the map pin to the specific collection gate → explicitly confirm address and contact phone. Store numeric coordinates and original text separately. Staff can correct pins; routes never silently trust a geocoded address. Do not retrofit a fake map question into the existing Google Form in the middle of a live intake workflow.

### Provider choice

- **Geoapify Routing** free plan permits commercial use with attribution and currently lists **3,000 daily credits, up to 5 requests/sec**, no card required. 2-waypoint route legs cost credits; a kennel/customer/kennel route uses two waypoint pairs. `https://www.geoapify.com/pricing/`, `https://apidocs.geoapify.com/docs/routing/`.
- **Google Routes Essentials** lists **10,000 requests/month free usage cap**, but requires Google Cloud billing enabled and controlled quotas. Compare actual Islamabad routes once the kennel pin is supplied; if OpenStreetMap-based road routing around gated societies is unreliable, swap the route provider rather than shipping wrong distances. `https://developers.google.com/maps/billing-and-pricing/pricing`.
- No map provider has been configured. `src/transport-route.ts` and `src/transport-quote-from-pins.ts` are **server-side candidate implementations**, tested with synthetic pins and mocked HTTP, not live route lookups. API key must be kept in Cloudflare secrets, not sent to the browser or Google Form.
- Location coordinates can be sensitive. Customer disclosure and staff access controls must cover transmission to the mapping provider.

## Immediate open input

**One thing we need:** the exact Apex kennel gate/vehicle entrance Google Maps pin from Fatima. We have deliberately not invented or inferred it. Even after obtaining that, a pickup quote requires the customer's confirmed location. No live invoice generation or map requests occur until owner details and necessary credentials are configured.

## Completed in this branch

- Customer invoice stripped of transport calculation disclosures, blank bank account messages and workflow status.
- Zero-priced grooming appears only when actually requested.
- Synthetic preview retains the petrol baseline in its separate review JSON and no longer invents 24km.
- Pure route adapter requires two Pakistan-based exact pins + staff confirmation and explicit pickup/dropoff count.
- Route+fuel composer blocks transport billing if any required coordinate or source is missing.
- Existing Form intake and live Cloudflare Worker remain unchanged.
