# Human wordlikeness product-manifold research

This isolated non-LLM lane tests whether local neighborhoods of real product
name spellings predict independent human judgments of English pseudoword
well-formedness better than a global character language model.

- [Frozen protocol](PROTOCOL.md)
- [Pre-inspection freeze](PRE-INSPECTION-FREEZE.md)
- [Data-contract pass](DATA-CONTRACT-PASS.md)
- [Model implementation freeze](MODEL-FREEZE.md)
- [Implementation freeze](IMPLEMENTATION-FREEZE.md)
- [Pre-result implementation correction](PRE-RESULT-CORRECTION.md)
- [Negative checkpoint](NEGATIVE-CHECKPOINT.md)
- `run.py --output <empty-directory>` executes the frozen experiment.
- `refresh.py --refresh` is the only network-enabled entry point.

Nothing here is imported by production generation, WASM, Auto, web types,
storage, or taste.

The frozen validation failed because product-manifold kNN underperformed the
global character baseline. Sealed test ratings were not aggregated.
