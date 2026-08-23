# Brief-conditioned product of experts: negative checkpoint

Date: 2026-08-23

## Decision

The whole-form product-of-experts sampler stops on development. It is not
eligible for sealed held-out briefs, a production shadow hybrid, human
preference testing, or integration. It easily produces full, diverse,
non-template pages, but the brief expert does not exert the preregistered
semantic discrimination.

No expert weight, smoothing value, temperature, source-root rule, selector
weight, or threshold changed after results. The 11 sealed briefs were not run.

## Frozen identity and reproducibility

- Protocol SHA-256:
  `ccbccdee0389668bef9b35517bdbe1d28fa3db4f3da555478b03f66333b9fa3b`
- Probe SHA-256:
  `8b81655a994fe5117dd746c837e4ae53cef21a5c5d7810dae7437a6c0f7992fd`
- Clean runner SHA-256:
  `ac0fa1e32fad2344c55176b3a00b0dd54397f1d157c20e67af64d6f6d0c03619`
- Frozen core commit:
  `ccdb67b49ae053f10ed7bdd4ee683d622d2c50b7`.
- Two clean development reports were byte-identical at SHA-256
  `59dbd62789fbf1b7f029ed9dc76ed78aac28120697d74b8c313d1cb70f205715`.
- Two clean manifests were byte-identical at SHA-256
  `11347532bc468f22ab4d6cd20390e9e13e7da44f05e9c5002686ab65adcc9f81`.
- Same-process replay also reproduced every pool, rejection counter, trace, and
  ordered page.

## Development gates

| Gate | Required | Observed | Result |
|---|---:|---:|---|
| Full pages / pools | 72 / 72 | 72 / 72 | PASS |
| Minimum / average quality | >=75 / >=84.0 | 77 / 89.06 | PASS |
| Mean / minimum ILAD | >=0.72 / >=0.60 | 0.9154 / 0.8635 | PASS |
| Minimum unique names per brief | >=27/30 | 29 | PASS |
| Mean / maximum seed overlap | <=1 / <=3 | 0.0139 / 1 | PASS |
| Duplicate normalized page sets | 0 | 0 | PASS |
| Global form floor | every card | 720/720 | PASS |
| Phase-141 template-tail share | <=20% | 33/720 = 4.58% | PASS |
| Own brief vs nine wrong briefs | >=70% | **42.22%** | **FAIL** |
| Root copies / hazards / review collisions | 0 | 0 / 0 / 0 | PASS |

## Interpretation

The architecture solves the easy half of the problem. A global product-name
prior plus hard filters creates abundant spellings outside visible suffix and
metaphor templates. It does not solve meaning: character transition statistics
from a handful of semantic roots are not a semantic representation, even when
they influence every generated character.

The visible pages also repeat the automatic-metric warning. Names such as
`Nowmc` and `Cadass` clear the frozen form, phonotactic, quality, novelty,
collision, and lexical-hazard controls. High corpus wordlikeness and mechanical
quality are therefore insufficient evidence of intentional or attractive
naming.

Increasing the brief weight after observing `42.22%` would trade product form
for a diagnostic and would be post-hoc. The prior GRU, lexical scorer,
articulatory WFST, learned edit, human-valence, product-manifold, and this
product-of-experts sequence now converge on the same boundary: the missing
signal is judgment on actual context-matched name candidates, not another
unsupervised string factorization.

## Consequence

Production remains unchanged. The active non-LLM route is the already frozen
Phase-290 grouped out-of-fold Bradley-Terry learner over 174 blind human
choices. It uses actual engine candidates and brief context; no LLM or online
model is required. Until those choices exist and pass their gates, no honest
better-name claim or broad reranker integration is available.
