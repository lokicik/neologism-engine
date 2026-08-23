# Grouped-CV preference learner: fitter-ready checkpoint

Date: 2026-08-23

## Decision

The Phase-290 grouped out-of-fold Bradley-Terry fitter is frozen and ready for
the existing blind collector export. It replaces only the underpowered fixed
20/5/5 model evaluation; the 174 tasks, source, collector, features, repeat
gate, and product boundary are unchanged.

The fitter validates the original collection contract, excludes the single
pre-outcome exact-zero feature pair from predictive evidence, and requires at
least 119 decisive scorable comparisons with at least three in every brief.
Six outer five-brief folds produce prospective out-of-fold predictions; each
outer model selects regularization through a five-fold grouped inner loop.

## Frozen identity

- Grouped-CV protocol SHA-256:
  `b3d3be2064a0bd536a88be52dc90effb3cf0f1f9187912a85f25f401d91eb5c7`
- Grouped-CV fitter SHA-256:
  `26a66b823a2ed8e36305aa7bc3820c5a9c2e1ff6e6123ef2729f4b3494284075`
- Source canonical payload SHA-256:
  `a763cbaa45ad49e592b88c78d09c96907f7492d9bafab3f3b869209cafb9e02a`
- Existing collector protocol canonical payload SHA-256:
  `4d4055e1fe14d7def396a5f94b4feb0b82f1bd95b6ee0a82bf20dcb4de8cdc74`

## Mechanical verification

- Python bytecode compilation passes.
- A deterministic in-memory synthetic structural collection reconstructed all
  174 tasks, 24/24 consistent reversals, and 150 decisive primary choices.
  Synthetic choices are not human evidence and remain ignored.
- Two fresh full fitter executions produced byte-identical normalized records,
  report, model, and manifest. Their respective SHA-256 values were
  `e95d62d8912b331bca4031aa7029454d5d6176be36c280f313b83fd6edc0a2cc`,
  `635ad5d1046fad7c0f21bb36686bc8e675f19c129fb9d1636668f9dc481eec08`,
  `88303e8418090715717f9a7b1b12ee7373e7282cba5042094d7192c675664b03`,
  and `ce175f1e8e04f33b5a57986805b48bf1dbb0831293e611622962fce4738ba8a8`.

No real accuracy, baseline uplift, coefficient, better-name claim, reranker,
or production change exists until the human export passes every frozen gate.
