# Phase 295 data-gate pass

Date: 2026-08-23

The powered successor data gate passed before any TF-IDF, retrieval, character
model, NLL, condition comparison, or hyperparameter result was computed.

- Initial eligible records: `64,681`.
- Excluded owner/description hub: `4,401` records (`6.80%`).
- Largest retained component: `102` (`0.16%`).
- Preliminary train/validation/test: `48,224 / 6,013 / 6,043`.
- Edit-one exclusions from validation/test: `2,723 / 2,721`.
- Final train/validation/sealed test: `48,224 / 3,290 / 3,322`.
- Final total: `54,836`.
- Cross-partition exact/edit-one leakage: zero.
- Canonical brief train-vocabulary coverage: `35/35`.
- Data report SHA-256:
  `2c8888dd3f56776a1dd9ef48e92e8e321c6651b18f42570674da080a26a609ab`.
- Normalized records SHA-256:
  `daec41e23fbafa817c8fc3e3882d2dc0f45af5e50166e0a9cb85355a619f0d0f`.
- Normalized gzip bytes: `5,204,377`.
- Manifest SHA-256:
  `f17254121979f8717bab7f7e8ce982fd55cd8326b4b1e728fea32d2f9952d4e5`.

Two clean preparations reproduced all three files byte-for-byte. The records
remain ignored under the source's unresolved content-license boundary.
