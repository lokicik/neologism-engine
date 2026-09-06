# Product names · Lab

An additive, offline Rust/WASM product-name catalog for four developer domains. Existing Auto, previous Lab exports, producer families, scoring weights, and saved taste data are preserved. This lane has mechanical validation, not a demonstrated human preference advantage.

Start the app normally and select **Product names · Lab**. Try `a CLI for database migrations`, `a terminal log viewer`, `a background job scheduler`, or `a configuration validator`.

- [Delivery report](REPORT.md)
- [Old/new examples](artifacts/examples.html)
- [12-page blind comparison plus four repeats](artifacts/blind-evaluation.html)
- [Machine-readable verification](artifacts/delivery.json)

## Data and interpretation

`catalog-source.mjs` contains original editorial domain/job rules and 48 sense records, capped at 24 per domain and two complete forms per record. `compile-data.mjs` compiles selected pronunciation and exact snapshot membership into `core/data/concept_naming.json`. Existing general wordlists and `pron_lexicon.tsv` are not modified. CMUdict notices ship with the web distribution.

Raw CMUdict and extracted crate-name files already present locally are required only to regenerate/check the catalog; they are not shipped in full. Their exact hashes are recorded. Missing sources fail compilation instead of silently weakening evidence. Snapshot dates are unknown. Five form records hit the brand corpus; one (`Metronome`) lacks retained pronunciation evidence. Rejected candidates remain visible in traces.

The new `generate_concept_diagnostics` export accepts `{config, target: "product_name", interpretation_override?, direction?, data_identity?}`. It returns versioned product interpretation, candidates, per-source evidence, finalists and traces. Existing `Config`/`NameResult` and generation exports are unchanged. The data identity locks continuation to the same catalog. Fixed seeds are uint32 values; UI sessions choose and retain one seed.

## Reproduce

From the repo root, with port 4246 free:

```powershell
node research/concept-naming/compile-data.mjs --check
cargo test --workspace
wasm-pack build wasm --target web --out-dir ../web/src/wasm
node research/concept-naming/check.mjs --replay
node research/concept-naming/legacy-replay.mjs
node research/product-brief/audits.mjs ../concept-naming/audits
node research/concept-naming/ui-check.mjs
node research/concept-naming/compare.mjs --replay
node research/concept-naming/study-check.mjs
node research/concept-naming/finalize.mjs
```

Run `npm run build` in `web/`; the retained `build.log` records the delivered production build. Replays ignore only durations. `baseline.mjs`, `freeze.mjs`, and `prepare-study.mjs` are first-run, non-overwriting steps; do not rerun them to replace historical evidence.

Download completed human answers from the blind page, then run:

```powershell
node research/concept-naming/evaluate.mjs path/to/product-name-human-answers.json
```

The evaluator requires all 16 answers and the exact study identity. It computes primary wins/usability and side-normalized repeat choice agreement. Usability repeat agreement is reported separately. All four existing thresholds must pass. The collector's `?fixture=1` mode and `collector-fixture.json` are explicitly synthetic and cannot establish eligibility. No human evaluation has been completed for this delivery.
