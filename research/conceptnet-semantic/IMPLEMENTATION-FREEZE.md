# Phase 297 implementation freeze

Date frozen: 2026-08-23

This file was written before any canonical-keyword request was sent to the
ConceptNet API and before any Phase 297 coverage outcome was visible.

- Protocol commit: `6b4582d` (`Freeze ConceptNet semantic preflight`).
- Protocol SHA-256:
  `0bcf85a453a61216fb26fa3f850de77a0687e13cf015451963eb8fee5c3f8d95`.
- Refresh implementation SHA-256:
  `164a21569c05d25d146ef5104c1da88dd3ccfef00c606299bbc3a693c2495c69`.
- Offline validator SHA-256:
  `41d4a646afd74f4a6cbd7a43bc2b831cdf355e6e3d790080ed241a214f304485`.
- Canonical keyword evidence SHA-256:
  `1f959c015efb9d49b1219b966f3ee464592fa62949c4b8804ce1f2fe2f692a6d`.
- Runtime: Python 3.12 standard library only.

Syntax parsing and a narrow normalization invariant passed before this freeze:
the query node, multiword node, non-English node, and below-threshold node were
excluded while an eligible English single-token neighbor was retained. No live
response or experiment metric was inspected by that check.

The first network action must be an explicit `refresh.py --refresh` invocation
into an empty ignored directory. Validation then runs offline. No source repair,
alias, threshold, or gate may change after the first snapshot is inspected.
