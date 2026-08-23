# Phase 291: human wordlikeness product-manifold preflight

This protocol is frozen before downloading or inspecting PseudoLex outcomes.
It tests a new classical form architecture rather than another synthetic
corruption classifier. Human wordlikeness is not beauty, semantic relevance,
or product-name preference.

## Sources and boundary

- Product manifold: the existing CC0 Wikidata holistic dataset SHA-256
  `dd4b7b977ea62aea570f7ec5b9941ca06174fd7cbb882a39ffbd2183f488d9d6`.
  Only its 10,138 grouped `split=train` names define the representation.
  Wikidata keywords, descriptions, validation/test names, and outcomes are not
  used.
- Human target: Needle, Pierrehumbert, and Hay, *Phonological and
  Morphological Effects in the Acceptability of Pseudowords*. The authors'
  PseudoLex data file is linked from the publication page. The study reports
  8,400 English pseudowords/nonwords, 1,440 participants, and 24 visual
  wordlikeness judgments per item on a 1-5 scale.
- Network access is allowed only through explicit `refresh.py --refresh`.
  Record the linking page, resolved data URL, retrieval time, byte length, and
  SHA-256. Raw data remains ignored unless an explicit compatible data license
  is present; research access is not redistribution permission.

## Eligibility and split

- Require at least 7,000 distinct directly observed lowercase ASCII spellings
  matching `[a-z]{4,12}`, exactly 24 retained observed ratings per item, and
  explicit participant and item identity. No transliteration, punctuation
  deletion, estimated ratings, author phonotactic score, or imputation.
- Build connected spelling families under exact identity and edit distance
  one. Sort families by FNV-1a 64-bit hash and allocate 60/20/20 by item count
  to development-train, validation, and sealed test. Participants may cross
  item partitions because the fitted model never sees their responses; item
  families may not cross.
- Validation alone selects the one hyperparameter. Sealed human ratings stay
  unread until every validation gate passes.

## Frozen model

- Represent every spelling with exact character 2/3/4-gram term frequency
  weighted by train-product inverse document frequency, including explicit
  word boundaries. L2-normalize sparse vectors.
- A candidate score is the mean cosine similarity of its `k` nearest product
  names. Validation selects `k` from `{1, 3, 5, 10, 20}` by controlled
  Spearman, then raw Spearman, then smaller `k`.
- The fixed baseline is a train-product order-3 character model with additive
  0.1 smoothing and length-normalized log likelihood. Neither model is fitted
  to a human rating.
- Primary analysis is Spearman correlation with mean human wordlikeness.
  Controlled analysis rank-transforms score and rating, residualizes both
  against orthographic character length with an intercept, then correlates the
  residuals. This prevents a short-name preference from passing alone.

## Gates

- Validation requires raw Spearman `>=0.25`, controlled Spearman `>=0.20`, and
  controlled uplift over the global character baseline `>=0.05`.
- Sealed test repeats all three gates, requires one-sided family-preserving
  permutation `p<=0.01` with 1,000 deterministic permutations, and positive
  controlled correlation in every orthographic length bucket containing at
  least 200 items.
- Two clean CPU runs must reproduce eligible records, family split, IDF,
  selected `k`, neighbor scores, reports, and hashes byte-for-byte.

Passing proves only that local product-name spelling neighborhoods contain an
independent human wordlikeness signal beyond global corpus likelihood. It may
then open a separate research-only generator application with quality,
collision, diversity, brief relevance, and blind preference gates. It cannot
directly change production or support a better-name claim.
