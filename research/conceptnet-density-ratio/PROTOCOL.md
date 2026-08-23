# Phase 301: ConceptNet contrastive density-ratio selector

Date frozen: 2026-08-23

This is an isolated non-LLM semantic-selector preflight over immutable Phase
300 development pools. It does not generate a new candidate, inspect sealed
briefs, or change production.

## Frozen question and inputs

Can subtracting ubiquitous ConceptNet-anchor spelling expose genuinely brief-
specific form pressure that raw semantic likelihood hid?

- Phase 300 development report SHA-256:
  `8140a0b00f83e3cc3607fa7b4fe097ad61d790a46fe6c9d3ab14a05e97e4bde0`.
  Its 72 pools of 160 candidates are the complete immutable proposal source.
- Phase 298 compressed anchor SHA-256:
  `ff207ad1570356b1a820726dc6c6dc980826425bd40e440ce4dac0d0f4788e55`,
  retained as separately attributed CC BY-SA 4.0 derived data.
- No wrong-brief likelihood, selected Phase 300 page, sealed item, human choice,
  name identity coefficient, external model, or network response participates
  in fitting or selection.

## Frozen energy and selector

- Fit one add-`0.1` order-three background character model over every keyword's
  anchors. Within each keyword, an anchor weight is its positive score divided
  by that keyword's maximum; duplicate terms from different keywords contribute
  repeatedly. Alphabet and BOS/EOS handling match Phase 300.
- For candidate `x`, define `density_lift(x) = own_semantic_logp(x) -
  background_anchor_logp(x)`. `own_semantic_logp` is the frozen maximum over
  its true brief's keyword models already recorded before this phase.
- A selector-eligible candidate must have strictly positive density lift. This
  is the declared contrastive mechanism, not a post-selection diagnostic.
- Within each fixed page pool, relevance is `0.60 * quality + 0.20 * normalized
  global_product_logp + 0.20 * normalized density_lift`. Quality is composite
  divided by 100; constant min-max features map to zero.
- Greedy normalized-edit-distance MMR uses lambda `0.70`; lowercase spelling
  breaks ties. Eligible source-lane caps remain 4/5/10 for three-plus/two/one
  lanes. Select ten or stop if no eligible capped candidate remains.

## Frozen gates

Development repeats the Phase 300 page gates on the new selections:

- all 72 pages are 10/10 and every source pool remains exactly 160;
- minimum/average composite `>=75 / >=84.0`; mean/minimum ILAD
  `>=0.72 / >=0.60`;
- at least 27 unique names per brief across three seeds; mean/maximum overlap
  `<=1 / <=3`; duplicate page sets zero;
- selected own semantic logp beats the recorded nine-wrong maximum on at least
  70% of cards;
- every selected density lift is positive; every page uses two source lanes
  when two are eligible and all lane caps hold;
- template tails at most 20%; Phase 300's zero selected anchor-copy, hazard,
  collision, and form-floor properties remain true by subset construction;
- two clean executions reproduce report and manifest byte-for-byte.

Failure closes this selector without changing its energy or thresholds. Passing
would open a separately frozen sealed-source generation and selection run with
the unchanged Phase 300 proposal sampler; it would not authorize product
integration or a better-name claim without blind human evidence.
