# Phase 298 implementation freeze

Date frozen: 2026-08-23

This file was written before the ConceptNet assertions archive was decompressed,
parsed, searched, sampled, or inspected.

- Acquisition commit: `2d67ba0`.
- Protocol commit: `1e50fd5`.
- Bulk protocol SHA-256:
  `2b8ce5c15a1fc130719fedab597d18aba5967934e17d3f33f9b8e08826b76200`.
- Extractor SHA-256:
  `6d865042ba5ef2e22e8a4c501b17297d74823e98588f2fb44119ec6a99da989c`.
- Bulk archive bytes: `497963447`.
- Bulk archive SHA-256:
  `accd65fe94038584295574ddc26e1500c1919c8c4532bf771811cafd0948af7e`.
- Canonical keyword evidence SHA-256:
  `1f959c015efb9d49b1219b966f3ee464592fa62949c4b8804ce1f2fe2f692a6d`.
- Runtime: Python 3.12 standard library only, offline.

Pre-freeze checks parsed the extractor syntax and synthetic five-field lines,
and verified English-node normalization, non-English and punctuation rejection,
stable tie ordering, metadata weight parsing, and maximum-score replacement.
They did not read the ConceptNet archive.

The first real run must use the exact ignored archive and an empty output
directory. No relation, path weight, limit, normalization rule, or gate may be
changed after its report is inspected.
