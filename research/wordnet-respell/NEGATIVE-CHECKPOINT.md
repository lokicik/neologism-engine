# WordNet-anchor respelling: negative checkpoint

Date: 2026-08-23

## Decision

The WordNet-anchor, single-transform respelling route stops on development.
It fills all 72 development pages, but the frozen structural/quality capacity,
cross-seed uniqueness, maximum-overlap, duplicate-page, and concept-group
coverage gates do not all pass. The sealed 11 briefs, production shadow, and
human preference stages were not opened.

No transformation, threshold, or selector weight was changed after inspecting
the outputs. The research-only builder and Rust executables were removed.

## Frozen evidence

- Executed protocol SHA-256:
  `d71b1a9874a00625eb029e0d26b5595683b45025c9853f63082d9f200d321399`
- WordNet 3.0 ZIP SHA-256:
  `cbda5ea6eef7f36a97a43d4a75f85e07fccbb4f23657d27b4ccbc93e2646ab59`
- Final preflight artifact SHA-256, reproduced byte-for-byte twice:
  `a240c2fe8e1d7c54f50956ea3a38a85d8da9fac4d741292b6142ae9ce26e0790`
- Development report SHA-256:
  `85080347105e05ca56518190ac7022c9c3d858756f247d8542802b7985e4a613`
- Raw transformed-candidate minimum: 44
- Structural/quality-eligible minimum: **23**, below the frozen 30
- Pages/cards: 72/72 full, 720 cards
- Average quality: `87.41`
- Average/minimum ILAD: `0.8252 / 0.6572`
- Average/maximum cross-seed overlap: `0.1389 / 10`
- Unique page sets: 71/72
- True-anchor score wins against nine wrong briefs: `90.40%`
- Lexical hazards: 0
- Same-process selector replay: byte-identical

## Decisive failures

`an online course and study app` has only 23 candidates after the declared
respell structural and quality filters. Its seed-13 and seed-313 pages contain
the same ten names in different order, making maximum overlap 10, leaving only
71 unique page sets, and failing 27/30 per-brief uniqueness.

One veterinary page also draws every card from a single concept group despite
two groups having eligible outputs. The selector therefore fails both capacity
and semantic-coverage gates; changing tie-break weights cannot fix the 23-name
capacity ceiling.

## Interpretation

The hard-coded transform family is too narrow and too visibly orthographic.
Outputs such as `Tuytion`, `Belyef`, `Contnt`, `Testyng`, `Dyscharge`, and
`Mysteryous` are traceable and score well mechanically, but mostly read as
misspellings rather than intentional new names. High automatic quality and
conditioning scores again do not establish aesthetic quality.

A distinct follow-up may learn a small finite-state edit inventory from
dictionary-near software names in the existing CC0 Wikidata training split,
then apply only those observed contextual edits to WordNet anchors. That route
must freeze support counts, keep validation/test names out of transform mining,
and reject exact/edit-one collisions against the full review inventory.
