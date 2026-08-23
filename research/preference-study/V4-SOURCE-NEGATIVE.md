# Rolling Auto source v4: negative checkpoint

Date: 2026-08-23

V4 replaces large single calls with four deterministic ten-name continuation
pages and accumulated exact exclusions. `p01` and `p02` pass, but `p03` reaches
only 17 unique names before the four-page bound. It fails at progress 2/30.

- Canonical resolved v4 protocol SHA-256:
  `d9a8e9af4530b1e083ad6406e0aee39da11c5d064af5720307ae89ca0ab8a8cf`
- Failure: `Expected 24 names, received 17.`
- Network/model/taste calls: 0
- Study/key/human result: none

This rejects Auto-only continuation as the source for a broad preference
ranker. A distinct pool may call a fixed set of existing production generation
lanes once each and combine them deterministically. That tests selection across
architectures rather than repeatedly exhausting the same Auto surface.
