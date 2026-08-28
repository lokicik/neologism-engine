# Shipped data licenses

Every data file added to `core/data/` gets a row here before it is integrated
(Phase 141 discipline). "Ships" means compiled into the WASM bundle.

| File | Source | License | Ships | Notes |
|---|---|---|---|---|
| `core/data/pron_lexicon.tsv` | CMUdict (github.com/cmusphinx/cmudict), subset built by `core/examples/build_pron_lexicon.rs` | BSD-2-Clause | yes | Attribution: "Uses the CMU Pronouncing Dictionary, © Carnegie Mellon University." Raw dict kept locally at `research/cmudict/` (gitignored). |
