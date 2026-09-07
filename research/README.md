# Research guide

**Status · 2026-09-08:** further naming-quality research is paused. The existing app and Lab methods remain available. This directory preserves what was tried, the evidence obtained, and the limits of each result; it is not an active experiment backlog.

The latest product-name catalog has engineering validation but no completed human evaluation. Its unused evaluation form is retained as an artifact, with no new collection planned. Earlier human results remain records of their own experiments; an uncollected comparison has no human outcome.

## Start here

| Question | Read |
| --- | --- |
| What was delivered most recently? | [Product names report](concept-naming/REPORT.md) |
| What do the previous human judgments establish? | [Preference evidence audit](final-direction/preference-note.md) |
| What led to the latest catalog? | [Architecture decision · 2026-09-06](final-direction/DECISION.md), followed by the product-name report above. The decision predates the implementation and is historical. |
| Were candidate generation and selection investigated separately? | [Quality-cause report](quality-cause/REPORT.md) and [pool review](pool-review/REPORT.md) |

## Reading the evidence

- **Implemented / mechanically checked** records capacity, determinism, constraints, or integration. It does not establish that people prefer the names.
- **Human result** refers to an identified collection. Synthetic fixtures and assistant selections are not human judgments; derived labels are not additional independent responses.
- **Negative checkpoint** means that a specific frozen gate failed. Read the report to distinguish a data, capacity, modeling, calibration, or human-preference failure.
- **Source unavailable / insufficient data** means work stopped before the missing stage could be evaluated.
- Protocols, freezes, reports, and numbered artifact directories are dated records. Keep their original thresholds, hashes, and interpretation boundaries.

## Catalog and candidate investigations

These are the later pool, meaning, selection, and catalog studies. Several remain accessible through Lab; availability in the interface is separate from evidence of better naming quality.

| Directory | Focus and entry point |
| --- | --- |
| [shared-pool](shared-pool/README.md) | Compare existing generator families before Auto page assembly; [report](shared-pool/REPORT.md) |
| [brief-intent](brief-intent/README.md) | Preserve operation, object, and context in a deterministic brief grammar; [report](brief-intent/REPORT.md) |
| [operation-object](operation-object/README.md) | Require lexical evidence for both product roles; [report](operation-object/REPORT.md) |
| [quality-cause](quality-cause/README.md) | Isolate semantic dilution, selection losses, and pronunciation-filter errors; [report](quality-cause/REPORT.md) |
| [meaning-first](meaning-first/README.md) | Retained `semantic_pool` implementation and comparisons; [report](meaning-first/REPORT.md) |
| [product-frame](product-frame/REPORT.md) | Benefit associations, complete-word constructions, and selection changes |
| [product-brief](product-brief/README.md) | Product relation parsing and `brief_pool` revisions; [report](product-brief/REPORT.md) |
| [pool-review](pool-review/REPORT.md) | Fixed-pool analysis and explicitly assistant-authored selections |
| [retained-fragments](retained-fragments/REPORT.md) | Source spans, retained morphemes, and provenance filtering |
| [final-direction](final-direction/DECISION.md) | September 6 diagnosis, literature notes, preference audit, and catalog proposal |
| [concept-naming](concept-naming/README.md) | Latest offline catalog for four developer domains; [delivery and limitations](concept-naming/REPORT.md) |

## Human preference and study tools

| Directory | Recorded status |
| --- | --- |
| [preference-learning](preference-learning/README.md) | Real collection retained; the [training gate stopped before fitting](preference-learning/COLLECTION-NEGATIVE-CHECKPOINT.md) |
| [personal-acceptability](personal-acceptability/README.md) | Labels derived from the same collection; [model did not beat the length baseline](personal-acceptability/NEGATIVE-CHECKPOINT.md) |
| [personal-prototype](personal-prototype/README.md) | Mechanically validated prototype; [human gate failed](personal-prototype/HUMAN-NEGATIVE-CHECKPOINT.md) |
| [preference-study](preference-study/PHASE-281-NEGATIVE-CHECKPOINT.md) | Earlier source-construction protocols stopped before collecting human choices |
| [selection-study](selection-study/README.md) | Isolated collector/evaluator for brief-aware AI ranking; tooling and a protocol are not a preference result |

## Corpus and semantic models

