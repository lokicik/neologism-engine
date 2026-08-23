# Phase 299: ConceptNet semantic-lattice product beam

Date frozen: 2026-08-23

This is an isolated non-LLM whole-form generator experiment. It is not imported
by production `generate()`, WASM, Auto, web types, storage, or taste.

## Frozen question and distinction

Can the validated ConceptNet semantic anchor graph steer a train-product form
automaton through weighted beam search strongly enough to create complete,
brief-specific spellings without copying anchors or assembling a root plus a
known tail?

Phase 292 sampled a product of a global product model and tiny hand-authored
root-group models; conditioning was 42.22%. Phase 299 changes both the semantic
representation and inference: each production keyword receives a weighted
model from 105–200 graph-derived anchors, and deterministic beam search finds
joint high-scoring whole paths. It does not append, respell, cross over, select
literal graph words, or use a neural model.

## Frozen inputs and isolation

- Execute against committed core
  `ccdb67b49ae053f10ed7bdd4ee683d622d2c50b7` in a generated clean archive.
  Committed core/WASM/Cargo content is unchanged between that commit and the
  Phase 298 pass; current uncommitted user core files are excluded.
- Phase 298 keyword-anchor artifact SHA-256:
  `ff207ad1570356b1a820726dc6c6dc980826425bd40e440ce4dac0d0f4788e55`.
  It remains a separate CC BY-SA 4.0 derived data artifact with the ConceptNet
  attribution. Only its term, score, depth, and keyword fields are used.
- Product dataset SHA-256:
  `dd4b7b977ea62aea570f7ec5b9941ca06174fd7cbb882a39ffbd2183f488d9d6`.
  Only the frozen 10,138 train names fit the global model; 1,260 validation
  names set the lower-decile global-form floor; dataset test names are unused.
- Canonical briefs / review index SHA-256:
  `4b5163775bc97c7feeae85e6894d7a4160eb66333de8a2fca4d5fa898ee01caa` /
  `87c45e7373ed2715774eea2f22ec28c975cea8139abd3ee513150762a373e09e`.
  Sort briefs by FNV-1a 64-bit; first 24 are development and last 11 sealed.
- Normal execution is offline. A clean runner derives the exact train and
  validation corpora, expands the deterministic anchor gzip to a temporary
  plain JSONL file, and builds a temporary Rust example.

## Frozen model and search

- The global and semantic experts are add-`0.1` order-three character models
  over `a-z + EOS` with two BOS symbols.
- For each extracted production keyword, fit one semantic expert to all of its
  Phase 298 anchors. An anchor's observation weight is its positive ConceptNet
  score divided by the maximum score for that keyword. No manual root groups or
  relation-specific retuning participate.
- A beam path score adds `0.80 * log P_global + 0.20 * log P_semantic` per
  transition. Beam width is 1,024. EOS is masked before length four and forced
  after length twelve. Retain at most 512 completed paths per keyword lane.
- Seeds `13`, `67`, and `313` affect only a deterministic transition jitter:
  map FNV-1a of `seed|prefix|symbol` to `[0,1]`, subtract `0.5`, and multiply by
  `0.03`. This bounded term is included in beam ordering but not reported as
  semantic likelihood.
- A candidate is rejected if it contains any complete source anchor of four or
  more letters. Existing BigTech phonotactics, sonority, one-to-three syllable,
  composite quality `>=75`, lexical hazard, validation form-floor, and
  exact/edit-one review/dictionary collision controls remain hard filters.

## Frozen pool and selection

- Collect at most 160 distinct candidates per brief/seed from all keyword lanes
  in round-robin beam rank order; maximum raw completed paths inspected is
  40,000.
- Candidate relevance is `0.65 * quality + 0.20 * normalized global logp +
  0.15 * normalized own-brief semantic logp`. Greedy edit-distance MMR uses
  lambda `0.70`; lexical spelling breaks ties.
- One keyword lane may occupy at most four page slots when at least three lanes
  have eligible candidates, five slots with two lanes, and ten with one lane.
- Wrong briefs never guide generation or selection. Diagnostics compare the
  maximum own-keyword semantic logp against the maximum semantic logp from nine
  cyclic FNV-ordered wrong briefs.

## Frozen gates

Development must pass all gates before sealed held-out may run:

- 24 briefs x three seeds: every pool `160/160`, every page `10/10`.
- Minimum/average composite `>=75 / >=84.0`; mean/minimum page ILAD
  `>=0.72 / >=0.60`.
- Every brief has at least 27 unique spellings across 30 outputs; mean/maximum
  cross-seed overlap `<=1/10 / <=3/10`; no duplicate normalized page set.
- Own semantic likelihood beats all nine wrong-brief targets for at least 70%
  of selected cards.
- Every page uses at least two keyword lanes when at least two lanes have
  eligible pool members; the declared lane cap always holds.
- Known Phase-141 suffix/metaphor tails are at most 20%; complete four-plus
  source-anchor copies, lexical hazards, and exact/edit-one collisions are zero.
- All selected names meet the frozen form floor. Same-process replay and two
  fresh release runs reproduce rejections, pools, traces, pages, report, and
  manifest byte-for-byte.

Sealed held-out repeats the gates unchanged. Passing both partitions would
open only a separately frozen production shadow hybrid. Better-name or
production claims still require context-disjoint blind full-page human
preference evidence.
