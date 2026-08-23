# ConceptNet raw two-hop semantic preflight: Phase 298 pass

Date: 2026-08-23

## Decision

The separately frozen raw-assertion representation passes every Phase 298
coverage, source-diversity, cross-brief separation, validity, and deterministic
reproduction gate. This is the first license-resolved modern semantic source in
the current non-LLM sequence with dense coverage of all 35 canonical briefs.

The result proves only anchor capacity. It opens a separately frozen
whole-form generator experiment; it does not prove that an anchor is perceived
in a generated spelling or that any resulting name is attractive.

## Frozen identity

- Acquisition commit: `2d67ba0`.
- Protocol commit: `1e50fd5`.
- Implementation commit: `5cf78e8`.
- Bulk archive bytes / SHA-256:
  `497963447` /
  `accd65fe94038584295574ddc26e1500c1919c8c4532bf771811cafd0948af7e`.
- Bulk protocol SHA-256:
  `2b8ce5c15a1fc130719fedab597d18aba5967934e17d3f33f9b8e08826b76200`.
- Extractor SHA-256:
  `6d865042ba5ef2e22e8a4c501b17297d74823e98588f2fb44119ec6a99da989c`.
- Canonical keyword evidence SHA-256:
  `1f959c015efb9d49b1219b966f3ee464592fa62949c4b8804ce1f2fe2f692a6d`.

## Observed evidence

- Full archive rows per pass: 34,074,917 / 34,074,917.
- Relevant retained-weight edges: 24,483 first pass / 405,381 second pass.
- Keywords: 111/111 with at least one anchor.
- Retained keyword anchors: 22,013; per-keyword range 105–200.
- Canonical briefs: 35/35 with at least 64 anchors; per-brief range 389–979.
- Every brief has a source keyword with at least 32 anchors.
- Every multi-keyword brief has at least two uniquely contributing sources.
- Mean / maximum cross-brief Jaccard: `0.0408292 / 0.282946`, below
  `0.35 / 0.80`.
- Valid finite positive anchor-score rate: 100%.

Two clean offline executions reproduced all artifacts byte-for-byte:

- `keyword-anchors.jsonl.gz` SHA-256:
  `ff207ad1570356b1a820726dc6c6dc980826425bd40e440ce4dac0d0f4788e55`.
- `report.json` SHA-256:
  `352c3e51698cb4135e4773efaa0b1eb1b27db250e715b0d530f5340cdff4b6cc`.
- `manifest.json` SHA-256:
  `798123d2cbb257d211a33573019db5e8ebe540040051030adc5384b0d658a15f`.

## Next boundary

A successor may intersect the fixed train-only product-form distribution with
a weighted character n-gram lattice derived from these hidden semantic
anchors. It must emit whole spellings, reject unchanged four-letter anchor
copies, use development/sealed brief partitions, and pass both own-vs-wrong
semantic trace and retained mechanical/full-page gates before any production
shadow or human preference test. Literal ConceptNet words, suffix assembly,
respelling, and graph-score-only selection are not eligible substitutes.
