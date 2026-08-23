# Phase 303 development preflight pass

Date: 2026-08-23

## Decision

The multiclass-guided rejection sampler passes every frozen development gate
and may proceed to the separately frozen sealed partition. This is evidence of
capacity, deterministic generation, and technical conditioning only. It is not
evidence that the names are aesthetically better and opens no production path.

No weight, threshold, top-1 rule, attempt budget, selection setting, or gate
changed after the first result. Two fresh clean-core release executions
reproduced report and manifest byte-for-byte.

## Frozen identity and reproduction

- Protocol commit: `bb571ec`.
- Implementation commit: `53a2cdd`.
- Protocol SHA-256:
  `e4f8843700bd51e248436c32e74b1e0aecaf612288a40a6f55d8a31e8d999457`.
- Materializer SHA-256:
  `4f7d43c8684d038ebcb31721e5b09cad1f2dfedf5d67fac99de8fce0f476bf51`.
- Runner SHA-256:
  `c298ad8bc142c9e102b304bd550f3123a927985e050cd39160d7f42ebc99a925`.
- Reproduced report SHA-256:
  `fb0e2d53a05210ed314323e31adf2f81fa9d3ab84077eeb059d9eddb46b247a5`.
- Reproduced manifest SHA-256:
  `ae66f2ea1160271758c99268e86e2169e9db58b75117b0e017c8d01367f0c69d`.

## Development result

- Pools/pages/cards: `72/72` at `160/10`, `720` selected cards.
- Attempt mean/maximum: `18,255.10 / 35,285`, within the frozen 40,000 cap.
- Strict multiclass rejections: `286,352`.
- Own-vs-nine-wrong rate: **98.3333%**.
- Minimum/average quality: `75 / 88.1083`.
- Mean/minimum ILAD: `0.912413 / 0.869665`.
- Minimum per-brief unique names: `29/30`.
- Mean/maximum cross-seed overlap: `0.0556 / 1`; duplicate page sets: zero.
- Template tails: `56/720 = 7.7778%`.
- All source margins are positive; inherited form-floor, anchor-copy, lexical
  hazard, and review collision gates pass.

## Interpretation boundary

Moving the strict 111-way classifier from a post-hoc filter into the sampling
loop resolves Phase 302's capacity failure without weakening semantic
eligibility. It does so at substantial compute cost and still emits forms such
as `Datudy`, `Snobal`, and `Futtook`. Automatic scores cannot establish whether
those are desirable names. Sealed mechanics must pass next, followed by a
production shadow and blind human preference evidence before any claim or
integration can be considered.