| Directory | Checkpoint or entry point |
| --- | --- |
| [holistic](holistic/README.md) | [Conditional GRU gate](holistic/NEGATIVE-CHECKPOINT.md) and [contrastive scorer gate](holistic/CONTRASTIVE-NEGATIVE-CHECKPOINT.md) failed |
| [product-experts](product-experts/README.md) | [Product-of-experts generator checkpoint](product-experts/NEGATIVE-CHECKPOINT.md) |
| [crate-retrieval](crate-retrieval/README.md) | Retrieval signal was measured; [v3 generative effect-size gate failed](crate-retrieval/NEGATIVE-CHECKPOINT-V3.md) |
| [conceptnet-semantic](conceptnet-semantic/) | Source acquisition and [bulk semantic preflight](conceptnet-semantic/BULK-PREFLIGHT-PASS.md); [data attribution](conceptnet-semantic/ATTRIBUTION.md) |
| [conceptnet-lattice](conceptnet-lattice/README.md) | [Semantic-lattice beam checkpoint](conceptnet-lattice/NEGATIVE-CHECKPOINT.md) |
| [conceptnet-sampler](conceptnet-sampler/README.md) | [Whole-form sampling checkpoint](conceptnet-sampler/NEGATIVE-CHECKPOINT.md) |
| [conceptnet-density-ratio](conceptnet-density-ratio/README.md) | [Background-corrected selector checkpoint](conceptnet-density-ratio/NEGATIVE-CHECKPOINT.md) |
| [conceptnet-multiclass](conceptnet-multiclass/README.md) | [Source-keyword selector checkpoint](conceptnet-multiclass/NEGATIVE-CHECKPOINT.md) |
| [conceptnet-guided-sampler](conceptnet-guided-sampler/README.md) | Development passed; [sealed full-pool capacity gate failed](conceptnet-guided-sampler/SEALED-NEGATIVE-CHECKPOINT.md) |
| [wordnet-gloss-retrieval](wordnet-gloss-retrieval/NEGATIVE-CHECKPOINT.md) | Definition retrieval stopped at its coverage gate |
| [wordnet-realword](wordnet-realword/NEGATIVE-CHECKPOINT.md) | Exact-keyword candidate capacity gate failed |
| [wordnet-respell](wordnet-respell/NEGATIVE-CHECKPOINT.md) | Anchor respelling stopped on development gates |
| [wordnet-rootgroups](wordnet-rootgroups/NEGATIVE-CHECKPOINT.md) | Root-group selector could not fill every required page |
| [polysemous-lexeme](polysemous-lexeme/README.md) | [Multi-sense lexical capacity gate failed before ranking](polysemous-lexeme/NEGATIVE-CHECKPOINT.md) |

## Sound, form, and human norms

| Directory | Recorded status |
| --- | --- |
| [aesthetic-energy](aesthetic-energy/README.md) | Real-name/corruption scorer rejected at validation |
| [articulatory-wfst](articulatory-wfst/README.md) | Syllable-state generator failed development gates |
| [brand-liking](brand-liking/README.md) | Eligible BRAND data was insufficient before modeling |
| [human-wordlikeness-manifold](human-wordlikeness-manifold/README.md) | [Local-neighborhood model failed its baseline comparison](human-wordlikeness-manifold/NEGATIVE-CHECKPOINT.md) |
| [learned-edit-fst](learned-edit-fst/APPLICATION-NEGATIVE-CHECKPOINT.md) | Edit transducer passed development; its WordNet application failed sealed coverage |
| [ordinal-valence-external](ordinal-valence-external/README.md) | Small external transfer signal missed the frozen effect threshold |
| [phonetic-pareto](phonetic-pareto/README.md) | Consonant/vowel crossover rejected; the one-off harness was removed at the checkpoint |
| [phonosemantic-iconicity](phonosemantic-iconicity/README.md) | Required source inventory was unavailable; modeling stopped |
| [pseudovalence](pseudovalence/README.md) | Ranking signal measured; sealed calibration gate failed |
| [shape-iconicity](shape-iconicity/README.md) | Development data failed the frozen eligibility/count gate |

## Data preparation and historical scripts

Some files under `research/` prepare data used by the application. They are not disposable experiment output.

| Directory | Purpose |
| --- | --- |
| [collision](collision/) | Extract crate names for the collision-data build |
| [semantic-field](semantic-field/) | Compute bundled semantic-neighbor edges from local GloVe vectors |
| [submorph](submorph/) | Submorpheme curation script, draft inventory, and report |
| [llm](llm/) | Historical local generation and reranking scripts; separate from the offline engine |

[DATA-LICENSES.md](../DATA-LICENSES.md) is the entry point for bundled data. Raw CMUdict, vector downloads, and various `work/` or `snapshot/` files may exist only in the ignored local workspace. Their presence here does not make them part of a clean clone or grant redistribution rights.

## Reproduction and preservation

Each lane owns its instructions. Check prerequisites and output paths before running commands: some need ignored source data or a historical commit, some write frozen evidence paths, and explicitly marked refresh commands contact external sources. Removed one-off harnesses are historical commands, not maintained entry points. No experiment needs to be rerun for ordinary app use.

Keep existing lane paths stable. For example, the core's product-brief test includes `research/product-brief/protocol.json`, and replay tools import sibling harnesses or verify path-keyed manifests. Preserve protocols, source identities, captured results, real human reports, and synthetic labels together. Repeated runs and versioned outputs are evidence records, even when their contents match.

For the older phase narrative, see the [historical documentation archive](../docs/archive/README.md). The September 8 cleanup changes navigation and root documentation; it does not regenerate evidence, reclassify synthetic answers, or promote experimental methods.
