# Brief intent Lab

An isolated successor to the shared-pool experiment. In Create, choose **Brief intent · Lab**. It uses the same nine families, 24-candidate family limits, constraints and direct finalist selector. Auto and the original Shared pool Lab remain available.

This is a deterministic Rust grammar experiment: no model call, model training, added name dictionary or changed aesthetic scoring. A small action/inflection recognizer separates a simple English brief into operation, object, condition and context. Every retained term includes its original surface and byte span. The original description is retained as well.

The existing six-keyword budget reserves one operation, up to three object terms, up to two condition terms, then at most one context term if space remains. Wrapper words are omitted. Existing literal and concept-palette roots receive equal bounded allowances in that order; no new semantic synonym mappings are introduced. This changes the material supplied to producers, not their aesthetic ranking or the shared-pool finalist selector.

## Isolation and limitations

`core/src/brief_intent.rs` provides an explicit synchronous scope used only by the additive `generate_intent_candidate_diagnostics` WASM export. The existing Config schema does not change. Exact description and keyword-list matching prevent unrelated derived root configurations from being replaced. Scope state is restored after nested calls and Rust unwinding. It must not span asynchronous work. Ordinary generation sees no active intent.

All existing producer keyword reads share that scope. Concept coverage and lexical hazards are computed within the same scope, so displayed diagnostic metadata uses the generation representation. Existing explanation prose does not rank finalists. Original family evidence is retained, and the exported run additionally carries the parsed brief.

This is **not a general semantic parser**: it has a finite English action vocabulary, treats material after simple prepositions as a condition, and does not establish meaning by understanding a sentence. It does not reliably resolve multiple operations, noun senses or implicit intent. Empty, unsupported-character, explicitly negated, missing-operation and missing-object cases fall back to the original keyword reader, with the reason displayed. A fallback is not a claim that the original reader understands negation. Unknown object vocabulary may remain unusable even when extraction succeeds.

The UI shows the interpretation before the finalists and preserves the original brief on continuation. Keep/Pass remain session-only; no saved preference data is trained or altered. Snapshot absence is explicitly unverified availability.

## Retained comparison

`protocol.json` was written before generating this experiment's comparison. It has the three now-observed failure cases as development material and eight separate developer briefs, each with seeds 13, 67 and 313. The evaluation briefs deliberately use explicit English action clauses; results cannot estimate coverage of arbitrary user prose. After this experiment these briefs must not be reused as unseen evidence.

`artifacts/identity.json` captures source/data/WASM hashes and the existing worktree diff. `comparison.json` records Auto, original pool and intent-pool finalists. Compressed traces retain both pool runs and the intent continuation, with file hashes. Performance fields are observational and excluded from exact replay checks.

```powershell
cargo test -p neologism-core
wasm-pack build wasm --target web --out-dir ../web/src/wasm
node web/node_modules/typescript/bin/tsc -b web
node research/brief-intent/check.mjs --replay
node research/brief-intent/ui-check.mjs
node research/brief-intent/verify.mjs
```

Run browser scripts sequentially: the shared harness uses one local port. `check.mjs` without `--replay` creates immutable evidence and refuses to overwrite it. It checks all 48 retained Auto pages, all 48 original shared pools and traces, the 33 new runs, exact repeated generation, continuation, family limits, source spans, empty constraints and fallback equivalence. `verify.mjs` runs the existing six audits without altering their thresholds. UI checks exercise real WASM generation, interpretation, export, continuation, mobile layout and session-data isolation.

Assistant editorial choices belong in `REPORT.md`, not in the original human study or training data. Original human promotion gates remain unchanged and unfulfilled by this experiment. No automatic default switch is included.
