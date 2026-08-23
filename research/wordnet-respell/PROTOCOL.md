# WordNet-anchor single-transform respelling probe

This is an isolated, non-LLM generator-family preflight. Nothing here is
imported by production `generate()`, WASM, web Auto, storage, taste, or a public
type.

## Frozen question

Can WordNet supply a brief-conditioned hidden lexical anchor while the engine's
existing conservative `respell_options` transducer turns that anchor into a
novel, single-piece brand form?

Phase 277 emitted literal dictionary words and treated sibling roots inside one
concept group as independent concepts. This architecture instead treats each
production `brand_root_groups` entry as one semantic unit. It emits no anchor
verbatim and makes no suffix, metaphor, or multi-root join.

## Frozen sources and transformations

- WordNet 3.0 ZIP SHA-256:
  `cbda5ea6eef7f36a97a43d4a75f85e07fccbb4f23657d27b4ccbc93e2646ab59`
- Local input: `C:\Users\LOKMAN\nltk_data\corpora\wordnet.zip`
- Canonical briefs and Phase-268 review names stay identical to Phase 277.
- Network access, NLTK, learned embeddings, model training, and product/name
  supervision are forbidden.
- A research-only Rust helper must call production `extract_keywords`,
  `brand_root_groups`, and `respell_options`; Python may not reimplement them.
- WordNet traversal, exception morphology, anchor vocabulary, relation set, and
  depth-two limit stay identical to Phase 277.
- Every output must be produced by exactly one current `respell_options`
  transform from one eligible anchor. Direct anchors, chained transforms, and
  fallbacks are forbidden. The emitted form must be edit distance one from its
  recorded anchor.

## Frozen filtering and ranking

- Outputs are lowercase ASCII `[a-z]{4,12}` and pass the production respell
  structural rule (`is_valid_clustered(..., BigTech, 4)`), one-to-three
  syllables, bad-substring control, and composite quality >=75.
- Reject exact prompt keywords, graph seeds, production roots, and source
  anchors. Reject exact/edit-one collisions against Phase-268 review names and
  `bigtech.txt`.
- Rank by anchor graph distance, independent concept-group support, bounded
  SemCor frequency, output quality, and a small deterministic seed tie-break.
  These are selector signals, not human preference evidence.
- A source anchor may supply only one selected card. A page must represent two
  concept groups only when at least two groups have eligible outputs; no quota
  is imposed across sibling roots within one concept group.

## Development and sealed split

Keep the exact Phase-276/277 FNV-sorted split: 24 development briefs and 11
sealed held-out briefs. Held-out may run only if every development gate passes
without changing this protocol.

## Frozen gates

- Every development brief has at least one supported graph seed, at least 40
  distinct transformed candidates after lexical/collision filters, and at least
  30 after structural/quality filters.
- All 24 development briefs x seeds `13/67/313` produce 10/10 pages. If opened,
  all 11 held-out briefs x three seeds must also do so.
- Every card has composite quality >=75 and each partition averages >=84.0.
- Mean/minimum page ILAD is >=`0.72/0.60`.
- Every brief has >=27 unique names across its 30 outputs; cross-seed overlap
  averages <=1/10 and never exceeds 3/10; normalized page sets do not repeat.
- Required concept-group coverage and the one-card-per-anchor cap hold on every
  page.
- Each output is edit-one from its recorded anchor, and that anchor's true-brief
  graph score beats nine deterministic wrong briefs in >=70% of comparisons.
- Review/BigTech collision, prompt/root/anchor identity, and lexical-hazard
  counts are zero. Surface proxy is `single_respell`, never assembled/template.
- Same-process replay and two fresh processes reproduce candidates, rejection
  counters, and ordered pages byte-for-byte.

Failure of any development gate closes this architecture before held-out,
shadowing, or human testing. Passing mechanical gates still does not establish
that the names are better.
