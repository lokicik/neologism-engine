# Phase 292 pre-result corrections

Date: 2026-08-23

No candidate, score, page, or gate result existed during these corrections.

1. The copied canonical-brief SHA had one extra `e`; the runner stopped on the
   hash gate and both the protocol and constant were corrected to the observed
   64-character identity.
2. The first clean archive lived below the repository workspace, so Cargo
   rejected the nested package before compilation. The archive moved to the
   system temporary directory.
3. Archiving only `core/` omitted the frozen workspace lockfile. The archive
   now includes the root manifests plus `core/` and `wasm/`, and Cargo runs
   offline with `--locked` against package `neologism-core`.

The final clean compile passed. These are source-identity and clean-build
corrections only; no outcome informed the model, constants, selector, or gates.
