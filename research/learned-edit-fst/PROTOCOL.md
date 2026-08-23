# Train-only contextual edit transducer preflight

This is an isolated, non-LLM data and architecture preflight. Nothing here is
imported by production generation, WASM, web, storage, taste, or public types.

## Frozen question

Does the existing CC0 Wikidata **training split** contain enough independent,
dictionary-near software names to learn a small contextual single-edit
transducer instead of hand-authoring typo-like respelling rules?

The transducer learns spelling style only. WordNet root-group traversal remains
the proposed semantic-anchor source; no Wikidata description/name association
is used for semantic conditioning.

## Frozen inputs

- Grouped dataset:
  `research/holistic/work/dataset/dataset.jsonl.gz`
- Dataset SHA-256 from its manifest:
  `dd4b7b977ea62aea570f7ec5b9941ca06174fd7cbb882a39ffbd2183f488d9d6`
- Only records whose frozen split is `train` may contribute transformations.
  Validation and test labels are invisible during mining and remain collision
  inventory only.
- Anchor vocabulary is lowercase ASCII `[a-z]{4,12}` from
  `common_words.txt + realwords.txt`. An anchor needs WordNet SemCor count >=2
  unless it is explicitly curated in `realwords.txt`.
- The local WordNet 3.0 ZIP and Phase-268 review index identities remain those
  frozen in Phases 276–278. No network or learned language model is allowed.

## Frozen pairing and edit representation

- A training label must be lowercase ASCII `[a-z]{4,12}`, not itself an anchor
  word, and exactly one insertion, deletion, or substitution from an eligible
  anchor. No transposition, two-edit pair, stemming, or pronunciation inference
  is allowed.
- If several anchors are edit-one from a label, select exactly one by highest
  SemCor count, then curated-anchor preference, then lexical order. This is
  deterministic and declared before inspection.
- Record an edit as operation and exact character change plus a three-way
  position bucket (`head` = first two positions, `tail` = last two positions,
  otherwise `interior`) and immediate left/right character classes
  (`boundary/vowel/consonant`).
- Support counts use distinct software labels and distinct frozen
  developer/owner group IDs, not duplicate aliases or repeated records.
- An eligible rule requires at least eight distinct labels and five distinct
  groups. Retain at most 64 rules ordered by group support, label support, then
  lexical rule identity.

## Frozen data sufficiency gates

- At least 200 uniquely paired training labels across at least 150 groups.
- At least eight eligible contextual rules.
- Eligible rules collectively cover at least 120 paired labels and 100 groups.
- No validation/test record contributes a pair or support count.
- Two fresh runs produce byte-identical rule inventory and report.

Failure stops before WordNet application, name selection, sealed brief
evaluation, or human testing. Passing proves only that a deterministic edit
inventory can be learned; it does not prove that applying it produces good
names.
