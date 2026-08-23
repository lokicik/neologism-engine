# Phase 290: grouped out-of-fold Bradley-Terry protocol

This protocol replaces only Phase 287's underpowered fixed 20/5/5 model
evaluation. It is frozen before any human choice exists. The immutable source,
150 primary comparisons, 24 concealed reversals, blind collector, 21 features,
and every later product gate remain unchanged.

## Collection contract

- Reuse the existing source and collector protocol hashes. Validate all 174
  ordered tasks, at least 20/24 repeat consistency, and the existing decisive
  minima before modeling.
- Use decisive primary comparisons only. Require at least 120/150 decisive
  comparisons and at least three decisive comparisons in every one of the 30
  briefs. Neither choices remain in the audit and never become labels.
- Before reading choices, compare the exact 21-feature vectors for every
  frozen pair. The source contains one structurally unscorable pair,
  `primary:r039-01` (`Glossaryai` / `Glossaryio`), whose vectors are identical.
  Keep its human choice and any repeat in the collection audit, but exclude it
  from fitting and predictive evidence. Require this exact singleton identity
  and at least 119 remaining decisive scorable comparisons.

## Prospective grouped evaluation

- Sort the 30 briefs by FNV-1a 64-bit hash of brief text and assign them
  round-robin to six outer folds. Each fold contains five whole briefs; names,
  pairs, and brief families never cross a fold boundary.
- For each outer fold, use the other 25 briefs for all preprocessing, feature
  standardization, and model selection. Select L2 `{0.1, 1, 10, 100}` with a
  deterministic five-fold inner grouped CV: accuracy, then lower Brier, then
  stronger regularization. Refit on all 25 outer-train briefs and predict the
  untouched five-brief fold.
- Aggregate the six outer predictions into exactly one prospective prediction
  per decisive scorable primary comparison. Probability ties are forbidden
  after the predeclared exact-zero pair is removed.
- The model remains the same intercept-free, L2-regularized deterministic IRLS
  Bradley-Terry regression over the frozen 21 transparent features.

## Gates

- Out-of-fold accuracy is at least 60%, exceeds the stronger composite or
  pronounceability baseline by at least eight points, and passes the
  one-sided exact sign test against 50% at `p<=0.05`.
- Against the stronger baseline, the per-pair correctness gain must pass a
  one-sided exact paired sign-flip randomization test at `p<=0.05`. Model
  correctness is zero or one; a baseline prediction tie remains half-correct.
  This retains the deliberately quality-matched baseline ties instead of
  discarding most of the frozen pairs.
- At least 20 of 30 briefs have accuracy above 50%, and the positive-versus-
  negative brief count passes a one-sided exact sign test at `p<=0.05` after
  excluding exactly tied briefs.
- Accuracy is above 50% in every source mode represented by at least ten
  decisive comparisons.
- Two clean executions reproduce normalized records, fold assignments,
  inner selections, out-of-fold predictions, reports, and any passing final
  model byte-for-byte.

Only if every gate passes, select final L2 by six-fold grouped CV on all
decisive data and fit one research model on all 30 briefs. This is still only
same-pool preference prediction. A constrained shadow reranker and the frozen
30-brief full-page human study remain required before any production proposal.
