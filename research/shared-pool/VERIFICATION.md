# Verification — 2026-09-05

Implemented and verified locally. No deployment, default Auto replacement or human preference claim.

| Check | Result |
|---|---|
| Rust core | 207 tests passed, including trace transparency/determinism and scoped collector restoration |
| WASM | Rebuilt with wasm-pack; additive diagnostic export available |
| TypeScript and production Vite build | Passed |
| Existing Auto, held-out, cold, taste, mode-aware taste and shortlist audits | All six exited 0; original audit files and thresholds unchanged |
| Original baseline | 48/48 Auto pages and finalist sets unchanged |
| Experiment replay | 48/48 complete candidate pools, finalists and traces reproduced in a fresh browser, ignoring durations only |
| Shared-pool contracts | 23 mechanism checks plus Lab interaction, export, continuation, mobile and storage isolation passed |
| Offline evaluator | Synthetic gate tests, complete export, partial resume, mobile layout and zero HTTP requests passed |
| Existing local changes | Both edited knowledge tables match baseline hashes; removing only added trace calls restores the original reason.rs hash |
| Human evidence | None collected; all promotion gates remain pending |

Retained machine evidence: `artifacts/verification.json`, six audit logs, `artifacts/reproduction.json`, `artifacts/study-check.json`, code/data identities, compressed candidate traces, and desktop/mobile screenshots. `lab-export.json` contains synthetic UI interactions, not human preference evidence.

The Vite build reports the existing large semantic-data chunks and that the Lab's dynamic engine import shares the already loaded engine chunk. The new diagnostic export is included in the WASM binary (997,949 bytes in this build); trace capture is opt-in, but this experiment does not claim a zero-byte bundle cost.

The Lab does more work than Auto: median diagnostic generation was approximately 604 ms against 35 ms for warmed Auto in this local harness. This measures different bounded workloads, not an equal-budget speed comparison. There is no new trained scorer, data expansion or modified family ranking weight.

Selection comparisons use up to four names per side; legacy Auto may return fewer, including an empty list. The collector preserves those outcomes instead of padding either arm, so cardinality may give an evaluator a clue about the source. Names alone are shown without model labels, scores or explanation prose.
