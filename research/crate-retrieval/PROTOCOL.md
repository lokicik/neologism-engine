# Phase 293: retrieval-conditioned package-name model

Date frozen: 2026-08-23

This is an isolated, non-LLM mechanism experiment. It changes the semantic
supervision source and conditioning architecture rather than retuning the
failed Wikidata GRU, root product-of-experts, or synthetic form scorers.

## Frozen question

Can classical lexical retrieval over real developer-package descriptions
condition a character model strongly enough that the observed package name is
more probable under its own description than under unrelated descriptions,
while improving over one global package-name model?

Passing establishes semantic conditioning only. It does not establish beauty,
trademark safety, or better product naming.

## Source and legal boundary

- Source: the official crates.io daily database dump at
  `https://static.crates.io/db-dump.tar.gz`.
- The crates.io data-access policy recommends the database dump for large
  subsets and says its layout is not stable. The 2026-08-23 response reported
  `Content-Length: 1763902984`, `Last-Modified: Sun, 23 Aug 2026 02:06:17 GMT`,
  ETag `f8a6f218316c7fd2ce13a31ec7a94493-169`, and byte-range support.
- The access policy does not declare a license for package metadata. The raw
  archive, extracted tables, descriptions, and names remain ignored and are
  not redistributed. A technical pass cannot open production use without a
  separate compatible-license review.
- Network access occurs only through explicit `refresh.py --refresh`. Record
  URL, UTC retrieval time, response headers, byte count, SHA-256, archive member
  inventory, and any included usage/license documentation.

## Eligibility and leakage control

- Use only directly observed crate names matching lowercase `[a-z]{4,12}` and
  a populated description that retains at least three eligible terms after
  normalization. Do not remove punctuation from names, transliterate, join
  tokens, infer descriptions, or use README/source-code text.
- Description terms are lowercase ASCII `[a-z][a-z0-9]{1,23}` unigrams plus
  adjacent bigrams after the frozen English stoplist. Remove an exact token
  equal to the crate name before feature construction. Keywords/categories may
  be appended only when their official dump relations and identity are present;
  their absence is not imputed.
- Require at least 50,000 eligible distinct crates. Owner identities, exact and
  edit-one name families, and exact normalized-description fingerprints form
  connected components. No component may cross partitions or contain more
  than 5% of eligible items.
- Sort components by FNV-1a of their lexicographically first crate name and
  allocate 80/10/10 by item count. Each validation and sealed-test partition
  must contain at least 5,000 items and final shares must be within three
  percentage points of target.
- The 35 canonical briefs must each retain at least one train-vocabulary term.

## Frozen retrieval and name models

- Fit train-only TF-IDF over description unigrams/bigrams with
  `idf = log((N+1)/(df+1))+1`, sublinear term frequency `1+log(tf)`, and sparse
  L2 normalization. Query terms absent from train contribute zero.
- Retrieve by exact sparse cosine. Candidate documents from the same crate are
  impossible across grouped partitions. Similarity ties use crate name then
  numeric crate identity.
- Fit a global order-three character model on all train names. For a query,
  fit a similarity-weighted local order-three model on its retrieved train
  names. Both predict `a-z + EOS` from two previous characters in `^^name$`
  with additive `0.1` smoothing.
- Score with probability mixture
  `P = (1-alpha) * P_global + alpha * P_local` and mean negative log likelihood
  per predicted character.
- Validation selects one fixed pair from
  `k {16,32,64} x alpha {0.15,0.25,0.35}` by lower conditional NLL, then higher
  true-vs-wrong rate, then smaller `alpha`, then smaller `k`.
- Deterministically evaluate NLL on up to 10,000 lowest-FNV items per partition.
  Evaluate condition discrimination on the first 2,000 of that set. For each,
  the real description competes with nine cyclic wrong descriptions from the
  same evaluation set; wrong descriptions retrieve their own train neighbors.
  Neither download counts nor popularity participate.

## Frozen gates

Validation must pass before sealed names are scored:

- Conditional NLL improves at least 5% over the global-only model.
- The real description gives its name higher likelihood than each of nine wrong
  descriptions in at least 65% of comparisons.
- At least 95% of evaluation queries retrieve `k` positive-cosine neighbors;
  no missing neighbor is silently zero-padded.

Sealed test repeats all three thresholds with the validation-selected pair. It
also requires positive NLL improvement in length buckets `4-6`, `7-9`, and
`10-12` whenever a bucket contains at least 500 evaluation items. Two clean CPU
runs must reproduce normalized records, connected components, partitions,
vocabulary/IDF, selected hyperparameters, retrieval identities, scores,
rejection counts, reports, and hashes byte-for-byte.

Any validation failure closes the lane before sealed scoring or generation.

## Later generator boundary

Passing both partitions would only open a separate research generator. It may
replace Phase 292's root expert with the retrieved-name local model, but must
freeze sampling before inspection and pass full-page quality, diversity,
collision, wrong-brief, construction-wall, replay, and later blind human
preference gates. No passing mechanism can bypass the license review.
