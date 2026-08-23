# Phase 295 model implementation freeze

Date: 2026-08-23

The evaluator compiled, but no source retrieval, NLL, condition comparison,
bootstrap, selected pair, or sealed metric existed at this checkpoint.

- Phase 295 protocol SHA-256:
  `59ab3e066bfb79e61b6613886e4b6256c130c647cb7dfa6b950e9cd93c2c9ffd`
- Model-detail freeze SHA-256:
  `fa8a40152879750b1f522ea5a25ecf9c9d00d16571b1893301ebdf67d02c73d3`
- Evaluator SHA-256:
  `7b252441852f3e1c2199be096e2b23fcbbd3e314b3bf3760de0501ca93184afc`
- Normalized records SHA-256:
  `daec41e23fbafa817c8fc3e3882d2dc0f45af5e50166e0a9cb85355a619f0d0f`

The evaluator uses only the Python 3 standard library, refuses non-empty
output, writes deterministic gzip, and exits before any test retrieval when a
validation gate fails. Any post-result correction closes the experiment.
