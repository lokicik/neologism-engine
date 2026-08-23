# Phase 290 preference-design audit result

Date: 2026-08-23

## Decision

The fixed Phase-287 20/5/5 model evaluation is underpowered and should be
superseded before human collection. Its sealed test contains only 25 pairs.
Passing both 60% accuracy and the frozen one-sided exact sign test requires
18/25 correct, or 72%. Even if the model's true accuracy is 70%, its optimistic
independent-binomial probability of passing is only **51.1849%**, below the
frozen 80% design-power gate.

The source itself can support a stronger evaluation without asking for more
choices. Sorting all 30 briefs by frozen FNV identity and assigning them
round-robin produces six complete folds of five briefs and 25 pairs. Aggregated
out-of-fold evaluation uses all 150 primary comparisons; at 70% true accuracy,
the same optimistic calculation reaches **99.6510%** power. Nested grouped CV
is therefore structurally eligible as a prospective replacement.

## Structural findings

- Fixed comparisons: train/validation/test = `100/25/25` over `20/5/5` briefs.
- Feature-difference rank: train `17`, validation `15`, test `16`, all `17`.
- Nineteen of 21 frozen dimensions vary across at least one pair.
- One pair is exactly indistinguishable in all 21 features:
  `primary:r039-01` (`Glossaryai` / `Glossaryio`). It must remain in the blind
  collection and repeat audit but cannot honestly count as a model prediction.

These are design diagnostics, not preference evidence. No human choice or
synthetic label was used.

## Reproducibility

- Audit protocol SHA-256:
  `c19a8f3a8d301456470e32a2a46724b57c699f0e543a82f2d2fa063eaa4c940f`
- Audit implementation SHA-256:
  `a3cdd8d7c716649d67fdd1560b8f58d91bfc1fda8178d30190b0bd1d8d33f3cc`
- Source canonical payload SHA-256:
  `a763cbaa45ad49e592b88c78d09c96907f7492d9bafab3f3b869209cafb9e02a`
- Two clean audit reports were byte-identical at SHA-256:
  `492e9486f810b2a84aa402e493e52c7948b2573d6048a585720e08ca1985ca24`.
