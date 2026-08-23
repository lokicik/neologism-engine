# Phase 287: prospective same-brief preference learner

This is the remaining non-LLM architecture after the public form-prior gates.
It learns directly from human choices between actual engine candidates. It is
isolated from production generation, ranking, WASM, web storage, and taste.

## Source recruitment

- Freeze the 60 never-before-used briefs in `brief-bank.json` before generation.
- For every brief, build the exact five-lane Phase-281 v8 production pool twice.
  Require 24 unique `[A-Za-z]{4,12}` names, quality `>=75`, and five disjoint
  within-two-quality-point pairs. A failing brief is recorded, not repaired.
- Sort passing briefs by FNV-1a 64-bit hash of brief text and retain the first
  30. Stop if fewer than 30 pass. This changes the sampling frame rather than
  weakening any candidate or pair gate.
- The first 20 retained hash-ordered briefs are train, the next five validation,
  and the final five sealed test. Names and brief families never cross splits.
- Freeze the complete source, protocol, WASM, bridge, engine, Auto, and brief
  bank identities before a human sees a pair.

## Human collection

- Show five primary same-brief pairs for each retained brief: 150 choices.
- Choices are `left`, `right`, or `neither`; names are shown without generator
  lane, score, or provenance. Order is deterministic and balanced.
- Add 24 concealed side-reversed repeats chosen by lowest SHA-256 pair identity.
  Require at least 20/24 repeat consistency.
- Require at least 80/20/20 decisive train/validation/test choices. `Neither`
  is retained for audit but excluded from binary fitting and accuracy.
- Collection output is immutable and locally exported. No model fit or preview
  occurs until all decisions and repeats are complete.

## Frozen transparent model

- Bradley-Terry logistic regression over left-minus-right feature vectors.
- Train-only standardized features: pronounceability, novelty, memorability,
  syllables, character length, vowel share, C/V alternation, repeated-letter
  share, unique-letter share, mean and transition sonority, initial/final
  sonority, concept coverage, four source-mode indicators, and three
  construction indicators (`none`, guided metaphor, guided pair).
- No raw name identity, brief token, semantic embedding, generated text,
  character n-gram, source rank, or model/API call is allowed.
- Select L2 `{0.1, 1, 10, 100}` on validation accuracy, then Brier score, then
  stronger regularization. Fit with deterministic IRLS and fail closed on
  non-convergence or singular input.
- Baselines are the existing composite score and pronounceability alone; ties
  count as half-correct. Test remains sealed until model and threshold identity
  are frozen from train/validation.

## Model gates

- Validation and sealed-test decisive accuracy each `>=60%`.
- Sealed accuracy exceeds the stronger frozen baseline by at least 8 percentage
  points and has one-sided exact sign-test `p<=0.05` against 50%.
- Positive accuracy in every test source mode represented by at least ten
  decisive comparisons.
- Two clean fits produce byte-identical normalized data, coefficients,
  validation report, and sealed report.

Passing would establish only same-pool pairwise preference prediction. A later
research-only constrained reranker must preserve lead, semantic coverage,
quality, collision, lexical-hazard, and diversity gates, then win the existing
30-brief/12-reversal blind full-page study before any production proposal.
