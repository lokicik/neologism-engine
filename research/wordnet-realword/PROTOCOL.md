# WordNet-conditioned evocative real-word probe

This is an isolated, non-LLM generator-family preflight. Nothing here is
imported by production `generate()`, WASM, web Auto, storage, taste, or a public
type.

## Frozen question

Can an explicit lexical-semantic graph turn the existing prompt-independent
Real words lane into brief-conditioned, single-piece naming candidates without
the suffix/metaphor construction wall?

WordNet is a lexical database whose synonym sets are linked by declared
semantic and lexical relations. This probe uses those relations directly; it
does not train a language model or infer meaning from product/name pairs.

## Frozen source

- WordNet 3.0 ZIP SHA-256:
  `cbda5ea6eef7f36a97a43d4a75f85e07fccbb4f23657d27b4ccbc93e2646ab59`
- Local input: `C:\Users\LOKMAN\nltk_data\corpora\wordnet.zip`
- License: Princeton WordNet 3.0 license, preserved inside the ZIP. The source
  permits use, copying, modification, and distribution subject to its notice.
- Network access: none. A successful follow-up may vendor a reviewed derived
  index with attribution; a failed probe must not copy the 10.8 MB source into
  the repository.

## Frozen graph and candidate rules

- Use synonyms in the same synset plus only hypernym, hyponym, instance,
  similar-to, and derivational pointers. Do not traverse antonyms.
- Search at most two graph edges from each production `extract_keywords`
  result. Morphological exceptions from the WordNet ZIP may recover a base
  lemma; no stemming or transliteration beyond those declared exceptions.
- Candidate lemmas must be single-token lowercase `[a-z]{4,12}` entries and
  must either have at least one WordNet semantic-concordance occurrence or be
  in the existing curated `realwords.txt` inventory.
- Candidate lemmas must also occur in the existing `common_words.txt` or
  `realwords.txt` vocabulary. Reject the exact prompt keywords, production
  semantic roots, BigTech brands, dictionaries, and the full Phase-268 review
  index at exact/edit-one distance.
- Keep at most 300 graph-ranked candidates per brief. WordNet distance is the
  primary semantic score; corpus frequency is a bounded tie-break, never an
  aesthetic truth.
- Rust reuses the existing BigTech phonotactic, sonority, syllable, quality,
  ILAD, and collision checks. Selection is deterministic for seeds 13/67/313,
  caps one source keyword at four cards, and uses only a small seeded tie-break
  among otherwise eligible candidates.

## Development and sealed split

Sort the frozen 35 canonical briefs by FNV-1a 64-bit hash of their UTF-8 bytes.
The first 24 are development; the remaining 11 are sealed held-out. Implement
and inspect development only. Held-out may run only if every development gate
passes without changing this protocol or its thresholds.

## Frozen gates

- Every brief has at least one WordNet-supported production keyword and at
  least 40 eligible post-filter candidates.
- All 24 development briefs x 3 seeds produce 10/10 pages. If opened, all 11
  held-out briefs x 3 seeds must do the same.
- Every card has composite quality >=75 and each partition averages >=84.0.
- Mean/minimum page ILAD is >=`0.72/0.60`.
- Every brief has >=27 unique names across its 30 selected outputs; cross-seed
  overlap averages <=1/10 and never exceeds 3/10; normalized page sets do not
  repeat.
- Each page represents at least two distinct supported source keywords when
  the brief has two or more; no source keyword occupies more than four cards.
- A selected name's true-brief WordNet score beats nine deterministic wrong
  briefs in >=70% of comparisons. This proves graph conditioning only, not
  human-perceived relevance or beauty.
- Selected exact/edit-one review collisions, exact prompt keywords, and exact
  production semantic roots are all zero.
- Every selected item is a WordNet real word and therefore reports surface
  shape `realword`; known suffix/metaphor assembly is zero by construction.
- Same-process replay and two fresh processes reproduce candidate identity,
  rejection counters, and ordered pages byte-for-byte.

Failure of any development gate closes the architecture before held-out,
production shadowing, or human preference work. Passing both partitions opens
only a later quality-neutral shadow hybrid; it does not authorize integration
or a claim that names are better.
