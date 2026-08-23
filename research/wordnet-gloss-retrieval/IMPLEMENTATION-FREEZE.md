# Phase 296 implementation freeze

Date frozen: 2026-08-23

This file was written before parsing the WordNet source or inspecting any data,
retrieval, NLL, condition-contrast, or bootstrap outcome from Phase 296.

- Protocol commit: `37d0b4a` (`Freeze WordNet gloss retrieval probe`).
- Protocol SHA-256:
  `55b0f32b8969f6ecc6c5f4568fa8b175887080795836572f480dba956291e59e`.
- Evaluator: `evaluate.py`.
- Evaluator SHA-256:
  `d56661d6843edc4c50f1794dfd696f3aada1c41bbbc1699e0e64e5ba4be5b5b4`.
- Required source SHA-256:
  `cbda5ea6eef7f36a97a43d4a75f85e07fccbb4f23657d27b4ccbc93e2646ab59`.
- Runtime: the available Python 3 interpreter, standard library only; no
  package installation and no network access.

Before this freeze, syntax parsing and narrow invariants for exact/edit-one
classification, transposition rejection, WordNet line parsing, stopword
removal, and adjacent-bigram construction passed. These tests did not load the
WordNet ZIP or reveal an experiment outcome.

The first execution must write to a clean ignored directory. If validation
fails, the evaluator must exit without `test-report.json`, test retrieval, or
test score artifacts. No parameter or threshold may be changed after that
first result.
