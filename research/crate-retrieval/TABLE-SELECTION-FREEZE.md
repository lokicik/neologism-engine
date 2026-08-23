# Phase 293 table-selection freeze

Date: 2026-08-23

The official archive was downloaded and only member names, byte sizes, and its
included README were inspected. No CSV header, row, crate name, description,
owner, keyword, category, eligibility count, retrieval result, or model metric
was visible before this selection.

## Frozen archive

- Archive SHA-256:
  `fecb5cc2ea7eae450c53051ffc104506d22eea7336203afee7a22fe39620647c`
- Compressed bytes: `1,763,902,984`.
- Dump directory: `2026-08-23-020023`.
- Members: `23`.
- Included README describes the archive as a dump of public crates.io database
  information and documents owner-kind identity, but declares no content
  license.

## Frozen table subset

Extract exactly these six tables:

- `data/crates.csv`
- `data/crate_owners.csv`
- `data/keywords.csv`
- `data/crates_keywords.csv`
- `data/categories.csv`
- `data/crates_categories.csv`

Only these tables may contribute model records. `crate_downloads`, versions,
version downloads, dependencies, users, teams, OAuth data, deleted crates, and
reserved-name tables are excluded. User/team display data is unnecessary:
the documented `(owner_kind, owner_id)` pair is sufficient for grouping.

Keywords and categories are included as explicit condition terms only through
their relation tables. They never become target-name evidence or popularity
weights.
