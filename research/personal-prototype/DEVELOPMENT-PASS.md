# Phase 305 development mechanism pass

Date: 2026-08-24

## Decision

The personal prototype selector passes every frozen development mechanism gate
and may run the unchanged sealed partition. This is not a better-name result
and does not open production shadowing.

Two fresh executions reproduced report SHA-256
`944167f4d9874738bb4d5c33852713bbce464be82d6c55d202a552b3379867ef`
and manifest SHA-256
`55bbb7feb04ae93f8478c3b28a5d4dcef9657e7d46c6a75483cc45848ae085af`
byte-for-byte.

## Result

- Anchor coherence: 11/11 leave-one-out anchors placed another anchor in the
  top half; median fractional rank `0.041509` against 256 background names.
- Pages/cards: 72/72 full, 720 selected.
- Minimum source/eligible pool: `160/117`.
- Minimum/average composite: `80/90.5917`.
- Mean/minimum page ILAD: `0.898992/0.816534`.
- Minimum per-brief uniqueness: `29/30`; mean/maximum overlap
  `0.0556/1`; duplicate page sets zero.
- Own-brief condition win rate: `98.3333%`.
- Mean prototype score: `0.810304` versus original Phase 303 selection
  `0.760427`, uplift `+0.049877`; 71/72 pages improved.
- Copy exclusions across the truncated pools: 14 edit-distance, two prefix,
  and 29 suffix cases. Selected anchor-copy violations were zero.

## Interpretation boundary

The feature is coherent and materially changes selection without breaking the
mechanical supply. Visible examples such as `Datudy`, `Biqook`, `Pridwiq`, and
`Boodtog` also show that abstract articulatory resemblance to liked names does
not itself create intentional names. Mechanical passage therefore justifies
the sealed mechanism check, not a positive aesthetic interpretation.

The sealed run must use the committed evaluator and every existing threshold
unchanged. Even a sealed pass only permits a new untouched absolute human
evaluation; it cannot authorize Auto or a better-name claim.
