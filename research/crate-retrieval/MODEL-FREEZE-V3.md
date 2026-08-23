# Phase 295 retrieval-model implementation freeze

Date: 2026-08-23

No retrieval neighbor, NLL, condition comparison, selected `k/alpha`, bootstrap
result, or sealed score was computed before this checkpoint.

## Deterministic retrieval

- Parse the normalized record file only after verifying SHA-256
  `daec41e23fbafa817c8fc3e3882d2dc0f45af5e50166e0a9cb85355a619f0d0f`.
- Train TF-IDF uses every observed feature and no frequency pruning. Term count
  is the record feature multiplicity; weight is `(1+log(tf))*idf`, followed by
  sparse L2 normalization.
- Store postings in lexicographic feature order and train records in
  `(name, numeric id)` order. Query cosine accumulates only shared features.
  Rank positive similarities by descending value, then crate name and numeric
  ID ascending. Never pad missing neighbors.
- Evaluation items sort by `(FNV-1a(name), name, numeric id)` and use all records
  because both partitions are below 10,000. The first 2,000 form the condition
  subset; nine wrong queries are the next nine cyclic items inside that subset.

## Deterministic local model and selection

- A local transition count is the sum of each retrieved name's character count
  multiplied by its cosine similarity. The local/global order-three models use
  the frozen two-character context and additive `0.1` smoothing over 27 symbols.
- Mean NLL includes every name character plus EOS. A condition comparison is a
  pairwise win when real-query NLL is strictly lower than wrong-query NLL; ties
  are losses.
- Validation evaluates all nine `(k, alpha)` pairs. Selection key is conditional
  mean NLL ascending, pairwise condition-win rate descending, `alpha` ascending,
  then `k` ascending.
- Full-neighbor coverage is the share of queries with at least the pair's `k`
  positive-cosine neighbors.
- Cluster bootstrap groups paired improvements by frozen component ID. Sort
  component IDs, sample exactly that many components with replacement for each
  replicate, retain every record of a sampled component, and compute the
  record-weighted mean. Use Python `random.Random(2952026)`, 2,000 sequential
  replicates, and zero-based sorted index `floor(0.005*2000)=10` as the 99%
  lower bound.
- Length buckets are exact spelling lengths `4-6`, `7-9`, and `10-12`.

## Outputs and stop rule

- Canonical sorted-key JSON/JSONL uses UTF-8 and one LF. Deterministic gzip uses
  timestamp zero and an empty embedded filename.
- Persist train IDF, ordered validation retrievals, validation scores/report,
  and a hash manifest. Validation failure exits before test retrieval or score
  artifacts exist.
- If validation passes, evaluate sealed test once with the selected pair and
  write its retrievals/report. Two clean complete runs must be byte-identical.

Any implementation correction after the first validation NLL becomes visible
closes the experiment rather than replacing this freeze.
