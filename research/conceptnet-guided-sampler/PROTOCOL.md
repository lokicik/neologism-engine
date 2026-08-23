# Phase 303: multiclass-guided ConceptNet rejection sampler

Date frozen: 2026-08-23

This is an isolated non-LLM generator experiment. It changes neither product
`generate()` nor WASM, Auto, web types, storage, taste, or the blind preference
collector.

## Frozen question and distinction

Phase 302 found strong semantic discrimination among candidates whose declared
source keyword was strict top-1 among all 111 keyword models, but only 6.6528
such candidates per fixed 160-candidate pool on average. Can the unchanged
Phase 300 whole-form sampler use that strict multiclass condition as an online
rejection constraint and fill mechanically valid pages within the already
declared 40,000-attempt budget?

This is not a top-k relaxation, a rerank of the Phase 300 pool, or selection on
the frozen nine-wrong diagnostic. It generates additional seeded whole forms
and accepts only strict top-1 source-class survivors. The accepted condition is
identical to Phase 302.

## Frozen inputs and generation

- Clean committed core:
  `ccdb67b49ae053f10ed7bdd4ee683d622d2c50b7`; uncommitted user core files are
  excluded.
- Phase 300 probe and runner are immutable source dependencies. Their hashes
  are checked before the Phase 303 transformation is applied in a temporary
  clean workspace.
- Phase 298 anchors SHA-256:
  `ff207ad1570356b1a820726dc6c6dc980826425bd40e440ce4dac0d0f4788e55`.
- Product dataset / canonical briefs / review index SHA-256:
  `dd4b7b977ea62aea570f7ec5b9941ca06174fd7cbb882a39ffbd2183f488d9d6` /
  `4b5163775bc97c7feeae85e6894d7a4160eb66333de8a2fca4d5fa898ee01caa` /
  `87c45e7373ed2715774eea2f22ec28c975cea8139abd3ee513150762a373e09e`.
- Global and per-keyword add-`0.1` order-three character models, sampling
  weights `0.75/0.25`, temperature `0.85`, seeds `13/67/313`, lane rotation,
  ChaCha8 seeding, minimum/maximum length `4/12`, and all structural filters
  remain exactly Phase 300.
- Maximum attempts remain `40,000`; target pool/page remain `160/10`.

## Frozen multiclass acceptance and selection

- Score each hard-filtered candidate under all 111 keyword models.
- The candidate's declared generating source keyword must have strictly higher
  average character log likelihood than every other keyword model. Ties fail.
- Record `max_other_keyword_logp` and
  `source_margin = source_keyword_logp - max_other_keyword_logp`.
- This test occurs before a candidate enters the 160-name pool. Rejected names
  increment a separate `multiclass` counter.
- Selection is Phase 302's prospectively frozen blend:
  `0.60 * quality + 0.20 * normalized global logp + 0.20 * normalized
  source_margin`, edit-distance MMR lambda `0.70`, lexical tie-break, and lane
  caps `4/5/10` for three-plus/two/one eligible source lanes.
- The nine cyclic wrong briefs are diagnostic only and never influence
  generation, acceptance, or selection.

## Development and gates

FNV-sort the 35 canonical briefs; use only the first 24 development briefs and
three frozen seeds. Development must pass before any sealed execution:

- all 72 pools/pages are `160/10` within at most 40,000 attempts;
- every pool and selected source margin is strictly positive;
- minimum/average composite `>=75 / >=84.0` and mean/minimum ILAD
  `>=0.72 / >=0.60`;
- at least 27 unique selected names per brief; mean/maximum cross-seed overlap
  `<=1 / <=3`; duplicate page sets zero;
- recorded own-brief semantic logp beats all nine wrong briefs for at least 70%
  of selected cards;
- each page uses two source lanes when two are eligible and all lane caps hold;
- template tails at most 20%; complete source-anchor copies, lexical hazards,
  exact/edit-one review collisions, and form-floor failures among selected
  cards are zero by inherited hard-filter construction;
- same-process replay and two fresh release executions reproduce attempts,
  rejection counters, pools, pages, report, and manifest byte-for-byte.

Failure stops this architecture on development. Gates, model weights, attempt
budget, top-1 rule, or selection weights will not change after inspection.
Passing opens only a separately frozen sealed run. It does not establish that
names are better and cannot authorize production integration without retained
shadow and blind human full-page evidence.
