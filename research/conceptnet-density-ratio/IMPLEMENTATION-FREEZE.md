# Phase 301 implementation freeze

Date frozen: 2026-08-23

This file was written before any background-anchor likelihood, density lift,
eligible-pool count, new page, or Phase 301 gate outcome was generated.

- Protocol commit: `02864f4`.
- Protocol SHA-256:
  `17b36d77221d490b7d0b082a224c2cf72ae2adc6735c4b9a60a320467cc820a6`.
- Evaluator SHA-256:
  `3c6b1ed3b374e1d104a843986c86804dbe5df170fdbbabe989cb30aac97e4fd7`.
- Frozen Phase 300 development report SHA-256:
  `8140a0b00f83e3cc3607fa7b4fe097ad61d790a46fe6c9d3ab14a05e97e4bde0`.
- Phase 298 anchor SHA-256:
  `ff207ad1570356b1a820726dc6c6dc980826425bd40e440ce4dac0d0f4788e55`.
- Runtime: Python 3.12 standard library only, offline.

Before this freeze, Python syntax and narrow deterministic character-model,
edit-distance, similarity, and diversity invariants passed. The evaluator did
not load either frozen experiment artifact in those checks.

The first execution must write to an empty ignored directory. No positive-lift
eligibility rule, background weighting, relevance weight, MMR setting, lane
cap, or gate may change after its report is inspected.
