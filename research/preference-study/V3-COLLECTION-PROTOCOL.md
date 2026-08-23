# Pairwise preference collection protocol v3

V3 preserves v2's exact deterministic raw 24-name production pool and every
study/split/repeat boundary. Its only new declared distinction is between raw
pool identity and pair eligibility.

- The raw pool must contain exactly 24 unique ASCII names and reproduce in full
  byte-for-byte. No retry, substitution, exclusion continuation, or hidden
  candidate request is allowed.
- A name enters the pairing graph only when its frozen mechanical composite is
  at least 75. The source records every raw `NameResult` and the eligible count.
- Each brief must retain at least 16 eligible names and five disjoint pairs with
  endpoint composite difference <=2. Failure of either gate stops the source.
- No sub-75 name may appear in the blind study. All other Phase-281 protocol,
  offline collector, split, decision, and future ranker gates remain unchanged.
