# Geoapify scoped-query refinement evidence

Measured 2026-11-16, starting **12:31:14 UTC**, using the existing privately supplied key and the deployed implementation's `searchLocalPlaces`. Exactly **12 sequential autocomplete requests**; no other provider requests or service/configuration changes. Every call retained `filter=rect:72.81,33.43,73.3,33.84`, `bias=proximity:73.06,33.65`, English output and limit five. Returned coordinates were checked against the server service envelope; provider identity and labels were not replaced with guessed places.

This is a refinement of the root's earlier seven-query benchmark, not a rerun of all acceptance queries. Ranked names below are actual provider results; relevance assessments distinguish the named sector/phase/place from merely being inside the service rectangle. These are candidate locations, **not verified vehicle gates**.

| Query | Actual ranked results, in order | Relevance |
| --- | --- | --- |
| `F-10 Markaz` | Street 10 in I-8 Markaz Ground; I-10 Markaz; Mosque I-10 Markaz; Property Time in I-8 Markaz Ground; **F-10 Markaz** | Correct exact result exists only at rank 5; ranks 1–4 are wrong sectors. |
| `F10 Markaz` | I9 Markaz; I-10 Markaz; I-8 Markaz Ground; G-10 Markaz; **F-10 Markaz** | Correct exact result only at rank 5. |
| `F-10 Islamabad` | F-10/4; F-10/1; F-10; F-10 Markaz; Islamabad Model College for Boys F-10/4 | All within requested sector, but the query no longer specifically asks for Markaz. |
| `F 10 Markaz Islamabad` | Street 10 in I-8 Markaz Ground; Islamabad Model School for Boys I-8/4; I-10 Markaz; Mosque I-10 Markaz; Property Time in I-8 Markaz Ground | No F-10 result in returned five. |
| `Bahria Town Phase 7` | **Bahria Town Phase 7**; Street 7 in Phase 4; another Street 7 in Phase 4; Globe Junction Phase 7; Bahria Expressway in Phase 7 | Correct phase at rank 1, but wrong-phase suggestions at ranks 2–3. |
| `Bahria Phase VII Rawalpindi` | Rawalpindi | No requested phase; whole-city result is inadequate. |
| `Bahria Town Phase VII` | Phase 1; Phase 2; Phase 3; Bahria Town Graveyard in Phase 3; Phase 4 | All wrong phases. |
| `Bahria Town Phase 7 Civic Center` | Civic Center in Phase 4; Burger In Town at Civic Center; Burger In Town in Phase 3 | Does not establish the requested Phase 7 location; do not substitute these places. |
| `United States Embassy Islamabad` | **Embassy of the United States, University Road, G-4** | Exact named embassy at rank 1. |
| `Embassy of the United States Islamabad` | **Embassy of the United States, University Road, G-4**; Embassy of the United States, University Road (Urdu street label), Ramna 5 | Both identify US embassy; separate nearby provider points do not establish a vehicle entrance. |
| `US Embassy` | Ataturk Avenue in G-5 Islamabad; Ataturk Avenue in G-5 Blue Area; Ataturk Avenue in F-5 Blue Area | No embassy identified. |
| `U.S. Embassy Islamabad` | Embassy of Ukraine; **Embassy of the United States** | Wrong embassy first, correct at rank 2. |

Useful measured public candidate coordinates:

- F-10 Markaz: `33.6958973, 73.0124707`.
- Bahria Town Phase 7: `33.530822, 73.1179633`.
- US embassy first exact result: `33.7257252, 73.1154567`; second nearby entry: `33.725634, 73.116491`.

## Implication

The hard rectangle removes distant results but does not ensure lexical relevance. Raw provider ranking remains unsuitable for unrestricted customer autocomplete. A bounded refinement can normalize explicit `US`/`U.S.` to `United States`, normalize Roman phase numbers, and require/prefer the actual requested sector and phase in candidate labels. It must reject mismatched identifiers rather than silently changing F-10 to I-10 or Phase 7 to Phase 4. Those changes were not implemented during the twelve-call diagnostic run above; the subsequent implementation and its complete seven-query final benchmark are recorded in [the current search guide](location-search.md). Removing a city suffix improved one phase query but is not proof that discarding city intent is generally safe.

Repeat the original acceptance benchmark after any ranking/query changes, plus ambiguous landmarks. Keep search unconfigured until relevance and no-charge usage protection are accepted. GPS and exact pasted gate pins remain the working fallback. Google Places billing or service enablement did not occur. Actual phone/ISP and physical entrance acceptance remain separate.
