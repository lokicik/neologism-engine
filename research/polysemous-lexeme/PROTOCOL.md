# Phase 306: precision-first polysemous lexeme retrieval

Date frozen: 2026-08-24

This is an isolated non-LLM candidate-ontology experiment. It changes neither
production `generate()`, Auto, WASM, web types, storage, taste, nor public
results. It is motivated prospectively by Phase 305's frozen human failure:
surface resemblance did not make arbitrary whole-form syllables intentional.

## Frozen question and distinction

Can a brief-linked lexical graph retrieve a small supply of meaningful,
polysemous English words whose secondary senses provide metaphorical naming
room, without generating or assembling a spelling?

Earlier WordNet real-word probes tried to fill ten-card pages and ranked mainly
by graph distance and frequency. Phase 306 is precision-first: it asks for
three candidates, requires both curated name-worthiness and multiple WordNet
sense domains, and stops at data capacity before selection or human exposure.
It does not respell, append, blend, mutate, or sample characters.

## Frozen sources

- ConceptNet Phase 298 keyword anchors SHA-256:
  `ff207ad1570356b1a820726dc6c6dc980826425bd40e440ce4dac0d0f4788e55`,
  a separately attributed CC BY-SA 4.0 derived artifact.
- WordNet 3.0 ZIP SHA-256:
  `cbda5ea6eef7f36a97a43d4a75f85e07fccbb4f23657d27b4ccbc93e2646ab59`;
  the Princeton license remains inside the local ZIP.
- Canonical brief / extracted-keyword map SHA-256:
  `1f959c015efb9d49b1219b966f3ee464592fa62949c4b8804ce1f2fe2f692a6d`.
- Curated production real-word inventory SHA-256:
  `eb72a10fd598de010bae23878523963c8250c550c534c2ac61ec01943c76e59a`.
- BigTech / review-name collision inventories SHA-256:
  `bd2871db2af486a0915db0a7c983e80006c5335c38fc2227307fd08442ecd16c` /
  `87c45e7373ed2715774eea2f22ec28c975cea8139abd3ee513150762a373e09e`.
- Network access is forbidden. Use the existing FNV-sorted 24 development / 11
  sealed canonical split. The sealed partition cannot be inspected until the
  complete development preflight and selection pass unchanged.

## Frozen lexeme ontology

- Parse WordNet `data.noun`, `data.verb`, `data.adj`, and `data.adv` directly.
  A sense is one synset occurrence; a sense domain is WordNet's lexicographer
  file number from the source row.
- A candidate must be lowercase ASCII `[a-z]{5,10}`, occur verbatim in
  `realwords.txt`, and have at least two WordNet synsets across at least two
  distinct lexicographer files. Underscores, morphology, case folding,
  transliteration, and exception expansion are forbidden.
- The candidate must occur in a frozen ConceptNet anchor list for at least one
  extracted brief keyword. It is semantically eligible only when its maximum
  anchor score is at least `1.0` and either it has a depth-one edge or appears
  under at least two independent brief keywords.
- Reject exact extracted keywords. Reject exact/edit-one BigTech or review-name
  collisions. The curated real-word inventory is eligibility evidence and is
  therefore not itself a collision inventory.
- For each candidate record all source keywords, maximum score, minimum depth,
  WordNet synset count, and distinct lexicographer-file count. No candidate or
  source trace may be silently repaired.

## Frozen data-capacity preflight

Before computing a selected page, require on all 24 development briefs:

- at least twelve distinct eligible lexemes per brief;
- at least two source keywords with an eligible lexeme when the brief has two
  or more extracted keywords;
- at least 80% of eligible lexemes have a concrete or image-bearing WordNet
  domain among noun artifact, animal, body, event, food, location, object,
  phenomenon, plant, possession, shape, substance, or time;
- zero exact/edit-one cross-brief duplicate-family leakage is not required,
  because this phase retrieves a shared literal lexicon; instead, no lexeme may
  appear on more than eight development briefs;
- two clean executions reproduce the full eligible inventory, exclusions,
  report, and manifest byte-for-byte.

Any failure closes Phase 306 before ranking. Do not lower twelve to the observed
minimum, add common-word vocabulary, or admit single-sense terms after seeing
counts.

## Frozen selection if data passes

For each development brief, sort eligible lexemes by:

1. descending number of independent source keywords, capped at three;
2. descending maximum ConceptNet score;
3. depth one before depth two;
4. descending distinct WordNet lexicographer-file count, capped at four;
5. descending WordNet synset count, capped at eight;
6. absolute length distance from seven;
7. lowercase lexical order.

Select three while capping one declared primary source keyword at two cards.
Use a second source when it has an eligible candidate. No seed or stochastic
tie-break participates.

Development selection must produce 3/3 on all 24 briefs, keep zero collision
or prompt-copy violations, and make each selected word's recorded true-brief
support beat nine deterministic wrong briefs in at least 70% of comparisons.
Two fresh selections must be byte-identical. Passing opens the unchanged sealed
data and selection run, not production.

## Human boundary

Even a sealed pass proves only meaningful lexical retrieval. Before any shadow
proposal, freeze a small single-name absolute study comparing these lexemes
with context-matched production candidates. Phase 305 labels, accepted-name
identities, and famous anchor spellings are forbidden ranking inputs. A human
failure records a negative checkpoint; no literal-word lane enters production
without direct preference evidence.
