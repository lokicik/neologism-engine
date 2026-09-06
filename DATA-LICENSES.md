# Shipped data licenses

Every data file added to `core/data/` gets a row here before it is integrated
(Phase 141 discipline). "Ships" means compiled into the WASM bundle.

| File | Source | License | Ships | Notes |
|---|---|---|---|---|
| `core/data/concept_naming.json` | Original editorial product concepts; selected entries from the locally retained CMUdict; exact brand/crate snapshot membership facts | Editorial associations plus CMUdict BSD-2-Clause | yes | 48 concepts, 50 bounded forms; source hashes and unknown snapshot dates retained. Only selected pronunciation records are compiled, with no changes to the general vocabulary. CMUdict copyright and license are shipped in `web/public/third-party-notices.txt`. No human preference labels. |
| `core/data/product_frames.tsv` | Original project editorial associations | No third-party dataset license | yes | Eight product-benefit frames and 24 word/sense associations. Not human preference labels or copied vocabulary norms. |
| `core/data/object_relations.tsv` | Original project editorial domain/property relationships | No third-party dataset license | yes | 21 explicit noun relationships for scoped brief interpretation; not an externally licensed ontology. |
| `core/data/pron_lexicon.tsv` | CMUdict (github.com/cmusphinx/cmudict), subset built by `core/examples/build_pron_lexicon.rs` | BSD-2-Clause | yes | Attribution: "Uses the CMU Pronouncing Dictionary, © Carnegie Mellon University." Raw dict kept locally at `research/cmudict/` (gitignored). |
| `core/data/semfield/neighbors.tsv` | GloVe 6B 100d (nlp.stanford.edu/projects/glove), neighbor edges computed by `research/semantic-field/build_neighbors.py` | PDDL (Public Domain Dedication and License) | yes | GloVe used offline only to compute edges; every shipped word is from the engine's own English wordlists. Raw vectors kept at `research/semantic-field/` (gitignored). |
| `core/data/morphemes.tsv` | Curated from Wikipedia "List of Greek and Latin roots in English" + standard naming practice | CC BY-SA 4.0 | yes | ~180 hand-curated root forms with glosses/tags (~6 KB). Facts (roots, meanings) plus curation; share-alike noted. |
| `core/data/collision.bloom` | crate NAMES from the crates.io db-dump + `bigtech.txt`, hashed into a bloom filter by `core/examples/build_collision_set.rs` (names extracted by `research/collision/extract_names.py`) | facts (names, not copyrightable) | yes | ~85k names, 113 KB, ~0.5% FP. Distinct from the crates.io dump's descriptions, which are license-blocked and NOT used. Raw dump/extract kept locally (gitignored). |
