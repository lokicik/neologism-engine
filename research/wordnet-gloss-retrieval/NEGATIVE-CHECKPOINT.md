# WordNet gloss retrieval: Phase 296 negative checkpoint

Date: 2026-08-23

## Decision

Phase 296 stops at its frozen data/retrieval-coverage gate before validation
NLL modeling, sealed-test retrieval, generation, or production shadowing.
WordNet supplies enough clean lemma records, but definition-text retrieval is
too sparse for the modern product vocabulary in the canonical briefs.

No neighbor minimum, tokenization rule, stopword inventory, split rule, model
grid, or threshold changed after the first result. A second clean execution
reproduced both retained artifacts byte-for-byte.

## Frozen identity and reproduction

- Protocol commit: `37d0b4a`.
- Implementation commit: `fa75d8e`.
- Protocol SHA-256:
  `55b0f32b8969f6ecc6c5f4568fa8b175887080795836572f480dba956291e59e`.
- Evaluator SHA-256:
  `d56661d6843edc4c50f1794dfd696f3aada1c41bbbc1699e0e64e5ba4be5b5b4`.
- WordNet 3.0 ZIP SHA-256:
  `cbda5ea6eef7f36a97a43d4a75f85e07fccbb4f23657d27b4ccbc93e2646ab59`.
- Reproduced `data-report.json` SHA-256:
  `ae6f171eae40e1d44f7a0c62c7ebaadb0aeec539eed60c231bc70ba7a057f33b`.
- Reproduced `manifest.json` SHA-256:
  `854aecd9d9e91318d940933fd0153b8a1c91bfa998e4d23a2b97da696f2fed6e`.

## Data result

- Raw eligible unique lemmas: 56,925.
- Provisional train/validation/test: 45,423 / 5,753 / 5,749.
- Retained train/validation/test after cross-partition exact/edit-one filtering:
  45,423 / 3,326 / 3,217.
- Validation/test exclusion: 42.19% / 44.04%, within the frozen 50% maximum.
- Cross-partition exact/edit-one leakage: zero.
- Canonical brief coverage at 64 positive-cosine neighbors: **22/35**, below
  the required 35/35.

Thirteen briefs fail the coverage requirement. Particularly sparse examples
are `dependency update automation` with 2 neighbors, `a CLI for database
migrations` with 7, `a weekly menu and grocery organizer` with 25, and `a
veterinary appointment and pet wellness tracker` with 28.

## Boundary and interpretation

The evaluator wrote only `data-report.json` and `manifest.json`. It wrote no
IDF artifact, validation retrieval, validation scores, test retrieval, test
scores, or test report. Therefore Phase 296 makes no NLL or semantic-effect
claim and reveals no sealed model outcome.

This is not evidence that lexical retrieval is useless: Phase 295 already
showed strong condition contrast on software descriptions. It shows that raw
WordNet 3.0 glosses alone do not bridge enough contemporary product jargon
under a preregistered dense-neighbor requirement. Lowering the neighbor gate or
adding graph expansions now would be an outcome-driven repair, so this tested
architecture is closed.

Any follow-up must use a separately declared source or representation and may
not present itself as a continuation of this failed validation run. The
license-independent, context-matched blind human preference learner remains
the strongest production-eligible path once its 174 real choices exist.
