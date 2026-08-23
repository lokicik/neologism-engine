# Real collection descriptive audit protocol

Date frozen: 2026-08-24

The completed collection failed the prospectively frozen Phase 290 input gate:
13/24 concealed repeats were consistent and only 73 primary decisions were
decisive. Therefore no Bradley-Terry model may be fit from this export.

This post-outcome audit is descriptive only. It may explain the observed broad
dissatisfaction and motivate a separately prospective experiment, but it is
not predictive evidence, a repaired collection gate, or production authority.

## Frozen inputs

- Collection SHA-256:
  `031f4d75a416dedfd853116b4bca1833e384422e3691a0403f2431d5d6628f25`.
- Frozen source file SHA-256:
  `debb789365ca2b2eff334662e5325c00a5a9ea32cda9b5f3d6e433b83676803e`.
- Frozen collector protocol file SHA-256:
  `ee0c8d96484740c1d332abb5cbc249925b2ed2c1cc4ff3d9fcf113fc19428bb0`.
- Source and protocol canonical payload hashes must match the declarations in
  the collection before any descriptive output is written.

## Frozen audit

- Reconstruct all 150 primary and 24 side-reversed repeat tasks with the
  existing frozen `build_tasks` implementation. Require exact ordered task IDs
  and allowed choices.
- Recompute primary and repeat choice counts, decisive counts by partition,
  and normalized-name repeat consistency.
- Classify inconsistent repeats as decisive-to-neither, neither-to-decisive, or
  opposite-name. Do not reinterpret them as training labels.
- Report per-brief primary `neither` counts; source-mode pair exposure,
  decisiveness, and neither rate; chosen source modes among decisive primaries;
  and construction exposure/chosen counts.
- For decisive primaries only, report mean chosen-minus-unchosen differences
  for the three existing scores, composite, length, syllables, and concept
  coverage. These are descriptive correlations and receive no p-value or
  causal interpretation.
- Report how often a decisive choice selected the higher composite and higher
  pronounceability candidate, retaining ties as ties.
- Write canonical JSON and reproduce it byte-for-byte in two clean executions.

No minimum, feature selection, coefficient, classifier, or reranking rule may
be derived inside this audit. Any follow-up rejector or absolute-utility model
requires a new protocol frozen after this audit and must retain an untouched
human evaluation boundary.
