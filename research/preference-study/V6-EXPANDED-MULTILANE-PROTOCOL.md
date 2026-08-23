# Expanded multi-lane preference source v6

V6 keeps the frozen v5 generators, seeds, exclusions, round-robin merge,
quality floor, pair gap, and five-pair requirement. It changes only how much
of the already generated multi-lane session may enter the source pool.

- Retain the first 32 round-robin candidates instead of 24.
- Require at least 20 quality-eligible candidates instead of 16.
- Continue to select five disjoint pairs whose composite-quality gap is at
  most two points.

This is a stricter evidence source, not a lowered gate: it exposes eight more
deterministically generated alternatives and raises the eligible-candidate
minimum by four. The override is bound to the exact v5 protocol by its raw
SHA-256. If any of the 30 briefs fails, v6 produces no study package.
