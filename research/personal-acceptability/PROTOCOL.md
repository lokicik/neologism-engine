# Phase 304: personal absolute-acceptability density ratio

Date frozen: 2026-08-24

This is an isolated post-outcome non-LLM architecture screen. The completed
pairwise collection failed its prospective repeat and decisive-count gates,
but exposed a different hypothesis: the dominant human signal may be absolute
rejection rather than a stable relative order between two names.

Because this hypothesis was formed after inspecting collection outcomes, even
a passing result is exploratory. It cannot repair Phase 290, authorize a
production reranker, or support a better-name claim. A new untouched human
study remains mandatory.

## Frozen inputs and labels

- Collection SHA-256:
  `031f4d75a416dedfd853116b4bca1833e384422e3691a0403f2431d5d6628f25`.
- Source / collector-protocol file SHA-256:
  `debb789365ca2b2eff334662e5325c00a5a9ea32cda9b5f3d6e433b83676803e` /
  `ee0c8d96484740c1d332abb5cbc249925b2ed2c1cc4ff3d9fcf113fc19428bb0`.
- Reconstruct the frozen 150 primary and 24 repeat tasks and independently
  verify hashes, task order, choices, and the recorded failed audit.
- Exclude each primary pair whose concealed repeat was inconsistent. Repeats
  never add labels.
- A decisive primary contributes only its chosen candidate as a positive.
  Its unchosen candidate is ambiguous and excluded.
- A `Neither` primary contributes both candidates as negatives.
- If a lowercase name appears in more than one brief among labeled candidates,
  exclude every instance of that name before folding. This prevents direct
  spelling leakage across brief groups.
- Require at least 55 positives, 120 negatives, 24 positive-bearing briefs,
  24 negative-bearing briefs, and both classes in every outer test fold.

## Frozen model

- Input is lowercase ASCII spelling only; brief text, source mode, construction,
  engine scores, pair identity, and candidate rank are forbidden model inputs.
- Pad each name as `^name$` and count exact character 2-, 3-, and 4-grams.
- Fit a two-class multinomial density model from training names. With additive
  smoothing alpha, score a name by mean positive-minus-negative n-gram log
  likelihood. Class priors are equal and the classification threshold is zero.
- Alpha grid is `{0.1, 1.0, 10.0}`. No other architecture, feature, threshold,
  or spelling normalization is searched.

## Frozen grouped evaluation

- Sort all 30 briefs by the existing FNV-1a 64-bit hash of brief text and
  assign round-robin to six outer folds of five whole briefs.
- Within each outer training set, choose alpha by deterministic five-fold
  grouped CV over briefs: higher ROC AUC, then higher balanced accuracy, then
  larger alpha. Refit on the complete outer training set and predict its five
  untouched briefs.
- Aggregate exactly one out-of-fold score for every retained labeled candidate.
- Baselines are fixed spelling-external source values: composite,
  memorability, and negative length. The strongest full-OOF baseline AUC is the
  comparison boundary; this oracle choice favors the baseline.

## Frozen gates

- OOF ROC AUC `>=0.65`.
- OOF balanced accuracy at zero threshold `>=0.60`.
- ROC AUC exceeds the strongest fixed baseline by at least `0.05`.
- For each original train/validation/test partition containing at least ten
  positives and ten negatives, ROC AUC is at least `0.55`.
- No fold is empty or single-class; every retained name has exactly one OOF
  score; scores are finite.
- Two clean executions reproduce labels, exclusions, folds, alpha selections,
  predictions, report, and manifest byte-for-byte.

Failure records a negative checkpoint and stops. Passing permits fitting one
frozen research model on all retained labels and designing a new untouched
absolute-acceptability human study. It does not open production shadowing or
integration.
