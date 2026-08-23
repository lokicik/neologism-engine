# Brief-conditioned product-of-experts research

This isolated non-LLM lane combines a global product-name character prior with
a brief-derived character expert and samples each spelling end to end.

- [Frozen protocol](PROTOCOL.md)
- [Pre-result corrections](PRE-RESULT-CORRECTIONS.md)
- [Implementation freeze](IMPLEMENTATION-FREEZE.md)
- [Negative checkpoint](NEGATIVE-CHECKPOINT.md)
- `run_clean.py` will execute the probe against the frozen committed core,
  excluding unrelated working-tree changes.

Nothing here is imported by production generation, WASM, Auto, web types,
storage, or taste.

Development failed only the brief-conditioning gate (`42.22%`, required
`70%`), so sealed held-out briefs were not run.
