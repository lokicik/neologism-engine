# Phase 295 evaluation-size audit result

Date: 2026-08-23

The pre-model mathematical audit passes and authorizes a round minimum of 3,000
clean validation and test records. No crates.io row or model outcome was read by
the audit.

- Worst-case 95% Wilson interval at `n=2,000`: `0.47811–0.52189`, half-width
  `0.02189`.
- 65% condition gate interval at `n=2,000`: `0.62883–0.67060`.
- Exact one-sided probability of at least `1,300/2,000` under a 50% null:
  `8.14675e-42`.
- 95% retrieval-coverage interval at `2,850/3,000`: `0.94161–0.95724`,
  half-width `0.00782`.
- A 3,000-item partition contains the fixed 2,000-item diagnostic plus 50%
  reserve.

All five frozen audit gates passed. Phase 295 must retain the stronger
component-bootstrap NLL confidence gate declared in the audit protocol.
