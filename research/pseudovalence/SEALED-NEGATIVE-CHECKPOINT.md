# Human pseudoword-valence form model: sealed negative checkpoint

Date: 2026-08-23

## Decision

The human-valence spelling model is not eligible for engine-output ranking,
Rust export, generator guidance, shadow comparison, or production integration.
Its held-out ordering signal is strong and survives the frozen permutation
test, but its sealed-test absolute-error calibration is worse than the
train-mean baseline. The predeclared gate therefore fails.

No gate was relaxed after opening the sealed split. No model artifact is
tracked, and the one-off probe remains outside the product tree.

## Source and data boundary

- Source article: Gatti, Raveling, Petrenco, and Günther, *Valence without
  meaning: Investigating form and semantic components in pseudowords valence*,
  DOI `10.3758/s13423-024-02487-3`, CC BY 4.0.
- Public OSF node: `kv9at`. The node declares no separate project license, so
  the raw snapshot remains local and ignored rather than redistributed.
- Only spelling and observed human valence were extracted. Source-model
  predictions, word-neighbor valence, semantic fields, and embeddings were not
  used.
- Experiment 2 contributes 1,500 names; Experiment 3 rerates 500 of those
  names. The source analysis records 30 observations per item.
- All 1,500 distinct names satisfy lowercase ASCII `[a-z]{4,12}`; there are no
  missing observed targets.

## Frozen identity

- Protocol SHA-256:
  `4388f02e64adf0b690206507cae1459b201cc262687f77000415be8dc5c43ac3`
- Refresh script SHA-256:
  `b273f88ba5dd7f4cf3d3201fac4430759d1697e7de5153e3b8589734815b583d`
- Parser requirements SHA-256:
  `233aab8c25dd94dbbca602cc43945244b31be62daed7fc33b3a4c91b41f32b53`
- Executed one-off probe SHA-256:
  `268b127d493eadf73d9d770c00eb7180fa5f2afaa07ee0e1111afea39fcbe4b1`
- Raw RData SHA-256:
  `d1566ad5f44f6ac9f228004fe31486c0fa9169f1f578bed159fa3fa37be74a57`
- Snapshot manifest SHA-256:
  `da17440ca6e629fb2d32b459a72c06a22dd6beacffb7f4370083d6a927b84cca`

Two fresh full runs produced byte-identical outputs:

- normalized records:
  `e51e5390ba95fc95a79509d59ec710bdc586e0734c8bead5e787e4f3701a5de4`
- family split:
  `577dc4b881846db12afc0189a16e4362cc69d4225d62d00063dac642c5f5e09e`
- coefficients:
  `51bc0f3bcdbc5692f378577a7e74a8392ecde15fc9ba3812ad7ea581ed7e13fd`
- validation report:
  `5cd4bc67dc4d69241e28d70a5841e37f83888296fe39deb3152310d55d3a9d07`
- sealed-test report:
  `3b3b79a14807ce90489cecf8751ecceca4ada37e890f072e56b223a47af5830a`

The edit-distance-one family graph contains 1,339 components. The split has
1,050/225/225 distinct train/validation/test names and 1,395/297/308 repeated
measurement records, with no family crossing a partition.

## Validation

| Gate | Required | Observed | Result |
|---|---:|---:|---|
| Spearman | >=0.25 | 0.4321 | PASS |
| MAE improvement over train mean | >=5% | +7.674% | PASS |
| Selected ridge | frozen grid | 100 | descriptive |

The train-only order-3 character-likelihood baseline reached Spearman `0.2581`
but worsened MAE by `34.85%`.

## Sealed test

| Gate | Required | Observed | Result |
|---|---:|---:|---|
| Spearman | >=0.25 | 0.4162 | PASS |
| MAE improvement over train mean | >=5% | **-3.475%** | **FAIL** |
| Experiment 2 Spearman | >0 | 0.4159 | PASS |
| Experiment 3 Spearman | descriptive, 83 items | 0.4224 | descriptive |
| Family-preserving permutation p | <=0.05 | 0.0099 | PASS |

The test MAE is `0.0688573`; the train-mean baseline MAE is `0.0665449`.
Ranking correlation alone is not enough to override the declared calibration
requirement.

## Interpretation and next boundary

This is the first isolated non-LLM route in this sequence to show a clear,
generalizing human-response signal beyond corpus likelihood. It does not prove
that the engine's names are better, and it cannot be retroactively relabeled a
pass.

A new phase may use the result only as an exploratory hypothesis: form-based
human preference may be useful as an ordinal rejection/reranking signal. That
phase needs a newly frozen evaluation source or a prospective blind naming
study; the opened split here cannot be reused to tune a rank-only successor.
