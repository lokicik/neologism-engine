# Product-benefit experiment: research and implementation

**Decision:** keep the LLM-free architecture, invest in meaning-bearing material before more score tuning, and treat a preference-trained whole-name ranker as the next separate candidate. Literature does not establish a universally best naming pipeline. [Research and primary papers](RESEARCH.md) explain the comparison and its limits.

**Delivered:** a working opt-in Lab flow, eight editorial product frames, 24 word/sense associations, complete-word constructions, removal of literal-coverage priority, and a duplicate-construction check. No production default, aesthetic weights, trained model, or saved taste records changed.

## What the comparison establishes

On the 12 evaluation briefs × two seeds:

- Removing coverage priority alone reordered 12/24 lists and changed the **set of finalists in 0/24**.
- Adding frame material with the previous selector changed the set in **18/24**. The combined implementation also changed 18/24.
- The new frame family reached the finalists in 18/24 conditions.
- Frames matched and nonempty lists were returned in 22/24 conditions. Nonempty is not synonymous with usable.
- Warm, traced generation median was about 294 ms for parsed evaluation briefs (194–702 ms). This is the entire diagnostic pool, not a production latency benchmark.

This supports the material bottleneck on these cases. It does **not** show 18 quality wins, validate every new name, or prove that selection never matters elsewhere.

## Concrete examples

Source-visible assistant suggestions, seed 13; no human labels or training data:

| Product | Previous meaning-first finalists | Current frame finalists | Assistant preference |
| --- | --- | --- | --- |
| Check manifest hashes | CheckHash, Macheck, Plumbline | HashSeal, Plumbline, CheckHash, ProofHash | HashSeal |
| Observe queue depth | TrackQueue, Izci, Fylgja | QueueWatch, Izci, Fylgja, LedgerQueue | QueueWatch |
| Restore editor sessions | Restoresave | Reprise, SessionMend, Restoresave | Reprise |
| Filter repeated alerts | Refilter, Valka | AlertMesh, Valka, SieveAlert, Refilter | AlertMesh |
| Measure query latency | Anemometer, Seismograph | Anemometer, Seismograph | Neither |

[All 12 actual Auto/current comparisons and assistant suggestions](artifacts-v2/examples.html) · [12 blind pages + four repeats](artifacts-v2/blind-evaluation.html).

## What still fails

- `recovers` is outside the shallow parser's action vocabulary. Both seeds return an unresolved plan and no finalists. The brief was not rewritten to improve coverage.
- The exposure frame matches the access-token brief, but its new forms do not reach the finalists. Filters and family selection remain visible in `analysis.json` and the compressed traces.
- `Destore` and similar existing-family coinages can still qualify. The new complete-word construction policy applies to the guided-metaphor family, not every existing producer. No automatic whole-name taste model exists yet.
- Names such as QueryGauge appeared in revision 1 but disappeared when revision 2 restricted construction objects to explicit frame cues. That loss illustrates the coverage cost of a small inventory; QueryGauge was not judged bad by the fix.
- Some readable compounds are still plain descriptions rather than distinctive brands. Family rank and seeded tie order do not resolve this aesthetic question.

## Evaluation integrity

`protocol.json` was fixed before implementation outputs (SHA-256 `00c4ad81d08c005a52b648632ea3a0a7824cf9ad9085c34d8820ef0b022c32de`). It contains three development briefs, twelve new evaluation briefs and two seeds. These cases probe the intended domains and are not representative of all developer tools.

Revision 1 is retained in `artifacts/`. After inspecting it, two general defects were fixed: unchecked phrase modifiers could become objects, and reversed compounds could consume two finalist slots. The final capture is separate in `artifacts-v2/`. Consequently, final results are regression comparisons, **not untouched held-out quality evidence**. No success threshold was changed and no further lexical tuning followed the second capture.

The original gate remains 8/12 preference wins, usable candidates on at least six briefs with at least three-brief uplift over Auto, and 3/4 consistent repeats. The collector was tested with synthetic responses only. Actual human responses: **0**; promotion gate: **pending**. No claim of improved name quality is made.

## Verification

- 221 Rust tests; WASM regenerated; TypeScript and production build passed. Existing build warnings remain.
- Seven selector contracts; 30 exact-repeat checks; 30 exclusion-based continuations; five negative/constraint controls.
- Frozen replay: 48 Auto pages, 48 shared pools, 33 intent pools, 30 operation/object conditions, and 54 old meaning-first pools. Pools, evidence, traces and finalists match, excluding elapsed time.
- All six existing Auto, held-out cold, cold, taste, mode-taste and shortlist checks passed with their unchanged thresholds. Those logs were captured on revision 1; frozen legacy replay and TypeScript/build were rerun against revision 2.
- Browser checks passed for default-off opt-in, loading, evidence explanations, saved-data isolation, continuation snapshots, export, empty results and mobile overflow. Desktop finalist and mobile screenshots were visually inspected.
- The 12+4 offline collector passed export/resume, no preselection, no network and synthetic gate checks. The browser and test choices were temporary and are not human preference records.

## Reproduce

From the repository root:

```powershell
cargo test --workspace
wasm-pack build wasm --target web --out-dir ../web/src/wasm
node web/node_modules/typescript/bin/tsc -b web
node research/product-frame/check.mjs --replay
node research/operation-object/check.mjs --replay
node research/product-frame/ui-check.mjs
node research/product-frame/study-check.mjs
node research/product-frame/analyze.mjs
```

`check.mjs` uses exclusive writes for a fresh capture and never overwrites a retained trace. The replay flag compares current execution against the final retained capture. `score-study.mjs <human-export.json>` scores a genuine collector export against the unchanged gate. Source/data/WASM hashes are in each capture's `identity.json`; final delivery validation is in `artifacts-v2/delivery.json`.

Open **Brief intent · Lab**, check **Use product benefits on next Generate**, and generate. The existing meaning-first export and `semantic_pool` remain available to scripts for historical comparison; the opt-in UI runs `frame_pool`.
