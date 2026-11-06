# Apex experience checks (apply to every page)

This is a lightweight review rulebook, not a new approval workflow.

1. **Customer words for customers.** Use plain labels about dogs, stays, spaces, transport and care. Internal flags, field names, billing models and implementation status belong in code or staff tools.
2. **Ask once.** A user choosing a boarding space, transport option or map point has made that selection. Don't add a second Yes/No question, verification checkbox or confirmation button for the same action.
3. **Controls must earn their place.** Show relevant questions only; display choices as attractive, keyboard-accessible controls, with clear selected and focus states. Keep Yes/No for genuine binary questions only.
4. **Use existing location tools, not a second search engine.** Customer transport uses one-tap GPS or a Google Maps share link; never reintroduce unverified autocomplete. Reject vague place links rather than guessing the gate. The exact driveway still needs staff review.
5. **Keep safety facts, lose warning spam.** Prominent safety notices only for actual test records, dangerous/missing pet information, or potentially payable quotes. On staff pages, describe the next action rather than repeat the same caveat.
6. **One primary action per screen.** Staff queue opens booking details; details open estimate; old manual map-link checker stays a fallback for pre-website records.
7. **Say what exists.** A read-only estimate is not an approved invoice. Never imply automatic sending, payments, staff delegation, gate verification or bookings are enabled without real implementation.
8. **Customer terms are readable before acceptance.** Keep the owner-supplied six clauses visible and accessible. Changing liability wording or creating new terms needs owner/legal approval.
9. **No false proof.** Synthetic cases are clearly labeled; actual customers' names, addresses, health and care notes stay behind staff access.
10. **Before customer launch:** complete a booking using a real phone's Google Maps shared pin and device-location permission, no-transport path, staff review, invalid/out-of-area rejection, and small-screen keyboard check. Mobile acceptance is tracked in [issue #37](https://github.com/MuazShafiq/apex-kennels/issues/37). Keep the original Google Form active until the replacement is verified.

Regression checks for redundant controls, terms, link resolution, authorization and legacy Form compatibility live with the regular `npm test` suite; no separate ceremony.
