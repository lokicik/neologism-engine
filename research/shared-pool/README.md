# Shared-pool Lab

An isolated, non-LLM experiment comparing nine existing generator families through one bounded pool. In Create, select **Shared pool · Lab** and Generate. Auto remains the default. Lab Keep/Pass choices are session-only; Export includes them and the complete trace without changing saved taste data.

## Architecture

Each family returns at most 24 candidates with its existing filters and ordering. `CandidateProposal` merges equal spellings while retaining all source ranks and available semantic evidence. A seed-derived family order drives round-robin selection, with four finalists maximum, two selections per source family, and unique three-letter openings. Missing evidence is explicit and does not become a ranking score. Explanation text is never a selection input.

The additive WASM `generate_candidate_diagnostics` export captures materialized spellings, filter events and internal ranking inputs. Instrumentation is inactive on ordinary calls and consumes no randomness. Nested Reason/Submorph events retain their stage identifiers. Spelling-free construction failures are not observable candidate rejections; the report does not count them as names. Internal diversity/ranking decisions are preserved, not bypassed.

Common pool constraints enforce the requested length, prefix, substring, exclusions, existing lexical-hazard flags, the existing readable prompt-linked Respell gate and local collision hits. A local Bloom negative means only absence from its bundled snapshot, not current namespace/domain availability. A hit may be a false positive. No live namespace calls are made.

Continuation uses the last generated brief and seed, excluding finalists actually displayed. Revealing the entire pool also marks those visible spellings as seen. No padding is used when the bounded pools cannot supply four eligible, distinct alternatives. No preference model is trained or consumed in this experiment.

## Evidence and commands

- `protocol.json`: frozen development/evaluation briefs, seeds and human gates.
- `artifacts/baseline.json`: original source hashes, user-owned dirty diff, 48 cold Auto pages, finalists, pool sizes and durations.
- `artifacts/experiment-identity.json`: frozen generation sources; later UI-only layout fixes do not change candidate selection.
- `artifacts/comparison.json` and `trace-*.json.gz`: 48 experimental runs, full source/filter/selection evidence and hashes.
- `REPORT.md`: descriptive results and concrete output comparisons. These are not preference evidence.

Run from the repository root after rebuilding WASM:

```powershell
cargo test -p neologism-core
wasm-pack build wasm --target web --out-dir ../web/src/wasm
node web/node_modules/typescript/bin/tsc -b web
node research/shared-pool/contract.mjs
node research/shared-pool/verify.mjs
node research/shared-pool/study-check.mjs
```

`capture-baseline.mjs`, `compare.mjs` and `pack-study.mjs` create retained evidence and deliberately refuse to overwrite result files. To reproduce a full experiment, use a separate checkout/output copy rather than deleting or relabeling frozen evidence. Runtime durations are observational; tracing more families does more work than Auto.

## Human evaluation

Open **artifacts/blind-evaluation.html** directly in a browser. Send only that file to the evaluator; `study-key.private.json` stays with the study owner. The standalone collector has 12 primary pages and four concealed reversed repeats, no source labels, no structural scores, no network, no local storage, and no preselected answers. Candidate list lengths can differ because neither arm is padded. Absolute use selections and relative preferences are collected separately. Download before closing; an exported partial file can resume the same exact study.

After receiving a genuine complete export:

```powershell
node research/shared-pool/study-tools.mjs path/to/shared-pool-choices.json
```

Promotion eligibility requires all frozen gates: at least 8/12 experimental wins, at least 6/12 briefs with an explicitly usable experimental name, a usable-brief uplift of at least 3 over Auto, and at least 3/4 consistent repeats. Repeat consistency checks both preference and selected usable names after reversing sides. Incomplete, mismatched and invalid files fail closed. Synthetic test answers are never retained as human evidence. Passing does not automatically switch Auto or deploy anything.
