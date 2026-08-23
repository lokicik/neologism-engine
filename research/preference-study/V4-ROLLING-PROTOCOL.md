# Rolling-session preference source v4

V4 replaces the failed large single-call pool with a bounded deterministic
continuation session.

- Each brief requests up to four ten-name Auto pages. Page `i` uses
  `(base_seed + i * 2654435769) mod 2^32` and exact exclusions containing every
  previously returned name in that session.
- Stop after accumulating the first 24 unique names. An empty/duplicate page or
  failure to reach 24 within four pages closes the protocol.
- Run the entire session twice from an empty exclusion list. Every ordered page,
  seed, exclusion input, result record, and final 24-name prefix must be
  byte-identical.
- Record all generated page records in the owner source. Pair eligibility and
  all v3 quality, pairing, split, repeat, offline, and future-ranker gates remain
  unchanged.

This bounded session is declared before v4 output inspection and mirrors the
product's actual continuation principle: a fresh per-click seed plus names the
user already saw in exact exclusion history.
