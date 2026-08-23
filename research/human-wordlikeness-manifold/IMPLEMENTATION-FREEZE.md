# Phase 291 implementation freeze

Date: 2026-08-23

The implementation compiled successfully, but no product-manifold score,
Markov score, selected neighbor count, human correlation, or permutation result
had been computed when this checkpoint was written.

## Frozen identities

- Protocol SHA-256:
  `7efeae5132310cbe321b25f9a249351edc25c1354b7e765425db8adae9d358dd`
- Initial runner SHA-256:
  `03b09da49ae98d2ad3804595f053bdb36793410bc3a6d2a5cabc36c09743c8b0`
- Final pre-result-correction runner SHA-256:
  `4bc7cfc61f57bfe75e3cc3aaa4f076cd64f60e887dfa16109f150a5cbc74a950`
- Final refresh implementation SHA-256:
  `e145c9db6eb524704d05975015be8ef65052c77a19ae6606b9d8861db4abf7a3`
- Product dataset SHA-256:
  `dd4b7b977ea62aea570f7ec5b9941ca06174fd7cbb882a39ffbd2183f488d9d6`
- PseudoLex CSV SHA-256:
  `70f4e7a92fc300ba609013a172db18fe04e44855b2162313ce2b8c57b7000289`

`run.py` uses only the Python 3 standard library. It validates both source
hashes and all frozen cardinality constraints before computing scores. The
first pass ignores the rating field, the second aggregates only non-test
ratings, and a validation failure exits before test ratings are aggregated.
Output JSON is canonical and the runner refuses a non-empty output directory.

Any correction to `run.py` after the first human correlation becomes visible
ends this experiment; it does not silently replace this implementation.

The initial attempt stopped on a source-column semantic mismatch before any
score or rating was read. `PRE-RESULT-CORRECTION.md` records the outcome-free
correction and the final hash above was frozen before retrying.
