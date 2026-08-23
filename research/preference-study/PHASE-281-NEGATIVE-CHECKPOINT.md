# Phase 281 context-matched preference source: negative checkpoint

Date: 2026-08-23

## Decision

The production-backed pairwise-data route is closed before collecting human
choices. Across eight frozen source protocols, no one protocol produced a
complete, replayable source for all 30 briefs while retaining its declared
capacity and quality structure. The later revisions changed source
architecture explicitly and were each frozen before their outputs were
opened; the final v8 failure is terminal for this route.

## What was learned

- Exact Auto pages cannot supply 30 unique candidates for every brief.
- Rolling Auto still exhausts some brief-specific spaces.
- Five disjoint production lanes substantially improve coverage, reaching 22
  of 30 briefs under the final protocol.
- Production lanes legitimately return variable page lengths. Fixed 24/32
  prefixes and surplus eligible-name reserves are not valid universal
  invariants.
- Even the full five-lane pool can contain fewer than 24 unique names for a
  brief, so packaging a balanced 30-brief study from this source would require
  post-result retries, weaker scope, or another generator. None is allowed by
  the frozen study question.

## Consequence

No offline evaluator was packaged and no transparent ranker was trained. This
is not evidence that human preference learning cannot work; it shows that the
current production generators cannot supply the preregistered context-matched
study without further generator changes. The next non-LLM experiment therefore
returns to generation architecture: a train-only articulatory syllable WFST,
conditioned by the existing transparent semantic roots and evaluated on a
development/held-out brief split.
