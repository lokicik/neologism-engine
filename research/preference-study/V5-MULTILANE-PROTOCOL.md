# Multi-lane preference source v5

V5 is a distinct selection architecture data source. It asks the future ranker
to compare candidates from five existing local production lanes rather than
trying to stretch guided Auto beyond its finite brief-specific space.

- Run exactly one call each for Auto, plain Brandable, guided metaphor,
  concept-pair, and Compound, in that order. Each requests ten names, uses the
  frozen base seed plus its lane index times `2654435769` modulo `2^32`, and
  excludes every earlier lane result.
- Empty or short lanes are recorded honestly. Any duplicate across lanes fails.
- Merge lane outputs round-robin by within-lane order and retain the first 24.
  At least 24 total unique names are required; no retry or fallback lane exists.
- Run the full five-lane session twice and require byte-identical lane inputs,
  outputs, and merged pool.
- Pair only >=75 candidates; retain the minimum 16 eligible names, five
  disjoint <=2-quality-gap pairs, blind split, repeat, offline, and future
  ranker gates from v3.

This pool may establish preference between generation families. It does not
change their production weights and cannot itself prove any family better.
