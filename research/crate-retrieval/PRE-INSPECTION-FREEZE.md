# Phase 293 pre-inspection freeze

Date: 2026-08-23

The protocol was frozen before downloading or inspecting the database-dump
archive or any package name/description outcome.

Only HTTP metadata was inspected beforehand:

- URL: `https://static.crates.io/db-dump.tar.gz`
- status: `200`
- content length: `1,763,902,984` bytes
- last modified: `Sun, 23 Aug 2026 02:06:17 GMT`
- ETag: `f8a6f218316c7fd2ce13a31ec7a94493-169`
- content type: `application/gzip`
- range support: `bytes`

The official policy and repository documentation were inspected for the data
access route and unstable-schema warning. No archive member, table schema,
description, crate name, owner relation, eligibility count, retrieval result,
or model metric was visible before this checkpoint.

- Frozen protocol SHA-256:
  `df4c3388ed2e72d881b78abea2dcb4efa9bff8651d36fbd4842660191e4b7dde`
- Frozen refresh implementation SHA-256:
  `4b957878f7e675a6a579b42999d07461616281c7fc92542ff4ca4fd7ba277c42`
