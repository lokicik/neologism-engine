# Retrieval-conditioned crate-name research

This isolated non-LLM lane retrieves semantically related package descriptions
with sparse TF-IDF, then uses only the retrieved package names to construct a
brief-local character model.

- [Frozen protocol](PROTOCOL.md)
- [Pre-inspection freeze](PRE-INSPECTION-FREEZE.md)
- [Table-selection freeze](TABLE-SELECTION-FREEZE.md)
- [Extraction freeze](EXTRACTION-FREEZE.md)
- [Normalization freeze](NORMALIZATION-FREEZE.md)
- [Preparation implementation freeze](PREPARATION-IMPLEMENTATION-FREEZE.md)
- [Phase 293 negative checkpoint](NEGATIVE-CHECKPOINT.md)
- [Phase 294 successor protocol](PROTOCOL-V2.md)
- [Phase 294 preparation freeze](PREPARATION-V2-IMPLEMENTATION-FREEZE.md)
- [Phase 294 negative checkpoint](NEGATIVE-CHECKPOINT-V2.md)
- [Phase 295 power-audit protocol](POWER-AUDIT-PROTOCOL-V3.md)
- [Phase 295 power-audit result](POWER-AUDIT-RESULT-V3.md)
- [Phase 295 model protocol](PROTOCOL-V3.md)
- [Phase 295 preparation freeze](PREPARATION-V3-IMPLEMENTATION-FREEZE.md)
- [Phase 295 data-gate pass](DATA-GATE-PASS-V3.md)
- [Phase 295 model freeze](MODEL-FREEZE-V3.md)
- [Phase 295 implementation freeze](MODEL-IMPLEMENTATION-FREEZE-V3.md)
- [Phase 295 negative checkpoint](NEGATIVE-CHECKPOINT-V3.md)
- `refresh.py --refresh` is the only network-enabled command.
- `extract.py` extracts only the frozen six-table subset offline.
- `prepare.py` enforces eligibility, leakage components, split, and coverage.
- `prepare_v2.py` implements Phase 294's non-percolating leakage rule.

Raw crates.io data is ignored and is not redistributed. Nothing here is
imported by production, WASM, Auto, web types, storage, or taste.

Phase 293 stopped before modeling because the frozen transitive edit-one graph
formed a 48,491-item component. A successor needs a different leakage rule.

Phase 295 ultimately passed retrieval coverage, wrong-description conditioning,
and bootstrap gates, but its 2.011% NLL improvement missed the frozen 5% gate.
Sealed test and generation were not opened.
