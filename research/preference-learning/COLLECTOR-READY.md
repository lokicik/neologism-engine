# Prospective preference learner: collector-ready checkpoint

Date: 2026-08-23

## Decision

The immutable blind collector is ready for prospective human decisions. It
contains 150 primary same-brief comparisons and 24 concealed side-reversed
repeats. It exposes no engine metric, lane, construction, source rank, or model
prediction.

No choice was made during verification. There is no collection export, fitted
model, accuracy result, or production change.

## Frozen identity

- Source payload SHA-256:
  `a763cbaa45ad49e592b88c78d09c96907f7492d9bafab3f3b869209cafb9e02a`
- Valid downloaded source JSON SHA-256, including its trailing LF:
  `debb789365ca2b2eff334662e5325c00a5a9ea32cda9b5f3d6e433b83676803e`
- Collector protocol file SHA-256:
  `ee0c8d96484740c1d332abb5cbc249925b2ed2c1cc4ff3d9fcf113fc19428bb0`
- Collector protocol canonical payload SHA-256:
  `4d4055e1fe14d7def396a5f94b4feb0b82f1bd95b6ee0a82bf20dcb4de8cdc74`
- Collector implementation SHA-256:
  `873f0cb7fb17a67275d903fe60762eab26d69d73e22676cc16ceecd13cd9d496`
- Collector stylesheet SHA-256:
  `7c439ffed93007ea4556f680742ac3d4f3798310eb1c23871d698505879342fc`
- Collector Vite configuration SHA-256:
  `3d887289b0904ff9bfd4aec66c2867896f2f5fda8b4c90cc0ff48997b159f939`
- Ordered 174-task manifest SHA-256:
  `f9cb349d3b5a3ef4c205e04d4e85b7dcb39919888a5975bb950f9bbbc3bf6c72`

## Verification

- TypeScript strict checks pass for both source recruitment and collector.
- The collector production build succeeds with the frozen 978,229-byte source
  embedded only in the ignored research bundle.
- Browser inspection opens at task `primary:r050-03`, matching the independent
  task-manifest reconstruction: `Beaconflux` versus `LocalItem` for the tree
  nursery brief.
- Desktop and 390x844 mobile layouts keep both names, brief, progress, and
  `Neither` control visible; browser console has zero warnings/errors.
- Task construction independently reproduces 150 primaries, 24 repeats, and
  174 total tasks. Source and collector-protocol canonical hashes match the
  frozen declarations.

The collector resumes only when the local record carries the exact source and
collector protocol hashes. It validates repeat consistency and decisive counts
only after all 174 decisions, then exports an immutable local JSON. It does not
preview or fit the Bradley-Terry model.
