# Phase 291 model implementation freeze

Date: 2026-08-23

No product-manifold score, Markov score, human correlation, selected `k`, or
permutation result was computed before this checkpoint.

## Deterministic details

- Source identities are those in `DATA-CONTRACT-PASS.md`; product dataset
  SHA-256 is
  `dd4b7b977ea62aea570f7ec5b9941ca06174fd7cbb882a39ffbd2183f488d9d6`.
- Family allocation sorts edit-one connected components by FNV-1a of their
  lexicographically first spelling. Whole families fill development-train up
  to 60% of eligible items, validation up to the next 20%, and sealed test
  receives the remainder. No outcome participates in family construction.
- Character grams use `^name$`; exact 2/3/4-gram counts receive IDF
  `log((N+1)/(df+1))+1`, then sparse L2 normalization. Query grams unseen in
  product train data contribute zero. Missing neighbors are zero-padded before
  taking the mean of the top `k` similarities.
- Markov uses `^^name$`, order three, alphabet `a-z` plus EOS, and additive
  smoothing `0.1`; score is mean log probability per predicted character.
- Validation selects `k` from `{1,3,5,10,20}` exactly as the protocol states.
- Fixed orthographic buckets are `4-6`, `7-9`, and `10-12` characters. A
  bucket gate applies only at 200 or more sealed items.
- Controlled correlations residualize average-tie ranks against `[1, length]`.
- Family-preserving permutations shuffle entire outcome vectors only among
  families of the same item count. Use 1,000 permutations and seed `2912026`;
  empirical p is `(wins+1)/1001`.
- JSON is canonical UTF-8 with sorted keys and one trailing LF. Validation
  failure exits before sealed ratings are aggregated or written.

The implementation itself must be hashed and recorded before its first model
run. Any implementation correction after a human correlation is visible
closes the experiment rather than changing this freeze.
