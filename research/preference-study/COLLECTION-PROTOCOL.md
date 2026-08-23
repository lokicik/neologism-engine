# Pairwise preference collection protocol v2

This protocol replaces only the failed 30-name source-capacity assumption in
the archived v1 preflight. The architecture, briefs, pairs per brief, quality
matching, split, repeats, offline collector, and future ranker gates are
unchanged.

- Pool size is declared as 24 before v2 execution. The earlier Phase-270 study
  already uses 24; five disjoint pairs consume ten and leave fourteen names.
- Briefs are loaded from the frozen Phase-270 source at raw-file SHA-256
  `55fd0a4b95068f7b8df8711f830a607d7f74f59645d9836b5ea98fe2ad127f56`.
  The resolved canonical protocol hash includes those exact 30 brief objects.
- Every pool still runs twice and must match byte-for-byte, contain 24 unique
  ASCII names, and keep every composite at or above 75.
- Five disjoint within-two-quality-point pairs remain mandatory for every
  brief. Any capacity failure stops v2 rather than reducing pair count or
  widening the score gap.
- All remaining boundaries and gates in `PROTOCOL.md` apply unchanged.
