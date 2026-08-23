# Human pseudoword-valence form preflight

This is an isolated, non-LLM aesthetic-signal experiment. It is not imported
by production generation, WASM, Auto, web types, storage, or taste.

## Source boundary

- Gatti, Raveling, Petrenco, and Günther, *Valence without meaning:
  Investigating form and semantic components in pseudowords valence*, DOI
  `10.3758/s13423-024-02487-3`.
- Public OSF project `kv9at`, *Valence without word meaning*. The publication
  is CC BY 4.0; the OSF project metadata declares no separate project license.
  Raw files therefore remain local/ignored and are not redistributed here.
- Network access is allowed only through explicit `refresh.py --refresh`.
  The command records API metadata, source URLs, retrieval time, byte lengths,
  and SHA-256 values. Training and evaluation run only from that snapshot.

## Data-sufficiency gate

- Require at least 1,000 distinct human-rated pseudowords matching lowercase
  ASCII `[a-z]{4,12}` and at least ten retained ratings per item.
- Use only observed human valence and item spelling. Word-neighbor valence,
  fastText/semantic vectors, experimenter predictions, and estimated ratings
  are forbidden labels.
- If multiple experiments rated the same spelling, keep every observed mean as
  a repeated measurement but group the spelling across partitions.

## Frozen split and model

- Build connected name families under exact identity and edit distance one;
  every component stays in one partition. Sort components by FNV-1a 64-bit
  hash and allocate 70/15/15 train/validation/sealed test by item count.
- Features are signed stable-hashed character 2/3/4-grams plus transparent
  length, vowel balance, alternation, sonority, repetition, and boundary-sound
  values. The model is linear ridge regression; validation chooses ridge
  `{0.1, 1, 10, 100}` by Spearman, then MAE, then stronger regularization.
- Compare with two train-only baselines: mean human valence and order-3
  character likelihood. The latter may predict familiarity but is not fitted
  to validation/test valence.

## Frozen gates

- Validation Spearman >=0.25 and >=5% MAE improvement over the train-mean
  baseline before sealed test opens.
- Sealed test Spearman >=0.25, >=5% MAE improvement, and positive Spearman in
  every source experiment containing at least 100 eligible test items.
- Against 100 deterministic family-preserving label permutations, empirical
  one-sided `p <= 0.05` for sealed Spearman.
- Two clean CPU runs produce byte-identical normalized records, split,
  coefficients, validation report, and test report.

Passing proves only that human affect contains a generalizable spelling-form
signal. A separate application must show that the signal rejects known bad
engine outputs, preserves brief relevance and page diversity, and wins a blind
human naming study before any product integration.
