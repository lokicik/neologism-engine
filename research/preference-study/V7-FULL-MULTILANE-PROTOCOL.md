# Full multi-lane preference source v7

V7 removes the invalid fixed-prefix assumption exposed by v6. It keeps every
unique candidate produced by the five frozen v5 lanes, in deterministic
round-robin order.

- Require at least 24 total unique names per brief.
- Require at least 20 names at or above the unchanged quality floor of 75.
- Keep the unchanged five disjoint pairs and maximum two-point quality gap.
- Keep all generator inputs, lane order, seeds, exclusions, double-run replay,
  split, concealed repeats, and future ranker gates.

Pool length may vary because the production generators legitimately return
short pages. No brief receives a retry, fallback, or threshold adjustment. If
any brief fails, v7 produces no study package.
