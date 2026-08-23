# Root-group-conditioned WordNet real-word probe

This is an isolated, non-LLM generator-family preflight. Nothing here is
imported by production `generate()`, WASM, web Auto, storage, taste, or a public
type.

## Frozen question

Can the engine's existing transparent `brand_root_groups` bridge product jargon
into WordNet 3.0 well enough to select brief-conditioned, single-piece evocative
real words without suffix/metaphor assembly?

This is a new input contract, not a relaxation of Phase 276. Phase 276 proved
that exact extracted keywords alone do not give every development brief enough
graph coverage.

## Frozen sources and boundary

- WordNet 3.0 ZIP SHA-256:
  `cbda5ea6eef7f36a97a43d4a75f85e07fccbb4f23657d27b4ccbc93e2646ab59`
- Local input: `C:\Users\LOKMAN\nltk_data\corpora\wordnet.zip`
- Canonical briefs: `research/holistic/canonical_briefs.json`
- Review names: the frozen Phase-268
  `research/holistic/work/dataset/review-names.txt` artifact.
- Network access, NLTK, learned embeddings, model training, and product/name
  supervision are forbidden.
- A research-only Rust helper must call production `extract_keywords` and
  `brand_root_groups`; Python may not reimplement either function.

## Frozen graph and candidate rules

- Flatten the ordered `brand_root_groups(keywords, 16)` output into declared
  graph seeds while retaining group and seed provenance.
- Resolve a seed through exact WordNet lemmas or WordNet's own exception files.
  No additional stemming, transliteration, or post-result vocabulary repair is
  allowed.
- Traverse synonyms plus hypernym, hyponym, instance, similar-to, and
  derivational pointers to at most two graph edges. Antonyms are forbidden.
- Candidate lemmas must be single-token lowercase `[a-z]{4,12}` entries, occur
  in `common_words.txt` or `realwords.txt`, and have a WordNet SemCor count of at
  least one unless explicitly curated in `realwords.txt`.
- Reject exact prompt keywords, every graph seed, and entries in production
  `roots.txt`. Reject exact/edit-one collisions against Phase-268 review names
  and `bigtech.txt`. Generic dictionaries are eligibility inventories, not
  collision inventories; otherwise every real-word candidate would be rejected
  by definition.
- Rank first by shortest graph distance, then number of independent graph
  seeds, then bounded `log2(1 + SemCor count)`, then lexical order. Retain at
  most 300 candidates per brief. These signals are mechanistic relevance only,
  not evidence of beauty.

## Development and sealed split

Sort the frozen 35 briefs by FNV-1a 64-bit hash of their UTF-8 bytes. The first
24 are development; the remaining 11 are sealed held-out. The split and all
thresholds below are inherited from Phase 276. Held-out may run only if every
development gate passes without editing this protocol.

## Frozen gates

- Every development brief has at least one WordNet-supported root-group seed
  and at least 40 candidates after all lexical and collision filters.
- All 24 development briefs x seeds `13/67/313` produce 10/10 pages. If opened,
  all 11 held-out briefs x three seeds must also do so.
- Every card passes existing BigTech phonotactic and sonority checks, has one to
  three syllables and composite quality >=75; each partition averages >=84.0.
- Mean/minimum page ILAD is >=`0.72/0.60`.
- Every brief has >=27 unique names across its 30 outputs; cross-seed overlap
  averages <=1/10 and never exceeds 3/10; normalized page sets do not repeat.
- Each page uses at least two distinct graph seeds when at least two are
  supported, and no seed supplies more than four cards.
- A selected name's true-brief graph score beats nine deterministic wrong
  briefs in >=70% of comparisons. This is a conditioning diagnostic only.
- Selected exact/edit-one review or BigTech collisions, exact prompt keywords,
  exact graph seeds, production-root matches, and lexical hazards are all zero.
- Every selected item reports surface shape `realword`; known suffix/metaphor
  assembly is zero by construction.
- Same-process replay and two fresh processes reproduce candidates, rejection
  counters, and ordered pages byte-for-byte.

Failure of any development gate closes this architecture before held-out,
production shadowing, or human preference work. Passing both partitions opens
only a later quality-neutral shadow hybrid; it does not authorize integration
or a claim that names are better.
