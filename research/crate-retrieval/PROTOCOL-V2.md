# Phase 294: retrieval conditioning with non-percolating leakage control

Date frozen: 2026-08-23

Phase 293 proved that transitive edit-one connectivity is not a usable family
definition at registry scale: one chance-connected component consumed 74.97%
of eligible names. This successor changes only leakage control. No TF-IDF,
retrieval, conditional NLL, wrong-description result, or generated name has
been computed from the crates.io source.

## Fixed source and normalization

- Reuse the exact Phase 293 archive, six tables, field selection, eligibility,
  stoplist, description/keyword/category features, and direct-name rule without
  change.
- Archive SHA-256:
  `fecb5cc2ea7eae450c53051ffc104506d22eea7336203afee7a22fe39620647c`.
- Reuse the same legal boundary: raw/normalized metadata stays ignored; no
  production artifact may open without compatible-license review.

## Replacement leakage rule

- Construct connected components from shared `(owner_kind, owner_id)` and exact
  normalized-description fingerprints only. Edit distance does not create a
  transitive component.
- Before splitting, exclude every owner/description component larger than 2%
  of the initially eligible dataset. Require total hub exclusion at most 10%.
  This prevents a collaborative owner network from dominating a partition; an
  excluded hub is not fragmented or redistributed.
- Sort retained components by `(FNV-1a(first lexicographic name), first name)`
  and fill 80/10/10 exactly as Phase 293.
- Keep all train records. Remove a validation record if its name is exact/edit
  distance one from any train name. Then remove a test record if its name is
  exact/edit distance one from any train or retained-validation name. Do not
  move, repair, or replace removed evaluation records.
- Verify the final train/validation/test sets have zero owner, description, and
  cross-partition exact/edit-one leakage. Require at least 50,000 total retained
  records and at least 5,000 clean records in each evaluation partition.
- Require 35/35 canonical brief coverage in final train vocabulary and a
  largest retained owner/description component at most 2% of initial eligible
  records.

This is stricter than random or crate-level splitting and avoids redefining a
chance edit chain as one author/name family. Failure closes Phase 294 before a
model runs.

## Retrieval model and evaluation

If the replacement data gate passes, reuse Phase 293's model without changing
any constant:

- train-only sparse unigram/bigram TF-IDF with sublinear TF and L2 norm;
- similarity-weighted local order-three character model over retrieved names;
- global/local probability mixture;
- validation grid `k {16,32,64} x alpha {0.15,0.25,0.35}`;
- up to 10,000 lowest-FNV evaluation items, with the first 2,000 used for
  real-vs-nine-wrong description discrimination;
- validation and sealed gates: at least 5% NLL improvement, at least 65% true
  condition wins, at least 95% full positive-cosine retrieval, sealed positive
  improvement in every length bucket with at least 500 items, and byte-identical
  two-run reproduction.

Validation failure stops before sealed scoring. Passing both partitions opens
only the already-declared research generator boundary, not production.
