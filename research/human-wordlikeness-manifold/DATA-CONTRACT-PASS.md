# Phase 291 PseudoLex data-contract pass

Date: 2026-08-23

The author-provided archive and linking page were inspected only after the
pre-inspection freeze. No model score or score-rating association was computed
before this checkpoint.

## Frozen source identity

- Linking page SHA-256:
  `113cea322231dbfb4aa67a78a49b0452dc62d76d0615fd8f88ff6edc61191b73`
- ZIP SHA-256:
  `74a108e87ecdb5b5b3902902fed38f42437b060e6df92c6f8503ef412e930480`
- Extracted CSV SHA-256:
  `70f4e7a92fc300ba609013a172db18fe04e44855b2162313ce2b8c57b7000289`
- CSV bytes: `20,371,694`.
- The source page exposes the file for research but declares no explicit data
  license. Raw material therefore remains ignored and is not redistributed.

## Eligibility evidence

- Columns: `subjID`, `gender`, `birthYear`, `vocabLevel`, `cmu`, `disc`,
  `ortho`, `length`, `rating`, `uniScore`, `biScore`, `triScore`.
- Rows: `201,600`; distinct participants: `1,440`; distinct items: `8,400`.
- Every item has exactly 24 observed rows.
- Ratings use every integer from 1 through 5.
- Six items, or 144 rows, fail the frozen direct lowercase ASCII/length rule.
  The remaining `8,394` distinct items exceed the required 7,000.

Participant identity, item identity, direct spelling, scale, and rating count
are recoverable without transliteration or imputation. Model implementation
may proceed under the frozen protocol.
