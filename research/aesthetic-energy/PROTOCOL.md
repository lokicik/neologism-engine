# Contrastive name-form energy preflight

This is an isolated, non-LLM scorer experiment. It does not generate names and
is not imported by production, WASM, Auto, web types, storage, or taste.

## Frozen question

Can a small linear energy model trained only to rank real product-name forms
above deterministic hard corruptions generalize across the existing
owner/developer/name-family partitions and outperform corpus likelihood?

The question targets the failure shared by the GRU, learned-edit, phonetic
Pareto, and articulatory WFST experiments: current structural metrics assign
high scores to strings that do not look intentionally named. This model has no
brief input and makes no semantic claim. Passing only opens a later isolated
generator/reranker application.

## Frozen data and negatives

- Dataset SHA-256:
  `dd4b7b977ea62aea570f7ec5b9941ca06174fd7cbb882a39ffbd2183f488d9d6`.
- Reuse its grouped train/validation/test split exactly. Train names alone fit
  weights; validation selects one `L2` value from `{1e-6, 1e-5, 1e-4}`; the
  sealed test split is read for metrics only after validation passes.
- For every positive name, derive six deterministic same-name corruptions:
  interior duplication, adjacent transposition, vowel rotation, vowel
  deletion/substitution, shallow single-letter brand affix, and chunk
  rotation. Invalid, identical, or duplicate corruptions are replaced by a
  deterministic bounded fallback; no corpus name supplies another name's
  negative.
- The corruption algorithm and model cannot be edited after validation or test
  examples are opened.

## Frozen model

- Signed stable-hashed character 2/3/4-grams in 4,096 buckets.
- Sixteen explicit scalar form features covering length, vowel balance,
  consonant run, alternation, repetition, unique-letter ratio, first/last
  sound class, and shallow affix flags.
- Linear pairwise logistic loss, seed `283`, 18 CPU epochs, deterministic
  ordering. No embedding, neural network, language model, external service, or
  network access.
- Validation chooses by pairwise original-over-corruption accuracy, then AUC,
  then smaller L2. A train-only order-3 character likelihood is the frozen
  baseline.

## Frozen gates

- Validation must reach >=75% pairwise accuracy, >=0.75 real-vs-corruption AUC,
  and at least three percentage points pairwise uplift over the Markov
  baseline before test may open.
- Sealed test must reach >=80% pairwise accuracy, >=0.80 AUC, and at least five
  percentage points pairwise uplift over Markov.
- Each of the six corruption families must reach >=70% test pairwise accuracy;
  mean original-minus-corruption margin must be positive.
- Two clean CPU runs must produce byte-identical selected weights, quantized
  artifact, validation report, and test report.
- A passing artifact must be <=32 KiB. Rust parity and any production-backed
  shadow ranking require a separate frozen application protocol.

Any gate failure is a negative checkpoint. Passing is evidence for a
generalized form discriminator only; it is not evidence of beauty, semantics,
or better product pages.
