# Phase 288 source-unavailable checkpoint

Date: 2026-08-23

## Decision

The predeclared eight-domain mechanism experiment cannot open. The publication
states that stimuli, rating data, and scripts are available at OSF node
`hdm7w`, but an explicit inventory-only refresh received HTTP 401 from the
official node endpoint and HTTP 404 from the official registration endpoint.
No filename, byte size, license field, source file, or human outcome was
returned.

The frozen minimum requires 500 item-level records in all eight domains. Paper
tables and aggregate correlations cannot substitute for those records, and the
gate will not be weakened to a subset after this access result. No model was
fit and no production or Phase-287 protocol changed.

## Reproducibility

- Frozen protocol SHA-256:
  `1d5c6b53410474fe29d6b66a45faa450bb11e85cafcf21130dff59a131bcd44a`
- Corrected inventory implementation SHA-256:
  `97d6549cd50bf3789dff5f3ae30db78e2d6026474c61d6087ad417e85e2a8b02`
- Command:
  `refresh.py --refresh --out research/phonosemantic-iconicity/source`
- Result:
  `OSF source is not publicly readable: nodes:401, registrations:404`

A separate experiment may use the earlier, independently public shape-rating
source. It must freeze a shape-specific hypothesis and an external transfer
gate rather than presenting one domain as the unavailable eight-domain study.
