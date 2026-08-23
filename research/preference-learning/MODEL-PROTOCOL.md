# Phase 287 transparent Bradley-Terry model protocol

This protocol freezes model details before any human collection exists.

- Use only decisive primary choices. Concealed repeats measure consistency and
  never become extra training or evaluation examples.
- Represent every candidate with 21 transparent values: three production
  scores, syllables, character length, vowel share, C/V alternation, repeated-
  letter share, unique-letter share, mean/transition/initial/final sonority,
  concept coverage, four source-mode indicators, and three construction
  indicators.
- Compute means and scales from the unique candidates participating in decisive
  **train** pairs. Standardize candidates, then subtract right from left. Zero-
  variance dimensions use scale one.
- Fit intercept-free Bradley-Terry logistic regression by deterministic IRLS.
  L2 regularizes every weight. Reject non-finite input, singular solves,
  non-convergence after 100 iterations, or final gradient infinity norm above
  `1e-8`.
- Select L2 `{0.1, 1, 10, 100}` by validation accuracy, then lower Brier, then
  stronger L2. Model probability ties count half-correct for validation but are
  forbidden on sealed test.
- Validation must reach 60% decisive accuracy before test opens. Sealed test
  must reach 60%, beat the better of composite/pronounceability by at least
  eight percentage points, pass a one-sided exact sign test against 50% at
  `p<=0.05`, and remain positive in every source mode represented by at least
  ten test comparisons.
- JSON inputs must match the frozen source and collector hashes, contain all 174
  ordered tasks exactly once, pass 20/24 repeat consistency, and meet decisive
  counts `80/20/20`. Ambiguity or disagreement with the collector audit fails
  closed.
