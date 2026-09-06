# Meaning-first Lab

In **Create → Brief intent · Lab**, enable **Prioritize product meaning on next Generate** and press Generate. It is off by default. This and the older strict operation–object option are mutually exclusive. A continuation uses the brief, option, seed and exclusions captured for its current run even if the draft or checkbox changes.

## Implemented behavior

- `core/src/semantic.rs` keeps the normalized operation and the complete object phrase, with original text spans. The six-term production budget never silently truncates an object modifier: unsupported/ambiguous/over-budget phrases return an explicit unresolved result. Conditions and context remain in the plan as separate roles.
- All nine families use the core terms. Material groups retain separate terms rather than replacing a multiword object by its head. Existing literals, concept palettes and fragment associations supply material. No names or semantic edges are added to the datasets.
- Reason sorts operation-derived candidates before object, condition and context candidates; existing family scoring remains the tie breaker. Actual accepted seam-blend ingredient pairs are retained as construction provenance. Generic distributional neighbors are not treated as direct equivalence evidence.
- Structured links distinguish literal edges, recorded fragments, actual generator materials, palette clues and direct non-coined Reason metaphors. Palette clues alone cannot qualify a name. Literal/fragment role matches must use independent spans; a shared substring cannot prove both roles.
- Finalist ordering is lexicographic: operation plus every object term; operation plus some object terms; direct operation metaphor. Then existing family rank, seeded family tie order and spelling. Family limits (two) and distinct three-letter beginnings are applied after this ordering. Four is a maximum, never a filling target. This is an evidence ordering, not a calibrated aesthetic score. Partial object links remain visible.
- In this scope, known whole-word pronunciation or exact concatenations of recorded material with dictionary pronunciations supply syllable counts. Ambiguous decompositions and unknown coinages retain the marked spelling estimate. The three-syllable limit stays; four-syllable VerifyFile is not relabeled as three. Filter, result, memorability diagnostic and explanation use the scoped count consistently. Unscoped Auto and previous experiments keep their original behavior.
- The existing finalist component shows semantic coverage and pronunciation provenance. Structural scores remain in exported diagnostics and are hidden as headline ratings for this option. Keep/Pass are session-only. A local collision-snapshot absence is explicitly not current availability.

The new additive WASM export is `generate_semantic_candidate_diagnostics`; the internal Lab variant is `semantic_pool`. The production Config shape and stored preferences are unchanged. Synchronous scopes restore nested calls and panics. No scope crosses an await.

## Verification and comparison

`protocol.json` fixes six known development cases, twelve new developer briefs, three seeds and the original human gates before candidate outputs. Those twelve briefs become observed after this experiment and must not be reused as untouched held-out material when tuning a successor.

```powershell
cargo test -p neologism-core
wasm-pack build wasm --target web --out-dir ../web/src/wasm
node web/node_modules/typescript/bin/tsc -b web
node research/operation-object/check.mjs --replay
node research/meaning-first/audits.mjs
node research/meaning-first/check.mjs
node research/meaning-first/ui-check.mjs
node research/meaning-first/pack-study.mjs
```

`check.mjs` creates immutable evidence and refuses overwrites. Reproduce it in a separate output copy/checkout. It records all 54 Auto/previous/new comparisons plus exact repeats and continuation pools. The two shared helper functions accept an optional protocol; callers that omit it retain the original study and gates. Browser harnesses using port 4246 must run sequentially. The six existing web audits use their own ports.

`artifacts/identity.json` captures source/data/WASM hashes and the existing dirty diff. Compressed traces include all sources, structural diagnostics, semantic evidence, pronunciation source, internal rejections and selection decisions. See [REPORT.md](REPORT.md) for actual findings, confidence limits and concrete names.

## Human comparison

`artifacts/blind-evaluation.html` contains 12 finalist comparisons plus four reversed repeats with no source labels or scores. The seed for primary case i is fixed as seeds[i % 3]. The separate private key must not be sent with the collector. The reused offline collector offers “neither”, explicit usable names, partial export and resume. No answers are prefilled or sent anywhere.

```powershell
node research/meaning-first/score-study.mjs path/to/genuine-human-choices.json
```

All original gates are required: 8/12 wins, six briefs with an explicitly usable name, usable-brief uplift of three, and 3/4 consistent repeats. Assistant reviews and synthetic UI choices are not human evidence. No automatic default switch follows the diagnostic or assistant review.
