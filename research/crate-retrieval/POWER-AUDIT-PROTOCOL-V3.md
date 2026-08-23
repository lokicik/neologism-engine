# Phase 295 pre-model evaluation-size audit

Date frozen: 2026-08-23

No retrieval, NLL, condition score, selected hyperparameter, or generated name
exists. This audit may revise only the Phase 294 per-partition record minimum;
source normalization, leakage exclusions, model, evaluation sample sizes, and
effect gates stay fixed.

## Frozen decision rule

A round minimum of 3,000 clean records per evaluation partition is eligible
only if all of the following hold mathematically:

- It contains the already-frozen 2,000-item real-vs-nine-wrong diagnostic plus
  at least 50% unused reserve.
- At `n=2,000`, the 95% Wilson half-width is at most 2.2 percentage points in
  the worst Bernoulli case and the Wilson lower bound at the 65% gate is at
  least 62%.
- Under a 50% null, observing at least the 65% gate (`1,300/2,000`) has exact
  one-sided binomial probability at most `1e-30`.
- At `n=3,000`, the 95% Wilson half-width for the 95% full-neighbor retrieval
  gate is at most one percentage point.

If eligible, Phase 295 must also strengthen NLL inference: alongside the fixed
5% mean improvement gate, a deterministic 2,000-replicate component bootstrap
must give a positive 99% lower confidence bound for paired per-name improvement.
Bootstrap seed is `2952026`; whole owner/description components are sampled,
not individual records.

This audit cannot choose the observed 3,290/3,322 counts, lower a model effect
threshold, or remove another record.
