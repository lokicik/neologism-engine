# Retrieval-conditioned crate-name model: Phase 293 negative checkpoint

Date: 2026-08-23

## Decision

Phase 293 stops at the frozen leakage-component gate, before TF-IDF fitting,
retrieval, validation-name scoring, hyperparameter selection, sealed test, or
generation. The official dump contains enough eligible data and complete brief
vocabulary coverage, but transitive edit-one name connectivity collapses most
records into one component and makes the declared grouped split invalid.

No component limit, family definition, name rule, or split threshold changed
after this result. No normalized model record or scorer artifact was emitted.

## Source identity

- Official dump URL: `https://static.crates.io/db-dump.tar.gz`.
- Compressed bytes: `1,763,902,984`.
- Archive SHA-256:
  `fecb5cc2ea7eae450c53051ffc104506d22eea7336203afee7a22fe39620647c`.
- Dump timestamp directory: `2026-08-23-020023`.
- Frozen protocol SHA-256:
  `df4c3388ed2e72d881b78abea2dcb4efa9bff8651d36fbd4842660191e4b7dde`.
- Preparation implementation SHA-256:
  `0ea98495787c565eb7263580028b93c9f6b61643262b6731577f0c4a4ecb2d8b`.
- Data report SHA-256:
  `402c100cf47f6ff703722d6449e87275e646c6c7f0fe9d4ebcb35d9cc8cc02f2`.

The included README calls this public crates.io database information but does
not declare a content license. Raw and normalized data therefore remain
ignored and cannot authorize a production artifact.

## Frozen data gates

| Gate | Required | Observed | Result |
|---|---:|---:|---|
| Eligible direct names with descriptions/owners | >=50,000 | 64,681 | PASS |
| Canonical brief train-vocabulary coverage | 35/35 | 35/35 | PASS |
| Validation / test minimum | >=5,000 each | 6,467 / 6,470 | PASS |
| Partition shares within three points | 80/10/10 | 80.00/10.00/10.00 | PASS |
| Largest leakage component | <=5% | **48,491 / 64,681 = 74.97%** | **FAIL** |

The source contains 321,036 crates. Rejections were 246,303 for direct name
shape, 10,050 for description sufficiency, and two for missing owners.

## Read-only cause diagnosis

The post-failure diagnostic did not alter eligibility or rerun a gate. Its
report is SHA-256
`e4ade05ad4beec89b3530937133c7c155696f0d34bd0a52c5107c552ec41e0fa`.

- Exact normalized descriptions alone: largest component `29`.
- Owner graph alone: largest component `3,283`.
- Edit-one name graph alone: largest component **24,800**.
- Combined frozen graph: largest component **48,491**; the next largest is 23.
- Observed edit edges: 30,827 substitution and 18,271 insertion/deletion.

At registry scale, transitive edit-one connectivity percolates through chance
short-name bridges; it no longer represents one plausible name family. The
failure is therefore a split-definition failure, not evidence against lexical
retrieval or against the data's semantic content.

## Consequence

Do not lower the 5% gate or silently remove the largest component. A distinct
successor may group owners and exact descriptions, then prevent edit-one
leakage by excluding cross-partition evaluation records instead of taking the
transitive closure. It must freeze that rule and retain at least 5,000 clean
validation and test items before any model score is inspected.

Production, WASM, Auto, web types, storage, and taste remain unchanged.
