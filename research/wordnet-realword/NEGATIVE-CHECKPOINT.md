# Exact-keyword WordNet preflight: negative checkpoint

Date: 2026-08-23

## Decision

The exact-production-keyword WordNet route stops before Rust selection,
held-out evaluation, production shadowing, or human testing. All 35 briefs have
at least one supported keyword, but the development brief `a code formatter
and linter` exposes only 36 graph candidates before collision, semantic-root,
and quality filters. The frozen gate requires at least 40 eligible candidates.

No threshold, traversal depth, morphology rule, or partition was changed after
this result. The one-off builder was removed after deterministic evidence was
captured.

## Frozen evidence

- Executed protocol SHA-256:
  `6991a946b7981bddbbd17b0949d32b5acbe575c7cc06710206b0bf37707cbbf4`
- WordNet 3.0 ZIP SHA-256:
  `cbda5ea6eef7f36a97a43d4a75f85e07fccbb4f23657d27b4ccbc93e2646ab59`
- Candidate output SHA-256, reproduced byte-for-byte twice:
  `5e8c2043e837dc41d81ef146f9db51d641b081493bae4bfbbe3a6eb7eadac85b`
- Brief support: 35/35
- Candidate range before downstream filters: 36–300
- Failing development brief keywords: `code`, `formatter`, `linter`
- WordNet-supported keyword: `code` only

## Interpretation

WordNet itself is usable, deterministic, local, and properly licensed for the
experiment. The failure is the interface between product jargon and the
lexical graph: WordNet 3.0 does not supply direct `formatter` or `linter`
lemmas, while the frozen protocol prohibited any undeclared stemming or
production concept expansion.

The next eligible preflight may explicitly use the engine's existing
transparent `brand_root_groups` as graph seeds. That is a new declared input,
not a post-hoc relaxation of this checkpoint. It must keep the same
development/held-out partition and all downstream quality, diversity,
collision, semantic-contrast, and deterministic gates.
