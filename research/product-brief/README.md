# Product relation and material continuity

This opt-in revision addresses two concrete faults: equivalent descriptions could produce different naming material, and a blend producer could replace a bounded meaning plan with untyped distributional neighbors.

The existing **Brief intent · Lab → Use product benefits on next Generate** option now runs `brief_pool`. Previous `frame_pool`, `semantic_pool`, `relation_pool`, `intent_pool` and Auto remain callable for replay. This is an additive WASM export, not a production-default or saved-preference migration.

## Implementation

`core/src/product_brief.rs` uses the existing grammar through an explicit action resolver. It recognizes narrow aliases (`recover → restore`, `validate → verify`, `monitor → track`) and inflections including `mapping`. It never rewrites the source description; spans and surface text remain original.

`core/data/object_relations.tsv` holds 21 original editorial subject/property pairs. A noun compound such as `query latency` and its `latency of queries` paraphrase share ordered naming roots. Matching requires the same frame and a direct noun relation; crossing a clause or unrelated cooccurrence is not accepted. Other words in a recognized phrase are recorded in `supporting_terms`, while the full phrase remains visible. They do not become extra naming roots: `damaged` describes the state of an archive, not a product to name.

The eight existing benefit frames and their 24 anchors are unchanged. Their anchors now enter the scoped material consumed by existing blend families, preserving generation weights. `benefit_construction` records an actual accepted Seamblend parent; spelling overlap alone is not reported as that construction. A suffix-only form still needs independent object evidence.

An additional fault was found inside `seamblend::ingredient_groups`: `augment_thin_groups` filled sparse groups with GloVe neighbors, including neighbors seeded from other brief words. For example, an explicit hash plan generated `Proofrent`, and a module-dependency plan generated `Paychart`; both then failed object evidence at the common pool. In this revision, an explicit benefit scope owns the ingredient budget. Seamblend returns those groups before augmentation, and guided pairs use the same scoped material. Unscoped behavior is unchanged.

## Retained experiment stages

- `artifacts/`: initial grammar, object relations and benefit-root handoff; untyped Seamblend augmentation still active.
- `artifacts-v2/`: bounded Seamblend ingredients and the guided-pair handoff.
- `artifacts-v3/`: final revision, with phrase-support words explicitly separated from naming roots.

All stages retain code/data/WASM identities and compressed traces. The fixed eight paraphrase pairs are exercised at seeds 13 and 67, followed by the previous twelve regression briefs at seed 13. Changes following inspection of earlier stages are disclosed; final results are not an untouched human-quality benchmark. No candidate-specific blacklist or aesthetic weights were added.

## Reproduce final state

```powershell
cargo test --workspace
wasm-pack build wasm --target web --out-dir ../web/src/wasm
node web/node_modules/typescript/bin/tsc -b web
node research/product-brief/check.mjs --replay
node research/product-brief/legacy-replay.mjs
node research/product-brief/audits.mjs artifacts-v3
node research/product-brief/ui-check.mjs
node research/product-brief/analyze.mjs
node research/product-brief/finalize.mjs
```

Build the web app with `node node_modules/vite/bin/vite.js build` from `web/`. The main check uses exclusive writes when first capturing results; `--replay` checks frozen traces instead. The harness uses port 4246, so run harness-based checks sequentially.

The original human gate remains pending and unchanged. The previously prepared blind form measures its frozen previous candidates; it must not be presented as a human evaluation of this revision. This delivery includes source-visible comparisons and no fabricated human choices or learned preference model.
