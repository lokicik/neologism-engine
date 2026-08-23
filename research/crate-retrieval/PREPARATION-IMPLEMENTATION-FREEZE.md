# Phase 293 preparation implementation freeze

Date: 2026-08-23

The normalizer compiled, but no CSV data row or derived count had been read
when this checkpoint was written.

- Normalization freeze SHA-256:
  `22343c87690479c7c786af4e041a43d80b7e2c2f539183b0bf840f06edaa82c7`
- Preparation implementation SHA-256:
  `0ea98495787c565eb7263580028b93c9f6b61643262b6731577f0c4a4ecb2d8b`

The implementation verifies all table hashes and exact headers, streams the
one-gigabyte crate table, constructs all frozen leakage edges, checks every
data gate, and exits before emitting model records if any gate fails.

Any correction after a derived source count becomes visible closes this data
preflight rather than silently changing eligibility or split rules.
