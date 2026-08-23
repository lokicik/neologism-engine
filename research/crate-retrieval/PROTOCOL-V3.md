# Phase 295: powered retrieval-conditioned package-name model

Date frozen: 2026-08-23

This protocol supersedes only Phase 294's 5,000-record evaluation minimum. The
source, normalization, owner/description hub rule, cross-partition edit-one
exclusion, split order, TF-IDF, character models, validation grid, evaluation
sets, and all effect thresholds remain byte-for-byte conceptually unchanged.

## Data gate

- Require at least 3,000 clean validation and 3,000 clean sealed-test records,
  as authorized by `POWER-AUDIT-RESULT-V3.md`.
- Retain every other Phase 294 data gate: final total at least 50,000, hub
  exclusion at most 10%, largest retained component at most 2%, zero owner,
  exact-description, and cross-partition exact/edit-one leakage, plus 35/35
  canonical brief train-vocabulary coverage.
- The preparation implementation must be the frozen Phase 294 source with
  exactly one semantic replacement: both evaluation minimums `5_000` become
  `3_000`. Its source hash is verified before execution.

## Model and gates

Reuse Phase 293/294 retrieval and scoring exactly:

- sparse train-only description unigram/bigram TF-IDF;
- similarity-weighted retrieved-name order-three local character model;
- global/local probability mixture;
- validation grid `k {16,32,64} x alpha {0.15,0.25,0.35}`;
- up to 10,000 lowest-FNV NLL items and first 2,000 condition items;
- at least 5% conditional-NLL improvement, at least 65% real-vs-nine-wrong
  wins, and at least 95% queries with `k` positive-cosine neighbors.

In addition, paired per-name NLL improvement must have a positive 99% lower
bound under 2,000 deterministic whole-component bootstrap replicates, seed
`2952026`. Validation must pass every gate before sealed names are scored.
Sealed test repeats the gates and requires positive improvement in every
declared length bucket with at least 500 items. Two clean runs must be
byte-identical.

Passing remains semantic-mechanism evidence only and cannot bypass the raw-data
license or later generator/human-preference boundaries.
