# Phase 297: ConceptNet semantic-coverage preflight

Date frozen: 2026-08-23

This is an isolated non-LLM data preflight. It does not generate names, train a
model, change production `generate()`, or modify WASM, web, storage, taste, or
public types.

## Frozen question and source

Can an openly licensed commonsense association graph supply enough modern
semantic anchors for every canonical product brief to justify a later,
separately frozen whole-form generator experiment?

- Source: the official ConceptNet 5.7 read-only API, endpoint
  `https://api.conceptnet.io/related/c/en/{keyword}?filter=/c/en&limit=200`.
- ConceptNet data is CC BY-SA 4.0. Any retained derived graph index must remain
  a separately attributed CC BY-SA data artifact; it may not be silently
  relicensed as project code.
- Input is the frozen production-keyword evidence at
  `research/holistic/work/dataset-final/canonical-keyword-coverage.json`,
  required SHA-256
  `1f959c015efb9d49b1219b966f3ee464592fa62949c4b8804ce1f2fe2f692a6d`.
  It contains 35 canonical briefs and 111 unique outputs previously produced
  by production `extract_keywords`.
- Network access is allowed only in an explicit `refresh.py --refresh` run.
  Refresh requests the 111 keywords in lexical order, sends an identifying
  user agent, waits at least 1.05 seconds between requests, fails closed on any
  non-200/malformed response, and writes a deterministic gzip snapshot plus a
  source manifest. Normal validation is offline.

## Frozen normalization

- Read each response's `related` rows. Accept only `/c/en/{term}` nodes whose
  decoded term is one lowercase single-token ASCII string matching
  `[a-z]{3,16}` and whose finite positive weight is at least `0.10`.
- Reject the query term itself. Deduplicate an anchor by keeping its maximum
  weight for that query, then order by descending weight and lexical term.
- Retain at most 200 anchors per keyword. No stemming, graph traversal,
  synonym repair, manual aliases, embeddings downloaded into the repository,
  or post-result vocabulary expansion is allowed.
- A brief anchor pool is the union of its extracted keyword anchors, retaining
  maximum weight and source-keyword provenance.

## Frozen gates

- Snapshot contains exactly the 111 declared keywords, with one valid official
  response each and no undeclared keyword.
- Every keyword has at least one eligible anchor.
- Every canonical brief has at least 64 unique eligible anchors.
- Every brief has at least one source keyword contributing at least 32 anchors.
- When a brief has at least two extracted keywords, at least two source
  keywords must each contribute an anchor not supplied by the other sources.
- Across the 595 unordered brief pairs, mean Jaccard anchor-set overlap is at
  most `0.35` and maximum overlap is at most `0.80`.
- Two offline validations of the same snapshot must be byte-identical.

Any failure closes Phase 297 without changing a threshold or inspecting a
generator. Passing proves only semantic source coverage. It would open a new
protocol for a reference-conditioned whole-form product grammar; it would not
prove that generated names are relevant, attractive, or production-ready.
