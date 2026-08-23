# Quality-filtered single-call source v3: negative checkpoint

Date: 2026-08-23

V3 records the exact raw 24-name pool and admits only >=75 names to pairing.
The first two briefs pass, but `p03` returns only 13 names for a requested 24.
The exact-count gate fails at progress 2/30 before pairs or a study are written.

- Canonical resolved v3 protocol SHA-256:
  `4fe313a9f25c4a1a365586c4e2d670a2a4551a645b1d8650e544d22e85f092e9`
- Failure: `Expected 24 names, received 13.`
- Network/model/taste calls: 0
- Complete source cases retained: 0; the incomplete in-memory run was discarded

This rejects large single-call Auto pooling for preference data. A new protocol
may model a bounded rolling session with ten-name page calls, distinct declared
seeds, and accumulated exact exclusions. It must replay every page and the
whole session exactly and may not retry opportunistically by output quality.
