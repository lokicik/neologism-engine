# Prospective preference learner: fitter-ready checkpoint

Date: 2026-08-23

## Decision

The transparent preference fitter is frozen and ready to consume the blind
collector export. It has not seen a human choice, produced a fitted model, or
changed production behavior.

## Frozen identity

- Model protocol SHA-256:
  `4c6e0e0e9a6db6a003e1bb736faa637905abd597ea71002e1ba7e19cccfd4e47`
- Fitter implementation SHA-256:
  `f269661c7ef0bc2257dbb02b4b2cd63a4a3d803c6e49899944f4ef8e5ebadb14`
- Source canonical payload SHA-256:
  `a763cbaa45ad49e592b88c78d09c96907f7492d9bafab3f3b869209cafb9e02a`
- Collector protocol canonical payload SHA-256:
  `4d4055e1fe14d7def396a5f94b4feb0b82f1bd95b6ee0a82bf20dcb4de8cdc74`

## Verification

- Python bytecode compilation passes in the bundled isolated Python runtime.
- The fitter exposes exactly 21 frozen transparent features.
- A mathematical IRLS smoke case converges in four iterations with zero final
  gradient infinity norm and 100% training accuracy.
- An empty collection fails closed with an explicit missing-protocol-fields
  error.
- An in-memory synthetic structural check, never written as human evidence,
  reconstructs all 174 frozen tasks and recomputes 24/24 consistent repeats
  plus decisive counts 100/25/25. Its source and protocol hashes match the
  collector declarations.

Actual validation and sealed-test metrics remain unavailable until the human
collector export exists. Synthetic choices are not training evidence and were
not retained.
