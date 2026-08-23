# Phase 288 pre-inspection freeze

Date: 2026-08-23

No OSF filename, size, license field, or human outcome from node `hdm7w` was
inspected before this checkpoint.

- Protocol SHA-256:
  `1d5c6b53410474fe29d6b66a45faa450bb11e85cafcf21130dff59a131bcd44a`
- Explicit refresh implementation SHA-256:
  `97d6549cd50bf3789dff5f3ae30db78e2d6026474c61d6087ad417e85e2a8b02`
- Source node: `hdm7w`
- Article DOI: `10.1121/10.0041768`

The first permitted network action is an inventory-only invocation with no
`--download` argument. Exact source files must be declared after inventory and
before their contents are downloaded or opened.

The initial refresh implementation attempted only the OSF node endpoint and
received HTTP 401 before any metadata was returned. The hash above is the
pre-inspection correction that tries the official node and registration
endpoints, accepting only a publicly readable response.
