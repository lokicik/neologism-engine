# Pairability-first preference source v8

V8 uses the actual data requirement of the blind study as its source gate.
Every retained pair must still contain two production candidates at quality
75 or above, differ by no more than two composite-quality points, and share no
name with another primary pair for that brief.

- Keep the complete deterministic five-lane pool from v7.
- Require at least 24 total unique names.
- Require exactly five disjoint quality-matched pairs, consuming ten eligible
  names; no additional unused eligible-name reserve is required.
- Keep all generator inputs, source identities, seeds, exclusions, replay,
  split, concealed repeats, decision counts, and future ranker gates.

This revision removes a redundant reserve gate after v7 proved it could reject
a pool before testing the pairs the study actually needs. It does not lower
the per-name quality floor or widen the pair gap. V8 is the final source
preflight: any brief that cannot form all five pairs ends this route as a
negative checkpoint.
