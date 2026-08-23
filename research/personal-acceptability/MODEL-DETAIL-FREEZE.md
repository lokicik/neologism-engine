# Phase 304 model-detail freeze

Date frozen: 2026-08-24

This file resolves implementation details before the first Phase 304 result.

- Each spelling is padded once as `^name$`. Occurrence counts for every
  contiguous 2-, 3-, and 4-gram are retained.
- A training fold's vocabulary is the sorted union of grams observed in that
  fold. Add-alpha denominators use that observed vocabulary size.
- A test gram absent from the training vocabulary contributes zero log ratio;
  it supplies no class evidence. The final name score is the sum of known-gram
  log ratios divided by the total number of extracted grams, including unknown
  grams. A name with no grams scores zero.
- ROC AUC uses all positive/negative score pairs with half credit for ties.
- Balanced accuracy classifies a score strictly above zero as acceptable;
  zero is rejected. It is the mean of positive recall and negative recall.
- Inner alpha selection maximizes `(ROC AUC, balanced accuracy, alpha)` in that
  order. The outer brief fold order uses `outer-v1`; each inner fold uses
  `inner-v1-{outerFold}`. Final all-data alpha selection uses `final-v1`.
- Cross-brief duplicate-name exclusion happens before folds and removes every
  labeled instance of the duplicated lowercase spelling.
- Output floats use canonical JSON's shortest deterministic representation;
  final gram weights, if permitted, use 12 significant digits.

The collection counts and descriptive audit were already known when this
post-outcome hypothesis was formed. No character n-gram feature distribution,
fold prediction, alpha result, or model score was inspected before these
details were frozen.
