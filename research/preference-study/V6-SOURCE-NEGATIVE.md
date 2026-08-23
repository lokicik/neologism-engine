# Phase 281 v6 source preflight: negative checkpoint

The expanded fixed-size source failed before quality pairing, so no preference
study was packaged from v6.

- Raw override SHA-256:
  `cb69f0f49840865dbd607474e23e422f8ad0aff5dbee6521402f18226f9f0947`
- Resolved protocol SHA-256:
  `ab2876789865e2196b769e403018ee3faf3c95f2c2f8566eb4658b9215c33b3f`
- Deterministic preflight progress: 3 of 30 briefs.
- First failing brief: `p04`.
- Failure: the five frozen lanes yielded only 29 unique names, below the fixed
  32-name target.

No count, quality, or pairing threshold was changed after seeing this result.
The failure shows that a fixed prefix length is not a valid invariant for the
variable-output production lanes. There is no v6 source artifact, evaluator
key, human result, or product claim.
