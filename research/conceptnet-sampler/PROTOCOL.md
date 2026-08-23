# Phase 300: ConceptNet-conditioned stochastic whole-form sampler

Date frozen: 2026-08-23

This is an isolated non-LLM generator experiment. It changes neither production
`generate()` nor WASM, Auto, web types, storage, or taste.

## Frozen question and distinction

Can weighted ConceptNet semantic experts supply the brief signal that Phase
292's tiny root-group experts lacked, while stochastic whole-form sampling
avoids Phase 299's collapse into known lexical modes?

Phase 299 proved that maximum-score beam inference is incompatible with the
novel-name collision boundary: 110,592 paths yielded zero eligible candidates.
Phase 300 does not widen or retune that beam. It returns to seeded ancestral
sampling, an inference family that Phase 292 demonstrated can fill novel pools,
but retains the new graph-derived semantic representation validated in Phase
298. No suffix, literal-anchor selector, respell, crossover, neural model, or
runtime network participates.

## Frozen inputs and model

- Clean committed core:
  `ccdb67b49ae053f10ed7bdd4ee683d622d2c50b7`; uncommitted user core files are
  excluded.
- Phase 298 anchors SHA-256:
  `ff207ad1570356b1a820726dc6c6dc980826425bd40e440ce4dac0d0f4788e55`,
  retained as separately attributed CC BY-SA 4.0 derived data.
- Product dataset / canonical briefs / review index SHA-256:
  `dd4b7b977ea62aea570f7ec5b9941ca06174fd7cbb882a39ffbd2183f488d9d6` /
  `4b5163775bc97c7feeae85e6894d7a4160eb66333de8a2fca4d5fa898ee01caa` /
  `87c45e7373ed2715774eea2f22ec28c975cea8139abd3ee513150762a373e09e`.
- The global add-`0.1` order-three character model uses the 10,138 train-product
  names. The 1,260 validation names set the unchanged lower-decile form floor.
  Dataset test names are unused.
- One weighted add-`0.1` semantic character model is fitted per extracted
  production keyword using all Phase 298 anchors. Observation weight is
  positive anchor score divided by that keyword's maximum score.

## Frozen sampling and filtering

- Seeds: `13`, `67`, `313`. RNG is ChaCha8 seeded by seed XOR FNV-1a brief
  hash. Source keyword lane is round-robin by attempt.
- At every character use
  `0.75 * log P_global + 0.25 * log P_keyword`, then temperature `0.85` and
  sample across all `a-z + EOS`. EOS is masked before length four and forced at
  length twelve.
- Maximum 40,000 attempts; collect 160 unique candidates and select ten.
- Reject a spelling containing any complete source anchor of four or more
  letters. Retain the Phase 299/292 BigTech phonotactic, sonority,
  one-to-three-syllable, validation form-floor, quality `>=75`, lexical-hazard,
  and exact/edit-one review/dictionary collision filters.
- Selection remains `0.65 quality + 0.20 normalized global logp + 0.15
  normalized own semantic logp`, greedy edit-distance MMR lambda `0.70`, and
  lexical tie-break. Eligible lane caps are 4/5/10 for three-plus/two/one lane.
- Wrong briefs never guide generation or selection. Condition contrast uses
  maximum own-keyword logp versus maximum logp under nine cyclic FNV-ordered
  wrong briefs.

## Development, sealed split, and gates

FNV-sort the 35 briefs; first 24 are development and last 11 sealed. Development
must pass before sealed execution:

- every one of 72 pools/pages is `160/10`;
- minimum/average composite `>=75 / >=84.0` and mean/minimum ILAD
  `>=0.72 / >=0.60`;
- at least 27 unique names per brief across 30 outputs; mean/maximum cross-seed
  overlap `<=1/10 / <=3/10`; no duplicate page set;
- own semantic likelihood beats all nine wrong briefs for at least 70% of
  selected cards;
- every page uses two keyword lanes when two are eligible and all lane caps
  hold;
- template tails at most 20%; complete source-anchor copies, hazards, and
  exact/edit-one collisions zero; every selected form meets the form floor;
- same-process replay and two clean release executions reproduce all traces,
  pools, pages, report, and manifest byte-for-byte.

Sealed held-out repeats every gate unchanged. Passing both partitions opens
only a separately frozen production shadow hybrid. It still cannot support a
better-name or integration claim without context-disjoint blind full-page human
preference evidence.
