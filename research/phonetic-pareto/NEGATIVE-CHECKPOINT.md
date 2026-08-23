# Phonetic Pareto probe: negative checkpoint

Date: 2026-08-23

## Decision

The first model-free consonant/vowel-stream crossover is **not eligible** for
production shadow replacement or human preference testing. It creates full,
diverse, non-template pages, but it does not preserve enough brief-specific
source signal. Several high-scoring outputs are also visibly poor (`Rehcir`,
`Tnatat`, `Dnira`, `Hpyli`), demonstrating that the retained composite score is
not calibrated for this new candidate distribution.

No production generator, WASM, web, taste, storage, or public type changed.

## Frozen identity

- Protocol SHA-256:
  `4c860e6319bc951b624cf31a086b1f68441d793995d3183c750ce601af9392e7`
- Archived `PROTOCOL.md` after terminal-newline normalization:
  `0a27116d6fbe87f41c8e1523839ed34aae84713020fa351ae19282d724c55bf5`
  (text unchanged)
- Canonical matrix: 35 briefs x seeds `13`, `67`, `313`
- Pool/page: `120/10`; maximum 20,000 attempts
- Collision review: Phase 268 Wikidata review index plus the compiled BigTech,
  root, dictionary, Italian, and Japanese-ASCII inventories
- Two fresh release processes: exit 1, byte-identical summary SHA-256
  `5423fb21376387cdf2989f3da8dbbb401c8cbdec202ed7dc8ec592c5194c70c0`

## Observed gates

| Gate | Required | Observed | Result |
|---|---:|---:|---|
| Full pages | 105/105 at 10/10 | 105/105 | PASS |
| Full candidate pools | 105/105 at 120/120 | 105/105 | PASS |
| Minimum / average quality | >=75 / >=84.0 | >=75 / 90.975 | PASS |
| Mean / minimum ILAD | >=0.72 / >=0.60 | 0.8587 / 0.7558 | PASS |
| Per-brief unique names | >=27/30 | all pass | PASS |
| Mean / maximum cross-seed overlap | <=1 / <=3 | 0.1429 / 2 | PASS |
| Duplicate normalized page sets | 0 | 0 | PASS |
| Review-index exact/edit-one collisions | 0 | 0 | PASS |
| Own source trace vs nine wrong briefs | >=75% | **62.5185%** | **FAIL** |
| Known suffix/metaphor-tail surface | <=20% | 38/1,050 = 3.619% | PASS |
| Unchanged visible source root | <=25% | 2/1,050 = 0.190% | PASS |

## Interpretation

The probe proves that removing visible suffix/metaphor assembly is easy. It
does **not** prove that the resulting strings are relevant or appealing. The
very high mechanical quality and diversity values coexist with obvious
gibberish, so those existing metrics cannot be used alone to select a new
generator family.

The failed source-trace gate also rules out the tempting post-hoc argument that
the spellings merely hide their semantic inputs more elegantly. The trace was
defined before the run and the observed 62.5% does not meet its 75% floor.

## Consequence

Do not tune the threshold or connect this generator to production. A distinct
follow-up must change the representation, not just mutation probabilities. The
most defensible next preflight is a finite-state onset/nucleus/coda generator
conditioned on explicit articulatory traits, with a development/held-out brief
split and a corpus-based plausibility model calibrated on its own output
distribution. Only after that mechanism passes should a Phase 141 shadow
hybrid or the frozen 30+12 human study run.
