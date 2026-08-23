# ConceptNet density-ratio selector: Phase 301 negative checkpoint

Date: 2026-08-23

## Decision

Phase 301 stops on development. Subtracting an all-anchor background improves
brief discrimination over Phase 300's raw semantic likelihood, but the effect
remains far below the frozen 70% own-vs-nine-wrong gate. No sealed source,
production shadow, or human preference stage opened.

No eligibility rule, background weighting, relevance blend, MMR setting, lane
cap, or threshold changed after the first result. Two clean executions
reproduced report and manifest byte-for-byte.

## Frozen identity and reproduction

- Protocol commit: `02864f4`.
- Implementation commit: `90d087b`.
- Protocol SHA-256:
  `17b36d77221d490b7d0b082a224c2cf72ae2adc6735c4b9a60a320467cc820a6`.
- Evaluator SHA-256:
  `3c6b1ed3b374e1d104a843986c86804dbe5df170fdbbabe989cb30aac97e4fd7`.
- Frozen Phase 300 source report SHA-256:
  `8140a0b00f83e3cc3607fa7b4fe097ad61d790a46fe6c9d3ab14a05e97e4bde0`.
- Reproduced Phase 301 report SHA-256:
  `2602585beb8b54d3d5b04bf2b0833fa9f44a7a885417f5063ba1c6d2aa40c966`.
- Reproduced manifest SHA-256:
  `320a3b2fe9d4d6ace801a54c074d1b34f8b9d8f847369afe1f0b55925adef9df`.

## Development result

- Positive density-lift pool mean/minimum: `72.694 / 51` from each fixed
  160-candidate source pool.
- Pages/cards: 72/72 at 10 / 720.
- Own-vs-nine-wrong rate: **37.361%**, improved from Phase 300's 29.444% but
  below the required 70%.
- Minimum/average quality: `75 / 88.0917`.
- Mean/minimum ILAD: `0.929773 / 0.892813`.
- Per-brief unique minimum: 30/30; mean/max overlap and duplicate pages: zero.
- Template-tail rate: `5.139%`.
- Positive-lift, lane coverage/caps, source hard-filter inheritance, quality,
  diversity, collision, and surface gates all pass.

## Interpretation and boundary

The uplift confirms the diagnosis that raw anchor likelihood contains a large
common-English spelling component. A single pooled background removes some of
it, but it does not identify which source keyword a spelling came from. Forms
such as `Sbelemc`, `Muzult`, `Pyurvo`, and `Wiwmm` can receive positive global
lift without carrying a stable product concept.

Do not select directly on the recorded nine-wrong margin; that would optimize
the evaluation set and make the 70% gate circular. A distinct, prospectively
declared final automatic semantic preflight may use source-keyword provenance
and all 111 keyword models as a multiclass density ratio, without consulting
the nine wrong briefs. If that representation still fails, the evidence-backed
non-LLM path is human same-brief preference learning rather than another
unsupervised generator variant.
