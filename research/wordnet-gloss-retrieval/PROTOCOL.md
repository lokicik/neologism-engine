# Phase 296: WordNet gloss-retrieval conditional form model

Date frozen: 2026-08-23

This is an isolated non-LLM mechanism test. It does not change production
`generate()`, WASM, web Auto, storage, taste export, or a public type. It does
not generate candidate pages unless every validation and sealed mechanism gate
below passes unchanged.

## Frozen question and distinction

Can brief-like lexical definitions retrieve semantically related WordNet
lemmas strongly enough that a local whole-form character distribution assigns
substantially higher probability to the held-out lemma than a global WordNet
form prior does?

Earlier WordNet probes selected literal graph neighbors or applied fixed or
learned edit-one transformations to graph anchors. This phase does neither. It
uses definition text only for sparse retrieval and uses retrieved train lemmas
only as weighted observations in a character model. It has no graph traversal,
literal-word selector, respeller, neural model, or product/name supervision.

## Frozen source and normalization

- Local source: `C:\Users\LOKMAN\nltk_data\corpora\wordnet.zip`.
- Required WordNet 3.0 ZIP SHA-256:
  `cbda5ea6eef7f36a97a43d4a75f85e07fccbb4f23657d27b4ccbc93e2646ab59`.
- The Princeton WordNet 3.0 license is preserved as `wordnet/LICENSE` in the
  ZIP and permits use, copying, modification, and distribution subject to its
  notice. Network access is forbidden.
- Parse `data.noun`, `data.verb`, `data.adj`, and `data.adv` directly from the
  ZIP. Accept only unique lowercase lemmas matching `[a-z]{4,12}`; underscores,
  hyphens, case folding of non-lowercase forms, and transliteration are
  forbidden.
- One record represents one unique lemma. Its document concatenates glosses
  from every synset containing that lemma, in source order.
- Tokenize ASCII `[a-z]{2,}` words, remove the frozen English function-word
  inventory embedded in the evaluator, and remove every lemma from the
  contributing synset before making features. This prevents a definition from
  revealing its answer or a same-synset synonym directly.
- Features are remaining unigrams plus adjacent bigrams. A record without a
  feature is ineligible.

## Frozen split and leakage control

- Assign each lemma provisionally by FNV-1a 64-bit hash modulo ten: residues
  `0..7` train, `8` validation, and `9` sealed test.
- Keep all train records. Keep a validation record only when its lemma is not
  exact/edit-one from any train lemma. Keep a test record only when its lemma
  is not exact/edit-one from any train or retained-validation lemma.
- Edit-one means one insertion, deletion, or substitution; transposition is not
  edit-one. Splits and filtering are name-only and cannot inspect model scores.
- Require at least 50,000 raw eligible lemmas, 45,000 retained records, 3,000
  retained validation records, and 3,000 retained sealed-test records. At most
  50% of either provisional evaluation split may be removed. Cross-partition
  exact/edit-one leakage must be zero.
- Every frozen canonical brief must have at least one non-stopword feature in
  the train IDF vocabulary and at least 64 positive-cosine train neighbors.
  This is a retrieval coverage gate only; canonical names are not scored here.

## Frozen retrieval and character model

- Fit sparse TF-IDF only on train documents. Use `1 + log(tf)` and
  `log((N+1)/(df+1)) + 1`, L2 normalize, and rank positive cosine neighbors by
  descending similarity then lexical lemma.
- The global form prior is an add-`0.1` order-three character model over all
  train lemmas using alphabet `a-z + EOS` and two BOS symbols.
- A local model uses the top `k` retrieved train lemmas weighted by cosine
  similarity. Conditional probability is
  `(1-alpha) * global + alpha * local`.
- Validation grid: `k {16,32,64}` x `alpha {0.15,0.25,0.35}`. Choose lowest
  mean conditional NLL, then highest real-condition win rate, lower alpha, and
  lower k. No other hyperparameter search is allowed.
- Evaluate at most 10,000 retained records in ascending `(FNV, lemma)` order.
  The first 2,000 form the condition-contrast set. For each, compare its own
  gloss-conditioned NLL with the local models of the next nine records.
- Use 2,000 deterministic paired-item bootstrap replicates, seed `2962026`,
  and report the empirical 0.5th percentile of mean absolute NLL gain.

## Frozen mechanism gates

Validation must satisfy all of the following before any sealed retrieval or
scoring artifact is written:

- at least 95% of queries have `k` positive-cosine neighbors;
- own gloss beats nine wrong glosses in at least 65% of comparisons;
- conditional mean NLL improves over global mean NLL by at least 5%;
- the 99% bootstrap lower bound on absolute paired NLL gain is positive.

Sealed test repeats those four gates with the selected validation pair and also
requires positive mean absolute gain in every length bucket (`4-6`, `7-9`,
`10-12`) containing at least 500 records. Two clean runs must reproduce every
retained artifact byte-for-byte.

Passing proves only a non-neural lexical conditioning mechanism. It would open
a separately frozen product-form generation experiment that mixes the local
WordNet semantic expert with a product-name form prior. It would not establish
name quality, permit production integration, or bypass blind human preference
gates. Any development failure closes Phase 296 without sealed scoring or a
generator.
