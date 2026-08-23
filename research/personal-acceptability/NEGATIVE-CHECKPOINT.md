# Phase 304 personal acceptability negative checkpoint

Date: 2026-08-24

## Decision

The post-outcome personal absolute-acceptability density-ratio model stops at
grouped out-of-fold evaluation. It does not predict the user's retained
positive-versus-rejected labels better than the frozen baselines and writes no
final model. Production and the existing pairwise learner remain unchanged.

No label rule, repeat exclusion, duplicate exclusion, n-gram definition, alpha
grid, threshold, fold, baseline, or gate changed after the first result. Two
clean executions reproduced all three artifacts byte-for-byte.

## Frozen identity and reproduction

- Protocol / model-detail / implementation commits:
  `06b62cc` / `f68c93e` / `5ef3009`.
- Protocol / model-detail / runner SHA-256:
  `9e328fdb3f46f22b47c0c0dd6c203ecab5fb1239b64b5ca37116abff0fdcf0c6` /
  `8377efabf104133aff7baaf2cafcd893f6e4e08f5285dbaa8958dc814f48a6a8` /
  `fe2d3b2f791c17666c367cc560137f18f7467544612d8c19ff0418dd973b6363`.
- Reproduced labels / report / manifest SHA-256:
  `38b96bad9d84855c5b4affb6a6179eae282f485e421ec744a488494d3e3115b8` /
  `671ee91d03039cd5673edbecc469e9854674deae171303d369e314fa2dac57c9` /
  `402e4f390c1e93776ff8e1de06afd2f54d8eb803cf71e18f6ab47a6c90fab141`.

## Result

- Eleven inconsistent-repeat primary pairs were excluded.
- Four lowercase spellings appearing across briefs were excluded everywhere:
  `countloom`, `stocknova`, `studioloom`, and `wisecount`.
- Retained labels: `201` = `68` positive and `133` negative across 30 briefs.
- OOF ROC AUC: `0.593211`, below the frozen 0.65 gate.
- OOF balanced accuracy: `0.556336`, below the frozen 0.60 gate.
- Fixed baseline AUCs: composite `0.504920`, memorability `0.591774`, negative
  length `0.615933`.
- Model uplift over the strongest baseline: `-0.022722`, below the required
  `+0.05`.
- Original-partition AUC where required: train `0.610869`, test `0.659091`;
  both pass the narrow partition floor but do not repair aggregate failure.
- No `model.json` exists.

## Interpretation and boundary

The collection's strong negative signal is real, but the chosen names do not
share a stable brief-independent 2-4-gram signature. A trivial shorter-name
ordering generalizes slightly better than the learned spelling density ratio,
and even that AUC is too weak for a rejector.

The decisive choice in a bad pair must not be reinterpreted as a genuinely
liked name. The export contains reliable evidence that the recruited candidate
pool was broadly unsatisfactory, but insufficient positive examples of names
the user would actually adopt. Do not add more features, lower gates, fit on all
labels, or integrate a length penalty from this result. A future personal model
needs explicit absolute positive anchors or a candidate source that first
produces genuinely acceptable names, followed by a new untouched human study.
