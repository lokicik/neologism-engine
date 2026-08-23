# Contextual edit transducer data preflight: pass

Date: 2026-08-23

This passes only the frozen train-data sufficiency question. It authorizes an
isolated development application to WordNet anchors; it does not authorize
held-out briefs, production integration, or a claim of better names.

## Frozen evidence

- Executed protocol SHA-256:
  `48c4daf89961031c0ec3d276548840955355e42fd07dccc816ad1754c60a25dc`
- Input dataset SHA-256:
  `dd4b7b977ea62aea570f7ec5b9941ca06174fd7cbb882a39ffbd2183f488d9d6`
- Rule/report SHA-256, reproduced byte-for-byte twice:
  `071d3f3ad90be53ad99952bf387c90a9125c01144051bca98c067e704d58f588`
- Training records: 10,138
- Validation/test records excluded: 2,453
- Eligible anchor vocabulary: 6,592
- Unique edit-one label/anchor pairs: 977 across 947 groups
- Eligible rules: 13
- Eligible-rule coverage: 179 labels across 169 groups

All six frozen sufficiency gates passed. The inventory includes both plausible
brand edits (`-o`, `-a`, `-r`, `-y`, `i-`, `e-`, `x-`) and suspect but
well-supported edits such as plural `-s` and initial `m-`. Nothing will be
removed after inspection. The application probe must evaluate the frozen
inventory as mined and fail honestly if these rules dominate or create weak
names.
