# Phase 306 polysemous lexeme data negative checkpoint

Date: 2026-08-24

## Decision

The precision-first polysemous-lexeme architecture stops at its frozen
development data-capacity gate. It is not eligible for ranking, sealed briefs,
human testing, production shadowing, or integration.

No source, eligibility rule, polysemy threshold, semantic threshold, capacity
gate, or partition changed after the first result. Two fresh executions
reproduced report and manifest byte-for-byte.

## Frozen identity and result

- Protocol / implementation commits: `e0a8722` / `c88934c`.
- Protocol / evaluator SHA-256:
  `f644ef7ebcacedbd9343a1f0148f078d7cb8fada4d3dadf9f8458d5125aa83c7` /
  `63c8c9d81cf702bb0e8e5c29fca140bad150142d4ae74491723100226164e601`.
- Reproduced report / manifest SHA-256:
  `e86a5229cb664fdaa10ee96ea95f1fce2dc3e16328e1ea811e6a797074d58d95` /
  `1a6728414500e810ce3e607140d84049bae7ac91f2f0645d894536d094ed8639`.
- Eligible lexemes per development brief: minimum `0`, maximum `3`, mean
  `0.2083`, versus the frozen minimum of twelve on every brief.
- Only three briefs had any candidate: `sunrise`; `emblem`; and
  `bazaar`, `emblem`, `envoy`.
- Aggregate exclusions were 4,390 form failures, 10,902 terms outside the
  curated real-word inventory, twelve weak semantic links, eight insufficiently
  polysemous terms, and one collision.
- The cross-brief appearance cap passed; capacity, source coverage, and
  image-bearing-rate gates failed.

## Interpretation and boundary

The meaningful-lexeme ontology remains directionally distinct from Phase 305,
but the intersection of ConceptNet anchors, the narrow 1,100-word curated
production inventory, WordNet multi-domain polysemy, and collision controls is
far too sparse. The frozen stop worked: no ranking or sealed identity exists.

Do not add `common_words.txt`, lower the twelve-candidate gate, admit
single-sense words, or weaken semantic evidence as a repair to Phase 306. A
future lexical route needs an independently justified, human-normed vocabulary
source selected before candidate counts are inspected. Its license and
rating coverage must pass a source audit before any generator or selector is
built.
