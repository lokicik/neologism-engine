# Non-percolating crate split: Phase 294 negative checkpoint

Date: 2026-08-23

## Decision

Phase 294 stops at its replacement data gate before normalized model records,
TF-IDF, retrieval, NLL, wrong-description scoring, or generation. Removing the
overconnected owner/description hub and excluding cross-partition edit-one
records produces a clean split, but fewer than the frozen 5,000 evaluation
items remain in each partition.

The minimum was not changed after seeing the counts.

## Frozen identity

- Protocol SHA-256:
  `a612525652671bcb7979f2b3494ec76794d83eac0cfcece9e58041981e4c90d3`.
- Preparation implementation SHA-256:
  `6b01b69f705c24e494d765135b85b2558b1056135a8a5dfd79b76c39fcf8bb8c`.
- Data report SHA-256:
  `6f916e1672860e504b73fc42526995ccd505b40f732d8c42f546e40ad20725d9`.

## Data result

| Gate | Required | Observed | Result |
|---|---:|---:|---|
| Hub exclusion | <=10% | 4,401/64,681 = 6.80% | PASS |
| Largest retained owner/description component | <=2% | 102 = 0.16% | PASS |
| Cross-partition exact/edit-one leakage | 0 | 0 | PASS |
| Final total | >=50,000 | 54,836 | PASS |
| Canonical brief coverage | 35/35 | 35/35 | PASS |
| Clean validation / test | >=5,000 each | **3,290 / 3,322** | **FAIL** |

The preliminary 6,013/6,043 validation/test records lost 2,723/2,721 names to
the frozen edit-one exclusion. All 48,224 train records remained intact.

## Interpretation and next boundary

The leakage design is now mechanically sound; the remaining failure is sample-
size policy, not a broken component graph. The original model protocol already
uses only 2,000 items for its binomial condition diagnostic. A distinct
pre-model power/precision audit may determine whether 3,000 clean items per
partition are sufficient for the declared 65% condition gate and paired NLL
analysis. That audit must be mathematical and frozen before any model outcome;
it cannot simply choose 3,290 because that is what survived.

Production and the sealed model path remain untouched.
