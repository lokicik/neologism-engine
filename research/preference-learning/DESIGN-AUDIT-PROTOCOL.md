# Phase 290: prospective preference-design power audit

This audit is frozen before any human choice exists. It asks whether the
Phase-287 fixed 20/5/5 brief split can reliably recognize a genuinely useful
transparent preference model. It does not simulate evidence, fit a preference
model, or change the collector.

## Inputs

- Use the frozen Phase-287 source and its 150 primary pairs only. Concealed
  repeats are consistency checks and never increase statistical sample size.
- Reuse the exact 21 candidate features in `fit_preference.py`. Outcomes,
  synthetic labels, name identity, brief tokens, and any generated supervision
  are forbidden.

## Structural audit

- Reconstruct exactly 100/25/25 train/validation/test primary comparisons over
  20/5/5 disjoint briefs.
- Report nonzero feature-difference dimensions and numerical rank for each
  partition. Do not repair collinearity or remove a feature after inspection.
- Form a prospective six-fold alternative by sorting briefs by FNV-1a hash of
  brief text and assigning them round-robin to six folds. Each outer fold must
  contain five briefs and 25 comparisons; no pair or brief may cross folds.

## Power audit

- For the current sealed test, compute the minimum successes needed to satisfy
  both 60% accuracy and the frozen one-sided exact sign test at `p<=0.05`.
- Compute exact binomial pass probability at true accuracies
  `{0.60, 0.65, 0.70, 0.75, 0.80}`. This is an optimistic independence
  calculation; five comparisons sharing a brief can only reduce effective
  information.
- The current design is adequate only if a true 70%-accurate model has at
  least 80% probability of clearing those two gates. Baseline uplift and
  per-mode gates are intentionally omitted here, so passing this audit would
  still be necessary rather than sufficient.
- Report the same optimistic calculation for 150 out-of-fold predictions. A
  grouped nested-CV successor is structurally eligible only if the 70%-truth
  pass probability is at least 95% and all six outer folds are complete.

Failure occurs before collection and may justify a prospectively frozen model
evaluation replacement. It cannot weaken repeat consistency, candidate
quality, human decisiveness, or the later untouched full-page preference gate.
