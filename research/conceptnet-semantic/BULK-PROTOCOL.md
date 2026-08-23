# Phase 298: raw ConceptNet two-hop semantic preflight

Date frozen: 2026-08-23

This is an offline non-LLM data/representation test. It does not generate a
name, train a form model, or change production behavior.

## Frozen source

- ConceptNet 5.7 assertions bulk release, required compressed bytes
  `497963447` and SHA-256
  `accd65fe94038584295574ddc26e1500c1919c8c4532bf771811cafd0948af7e`.
- Canonical production-keyword evidence, required SHA-256
  `1f959c015efb9d49b1219b966f3ee464592fa62949c4b8804ce1f2fe2f692a6d`,
  containing 35 briefs and 111 unique `extract_keywords` outputs.
- ConceptNet data and every derived anchor index remain CC BY-SA 4.0 with the
  adjacent `ATTRIBUTION.md`. Raw and derived data stay ignored.
- Network access is forbidden. The extractor streams the gzip archive directly
  and may not materialize its decompressed contents.

## Frozen graph representation

- Parse the documented five tab-separated fields: assertion URI, relation,
  start node, end node, and JSON metadata.
- Retain only these positive association relations:
  `RelatedTo`, `IsA`, `Synonym`, `SimilarTo`, `HasA`, `PartOf`, `UsedFor`,
  `CapableOf`, `HasProperty`, `MannerOf`, `DerivedFrom`, `FormOf`, `AtLocation`,
  `Causes`, `CreatedBy`, `MadeOf`, and `ReceivesAction`.
- Both endpoints must be English `/c/en/` concepts. Decode the concept term
  and ignore POS/sense suffixes. An intermediate is one to three underscore-
  separated lowercase ASCII tokens of two to twenty letters each, total length
  at most 48. A final anchor is one lowercase ASCII token `[a-z]{3,16}`.
- Metadata weight must be finite and at least `1.0`. Treat retained relations
  as undirected associations. No negative relation, text surface, external URL,
  stemming, alias repair, manually curated edge, or downloaded embedding is
  allowed.

## Frozen two-pass algorithm

1. First pass: for each exact canonical keyword node, retain its strongest
   direct weight to every eligible neighboring concept. Keep the top 128
   neighbors by descending weight then lexical term.
2. Second pass: stream the archive again. When one endpoint is a retained
   intermediate, propagate an eligible single-token opposite endpoint back to
   every source keyword. A two-hop score is
   `0.5 * min(first_edge_weight, second_edge_weight)`.
3. Direct eligible single-token neighbors keep their first-edge weight. For
   each keyword/anchor pair retain the maximum direct or two-hop score.
4. Bound a keyword's working map deterministically: when it exceeds 8,192
   entries, retain the strongest 4,096 by descending score then lexical term.
   After pass two, retain the strongest 200. Reject the query keyword itself.
5. A brief pool is the union of its extracted-keyword anchors, retaining
   maximum score and full source-keyword provenance.

The extractor writes deterministic gzip keyword anchors, a canonical report,
and a manifest. Two clean executions must reproduce all three byte-for-byte.

## Frozen gates

- Exactly 111 declared keywords are processed and every keyword has at least
  one eligible anchor.
- All 35 canonical briefs have at least 64 unique anchors.
- Every brief has at least one source keyword with at least 32 anchors.
- Every multi-keyword brief has at least two source keywords that each
  contribute at least one anchor not supplied by another source keyword.
- Across all 595 brief pairs, mean anchor-set Jaccard is at most `0.35` and
  maximum Jaccard at most `0.80`.
- At least 95% of retained keyword anchors have a strictly positive two-hop or
  direct score, all retained scores are finite, and no undeclared relation or
  non-English/nonconforming term reaches the output.

Any failure closes this representation without changing a threshold. Passing
proves only modern semantic anchor coverage and opens a separately frozen
reference-conditioned whole-form grammar experiment. It does not prove name
meaning, attractiveness, or production readiness.
