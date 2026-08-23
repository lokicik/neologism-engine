# Phase 292: brief-conditioned product-of-experts whole-form sampler

Date frozen: 2026-08-23

This is an isolated, LLM-free generator experiment. It changes the probability
factorization rather than tuning a failed suffix, crossover, edit, GRU, or
syllable-WFST lane. No result can enter production directly.

## Frozen question and prior evidence

Can a product of two character-level experts generate complete spellings that
retain brief-specific form pressure while remaining product-like and visibly
outside the production root-plus-tail templates?

The global expert is justified narrowly by Phase 291: on 1,678 family-disjoint
PseudoLex validation items, the train-product order-three character model had
raw/orthographic-length-controlled Spearman `0.5975 / 0.6120` with independent
human wordlikeness. This is not beauty or product preference. The failed local
kNN manifold is not used.

## Frozen inputs and isolation

- Execute against committed core `ccdb67b49ae053f10ed7bdd4ee683d622d2c50b7`
  in a generated clean archive. Current uncommitted core files are excluded.
- Product dataset SHA-256:
  `dd4b7b977ea62aea570f7ec5b9941ca06174fd7cbb882a39ffbd2183f488d9d6`.
  Only 10,138 `split=train` names fit either expert. The 1,260 validation
  names set a global-form lower-decile floor; dataset test names are unused.
  After ascending sort, the floor is zero-based index `floor(0.10 * N)`.
- Derived train/validation corpus SHA-256:
  `fe974bf069a620061ed60727154861b2373a4626f8d185a81e7b5aa4392b9c70` /
  `fc464b1b7486e3e6ab58f69cebfcb8cba89705177c9ff8bf77b91b685e5e51a4`.
- Canonical brief file SHA-256:
  `4b5163775bc97c7feeae85e6894d7a4160eb66333de8a2fca4d5fa898ee01caa`.
  Sort briefs by FNV-1a 64-bit; first 24 are development and remaining 11 are
  sealed held-out.
- Review-index SHA-256:
  `87c45e7373ed2715774eea2f22ec28c975cea8139abd3ee513150762a373e09e`.
  It is combined with the committed BigTech, roots, dictionary, common-word,
  and experimental accent inventories for exact/edit-one rejection.

## Frozen model

- Both experts are order-three character models: two previous characters
  predict `a-z` or EOS from `^^name$` with additive `0.1` smoothing.
- The global expert is fitted once to all train-product names.
- For each brief, production `extract_keywords(..., 6)` and
  `brand_root_groups(..., 16)` provide concept groups. One semantic expert is
  fitted to the lowercase ASCII roots in each group. No suffix, metaphor list,
  description corpus, embedding, outcome, or external model participates.
- At each character, the sampler uses
  `0.75 * log P_global + 0.25 * log P_group`, then temperature `0.85`.
  EOS is masked before four characters and forced after twelve. A source group
  is chosen round-robin by attempt; seed controls only transition sampling.
- Reject unchanged source-root substrings of four or more characters. This
  forces distributed brief pressure instead of copying a root and decorating
  it. Existing phonotactic, sonority, one-to-three-syllable, quality `>=75`,
  lexical-hazard, and collision checks remain hard filters.
- Every accepted candidate must meet the train-product global likelihood floor
  fixed at the validation-name lower decile.

## Frozen pool and selector

- Seeds are `13`, `67`, and `313`. Each page gets at most 40,000 attempts to
  collect 160 unique candidates and selects ten.
- Candidate relevance is `0.65 * composite quality + 0.20 * normalized global
  likelihood + 0.15 * normalized own-brief semantic likelihood`. Normalization
  is min-max inside the fixed pool, with a constant feature mapped to zero.
- Greedy MMR uses lambda `0.70` and normalized edit similarity. A sampled source
  group may occupy at most four slots when three or more groups exist, five
  slots when two exist, and ten slots when only one exists. Ties use lowercase
  spelling, ascending.
- Wrong-brief likelihood never participates in generation or selection. The
  diagnostic compares maximum own-group log likelihood with the maximum across
  nine cyclic, FNV-ordered wrong-brief targets.

## Frozen gates

Development must pass all gates before sealed held-out may run:

- 24 briefs x three seeds: every pool `160/160`, every page `10/10`.
- Every card composite `>=75`; partition mean `>=84.0`.
- Mean/minimum page ILAD `>=0.72 / >=0.60`.
- At least 27 unique spellings among each brief's 30 outputs; mean/maximum
  cross-seed overlap `<=1/10 / <=3/10`; no duplicate normalized page set.
- Every selected spelling meets the global-form floor. Own brief likelihood
  beats all nine wrong-brief targets in at least 70% of selected cards.
- Phase-141 suffix/metaphor-tail matches occupy at most 20% of selected cards;
  unchanged four-plus-letter source roots, lexical hazards, and exact/edit-one
  review collisions are zero.
- Same-process replay plus two fresh release processes reproduce rejection
  counters, pools, traces, ordered pages, report, and hashes byte-for-byte.

Sealed held-out repeats every gate without changing a constant. A failure at
either partition is a negative checkpoint and closes the lane.

## Later boundary

Passing both partitions would open a separately frozen shadow hybrid, not a
production change. It would have to preserve production leads and all existing
quality/semantic/collision gates while reducing canonical assembled-card share
by at least ten points and single-shape walls by at least 25%. Only a later
context-disjoint blind full-page preference study could support a better-name
claim or integration proposal.
