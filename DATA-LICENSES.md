# Shipped data licenses

Every data file added to `core/data/` gets a row here before it is integrated
(Phase 141 discipline). "Ships" means compiled into the WASM bundle.

| File | Source | License | Ships | Notes |
|---|---|---|---|---|
| `core/data/pron_lexicon.tsv` | CMUdict (github.com/cmusphinx/cmudict), subset built by `core/examples/build_pron_lexicon.rs` | BSD-2-Clause | yes | Attribution: "Uses the CMU Pronouncing Dictionary, © Carnegie Mellon University." Raw dict kept locally at `research/cmudict/` (gitignored). |
| `core/data/semfield/neighbors.tsv` | GloVe 6B 100d (nlp.stanford.edu/projects/glove), neighbor edges computed by `research/semantic-field/build_neighbors.py` | PDDL (Public Domain Dedication and License) | yes | GloVe used offline only to compute edges; every shipped word is from the engine's own English wordlists. Raw vectors kept at `research/semantic-field/` (gitignored). |
| `core/data/morphemes.tsv` | Curated from Wikipedia "List of Greek and Latin roots in English" + standard naming practice | CC BY-SA 4.0 | yes | ~180 hand-curated root forms with glosses/tags (~6 KB). Facts (roots, meanings) plus curation; share-alike noted. |
