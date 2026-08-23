# Root-group WordNet selector: negative checkpoint

Date: 2026-08-23

## Decision

The root-group-conditioned real-word route stops on development before the
sealed 11 briefs, production shadowing, or human preference work. The lexical
graph has ample candidates and the selector clears its quality, diversity,
collision, lexical-hazard, overlap, and mechanistic conditioning checks, but it
cannot fill every frozen page under the declared per-source cap.

No threshold, source definition, partition, or fallback was changed after this
result. The research-only builder and Rust executables were removed after the
failure was captured.

## Frozen evidence

- Executed protocol SHA-256:
  `aa800a5512d222f8307fc4c4ae17d25eac637b708d5cdfcdaa95117667911407`
- WordNet 3.0 ZIP SHA-256:
  `cbda5ea6eef7f36a97a43d4a75f85e07fccbb4f23657d27b4ccbc93e2646ab59`
- Candidate artifact SHA-256, reproduced byte-for-byte twice:
  `2bda0536a55f7ee0828e1471198e76a25d3b84b0e040372cc81376f8bf8e8208`
- Development report SHA-256:
  `cb643ece8c9e723bf7930a7801bc1a8ecd48bf073f98bcc7230498e82c6c27bf`
- Root-group support: 24/24 development briefs
- Minimum post-collision graph pool: 51
- Minimum structural/quality-eligible pool: 30
- Pages/cards: 72 / 714; six pages were 8/10
- Average/minimum ILAD: `0.8691 / 0.7414`
- Average quality: `88.84`
- Cross-seed average/maximum overlap: `0 / 0`
- True-vs-nine-wrong graph-score wins: `91.53%`
- Lexical hazards: 0

## Decisive failure

`an environment variable manager` has three WordNet-supported root seeds:
`dot`, `secret`, and `var`. After the declared vocabulary and collision filters,
only `dot` and `secret` supply candidates. The frozen cap allows at most four
cards from either source, so every seed page stops at 8/10 even though 34 names
pass structural and quality filters.

This is not a selector implementation accident: with two productive sources
and a cap of four, a ten-card page is impossible. Relaxing the cap after seeing
the brief would invalidate the protocol.

## Interpretation

The test also exposes the limits of automatic metrics. Pages score highly but
contain literal or weakly evocative words such as `Decree`, `Healthy`,
`Discharge`, `Police`, and `Chemical`. The graph-score contrast proves that the
route reacts to its brief; it does not prove that the outputs are compelling
brands.

A later architecture may treat a production root group as one semantic concept
rather than pretending each synonym/root is an independent concept. If it also
turns an evocative lexical anchor into a new phonetic form, it must freeze that
transformation and its traceability gates before inspecting results. That would
be a distinct generator, not a repair to this failed selector.
