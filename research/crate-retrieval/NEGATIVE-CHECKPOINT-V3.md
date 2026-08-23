# Powered retrieval-conditioned model: Phase 295 negative checkpoint

Date: 2026-08-23

## Decision

Phase 295 stops on validation before sealed-test retrieval, scoring, generation,
or product shadowing. Classical description retrieval establishes strong
brief-specific conditioning, but the retrieved-name local character model does
not improve absolute name likelihood by the frozen 5% minimum.

No grid value, interpolation rule, effect threshold, or data split changed
after the result. No `test-report.json`, test retrieval, or test score artifact
exists.

## Frozen identity and reproduction

- Protocol SHA-256:
  `59ab3e066bfb79e61b6613886e4b6256c130c647cb7dfa6b950e9cd93c2c9ffd`.
- Model-detail freeze SHA-256:
  `fa8a40152879750b1f522ea5a25ecf9c9d00d16571b1893301ebdf67d02c73d3`.
- Evaluator SHA-256:
  `7b252441852f3e1c2199be096e2b23fcbbd3e314b3bf3760de0501ca93184afc`.
- Normalized records SHA-256:
  `daec41e23fbafa817c8fc3e3882d2dc0f45af5e50166e0a9cb85355a619f0d0f`.
- Two clean validation reports were byte-identical at SHA-256
  `107318061120f8bc37388d4929c665d8bc8cfef46e50a0e0875b19241cd7e271`.
- Both five-artifact manifests were byte-identical at SHA-256
  `6b0f06ee9ae13ee67abb176964df20cfcaad08f5ba9835027112cd8ee6680ffc`.

## Validation result

Validation-only selection chose `k=64`, `alpha=0.25` from the frozen nine-pair
grid.

| Gate | Required | Observed | Result |
|---|---:|---:|---|
| Full positive-neighbor coverage | >=95% | 99.544% | PASS |
| Real vs nine wrong descriptions | >=65% | 74.817% | PASS |
| Component-bootstrap 99% lower paired gain | >0 | +0.04368 NLL | PASS |
| Conditional NLL improvement | >=5% | **2.011%** | **FAIL** |

Global mean NLL was `2.601788`; conditional mean NLL was `2.549466`. Every
frozen configuration had positive mean improvement. The strongest NLL result
was the selected pair, while the largest condition rate was 74.928% at
`k=64`, `alpha=0.35`.

## Interpretation

This is the strongest automatic semantic result in the non-LLM sequence.
Sparse TF-IDF retrieval over actual developer-package descriptions gives the
observed name substantially higher likelihood under its own context than under
unrelated contexts. It repairs the near-random Wikidata conditioning result
without an embedding or language model.

It still fails as a generative architecture under the preregistered effect
size. A two-percent likelihood gain may be useful for semantic reranking, but
it does not justify building or integrating another whole-form sampler after a
five-percent gate was declared. Lowering the gate now would be outcome-driven.

There is also an independent production blocker: the official dump documents
public database information but declares no compatible metadata license. Raw
and derived records remain ignored.

## Consequence

Do not run sealed test, generator application, or production shadowing from
this checkpoint. The retained architectural learning is that retrieval is a
credible non-LLM semantic signal, not that its current local Markov generator
is sufficient.

The production-eligible evidence path remains the license-independent,
context-matched Phase-290 human preference learner. Its collector requires no
LLM and is already ready for the 174 blind choices.
