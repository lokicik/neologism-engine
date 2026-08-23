# Articulatory syllable WFST probe

This is an isolated, LLM-free generator-family experiment. Nothing here is
imported by production `generate()`, WASM, Auto, web types, storage, or taste.

## Frozen question

Can a train-only weighted syllable finite-state generator create whole
spellings that remain corpus-plausible and visibly non-assembled while a
transparent articulatory target preserves brief-specific signal?

The experiment follows the failed phonetic-crossover checkpoint by changing
the representation, not its mutation weights. It generates an entire spelling
as one path through onset, nucleus, and coda states. It never appends a
production suffix or metaphor and never copies a source root as a unit.

## Frozen data boundary

- Source dataset SHA-256:
  `dd4b7b977ea62aea570f7ec5b9941ca06174fd7cbb882a39ffbd2183f488d9d6`.
- The corpus builder reads the checked-in/ignored deterministic holistic
  dataset with no network access. Only `split=train` names estimate state and
  transition weights. Validation names set a lower-decile plausibility floor;
  test labels never tune or train the generator.
- The complete Phase-268 review inventory, BigTech, roots, and dictionary
  inventories remain collision controls, not positive training labels.
- Canonical briefs: `research/holistic/canonical_briefs.json`. Sort by FNV-1a
  64-bit hash; first 24 are development and remaining 11 are sealed held-out.

## Frozen mechanism

- Deterministically segment each train name into one to three onset/nucleus/coda
  syllables using maximal legal onset splitting. Count syllable-position,
  onset, nucleus, coda, and adjacent-boundary transitions with add-one
  smoothing.
- Convert production `extract_keywords` plus `brand_root_groups` output into a
  position-aware articulatory target: plosive, fricative, nasal, liquid,
  glide, front/open/back vowel, voicing, sibilance, and letter-position mass.
- For each brief/seed, sample at most 40,000 finite-state paths using corpus
  weights multiplied by the frozen articulatory affinity. Keep 120 unique
  collision-clean candidates, then select ten with Pareto ordering and MMR.
- Length is 4-12 ASCII letters and one to three syllables. Production BigTech
  phonotactics, sonority, score functions, lexical hazards, and exact/edit-one
  collision checks apply unchanged.
- Corpus plausibility must meet the validation lower-decile floor. Every trace
  records its syllable path, base log probability, target affinity, composite,
  source-group target, and origin `articulatory_wfst`.

## Frozen gates

- Development: 24 briefs x seeds `13/67/313`; every pool is 120/120 and every
  page 10/10. Held-out may open only after every development gate passes.
- Every card has composite quality >=75 and each partition averages >=84.0.
- Mean/minimum page ILAD >=`0.72/0.60`.
- Every brief has >=27 unique names across 30 outputs; cross-seed overlap
  averages <=1/10 and never exceeds 3/10; no normalized page sets repeat.
- Every selected path meets the frozen validation plausibility floor.
- A selected name's target affinity for its own source groups beats nine
  deterministic wrong-brief targets in >=70% of comparisons. This is a
  mechanism diagnostic, not proof of perceived meaning.
- Known Phase-141 suffix/metaphor tails occur in at most 20% of selected names;
  unchanged source roots of four or more letters occur in at most 25%.
- Exact/edit-one review collisions and lexical hazards are zero.
- Same-process replay and two fresh release processes reproduce corpus
  identity, floor, pools, rejection counters, paths, and ordered pages
  byte-for-byte.

Any development failure closes this mechanism before held-out, shadow hybrid,
or human preference work. Passing automatic gates still cannot establish that
the names are aesthetically better.
