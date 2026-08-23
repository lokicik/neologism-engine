# Phase 286: untouched external ordinal-valence gate

This is an isolated, non-LLM external-validity test for the Phase-285 spelling
signal. It cannot alter production generation, ranking, WASM, web types,
storage, or taste data.

## Frozen source boundary

- Martínez-Tomás, Guasch, Ferré, Lázaro, and Hinojosa, *When the
  meaningless make sense: Wordlikeness and affective norms for 4,800
  pseudowords and 1,200 Spanish words*, DOI
  `10.3758/s13428-026-02976-4`.
- Use the public OSF node `baues`. The article is CC BY 4.0; unless the OSF
  metadata declares an explicit compatible data license, raw files stay local
  and ignored.
- Network access occurs only through explicit `refresh.py --refresh`. Every
  downloaded file, source URL, byte length, retrieval time, and SHA-256 is
  recorded. Evaluation is snapshot-only.

## Frozen model boundary

- Use the exact Phase-285 coefficients at SHA-256
  `51bc0f3bcdbc5692f378577a7e74a8392ecde15fc9ba3812ad7ea581ed7e13fd`.
- Preserve its 512-bucket signed FNV-1a character 2/3/4-gram representation,
  twelve transparent form features, feature centering/scaling, intercept, and
  ridge `100`. No Spanish target, wordlikeness value, item example, or source
  analysis may alter the scorer.
- The test is ordinal only. Phase 285 failed its sealed calibration gate, so
  this phase cannot claim calibrated valence or retroactively change that
  decision.

## Eligibility and leakage control

- Evaluate only the study condition whose pseudowords contain neither a real
  Spanish root nor a real Spanish suffix/ending (`NonR + NonS`, using the
  source's unambiguous coding). Do not infer or recreate the condition.
- Require at least 1,000 distinct lowercase ASCII `[a-z]{4,12}` items, at least
  ten retained human valence ratings per item, observed valence, observed
  wordlikeness, and the source base-word identifier plus base-word valence.
- No accent stripping, transliteration, punctuation deletion, or length-rule
  relaxation. Duplicate spellings and base-word families remain grouped.
- Stop as data-insufficient if the condition, rating counts, or control fields
  cannot be recovered directly from the frozen source.

## Frozen evaluation

- Primary metric: Spearman correlation between the unchanged Phase-285 score
  and observed pseudoword valence.
- Controlled metric: partial Spearman after rank-transforming and linearly
  residualizing both score and valence against observed wordlikeness and the
  source base-word valence. Intercept and both controls are included.
- Report correlations by length bucket `4-7` and `8-12` where each contains at
  least 200 eligible items.
- Compute one-sided empirical p-values with 1,000 deterministic permutations
  of human valence across base-word families; seed `2862026`.
- Two clean CPU runs must produce byte-identical normalized data and report.

## Frozen gates

- Primary Spearman `>=0.10`, one-sided permutation `p<=0.01`.
- Controlled partial Spearman `>=0.08`, one-sided permutation `p<=0.01`.
- Every required length bucket has positive raw and controlled correlation.
- All eligibility and deterministic-reproduction gates pass.

Passing would show only that the fixed form score transfers to an independent
human-rated pseudoword system despite language and morphology controls. It
would open a research-only prospective engine reranker and blind naming study;
it would not establish better names or authorize production integration.
