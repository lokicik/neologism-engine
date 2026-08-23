# Real preference collection: pairwise learner negative checkpoint

Date: 2026-08-24

## Decision

The completed 174-choice collection is valid and complete, but it is not
eligible for the prospectively frozen Phase 290 grouped-CV Bradley-Terry
learner. The fitter rejects it at the first repeat-consistency gate. No model,
coefficient, prediction, shadow reranker, or production change was produced.

The user's broad dissatisfaction is directly represented in the data rather
than inferred from a comment: 77 of 150 primary pairs selected `Neither`, and
only 73 primary comparisons were decisive.

## Frozen identity and reproduction

- Collection SHA-256:
  `031f4d75a416dedfd853116b4bca1833e384422e3691a0403f2431d5d6628f25`.
- Frozen grouped-CV fitter SHA-256:
  `26a66b823a2ed8e36305aa7bc3820c5a9c2e1ff6e6123ef2729f4b3494284075`.
- Descriptive protocol / implementation commits:
  `2a1a317` / `641f856`.
- Descriptive report SHA-256, reproduced byte-for-byte twice:
  `7bb7d432f5d4ba1ef05c6043205dff4a2bae9d5b0cbc759940a3a1abaef041fa`.

## Frozen collection gates

- Ordered tasks: `150` primary + `24` concealed side-reversed repeats.
- Primary decisions: `33` left, `40` right, `77` neither.
- Decisive primary counts: train/validation/test `51/10/12 = 73`, below the
  frozen `80/20/20 = 120` minimum.
- Consistent repeats: `13/24`, below the frozen `20/24` minimum.
- Repeat mismatches: seven neither-to-decisive, three decisive-to-neither, and
  one opposite-name choice.
- The frozen fitter fails closed with `repeat consistency gate failed` before
  fitting.

## Descriptive findings, not model evidence

- All 30 briefs are represented. Twenty-eight have at least one decisive
  primary, 29 have at least one neither pair, and 27 contain both outcomes.
- Two briefs rejected all five pairs: oral-history consent tracking and bakery
  production planning. Five additional briefs rejected four of five pairs.
- Brandable/compound pairs were rejected `63/116 = 54.31%`; brandable-only
  pairs were rejected `14/31 = 45.16%`.
- Among 73 decisive primaries, the chosen candidate had exactly the same
  composite as the unchosen candidate in 67 cases. Higher composite won only
  three times and lower composite also won three times.
- Chosen candidates were shorter by `0.534` characters and `0.247` syllables
  on average, with memorability `+3.836`, novelty `-2.192`, and
  pronounceability `-1.288`. These are descriptive correlations only.

## Interpretation and next boundary

The collection does not support learning a stable relative preference order.
Its strongest signal is absolute rejection: for more than half of primary
pairs, neither candidate was acceptable. Most repeat disagreement crosses the
neither boundary rather than reversing from one name to the other.

Do not lower the existing pairwise gates or treat neither as a random left/right
label. A separately frozen exploratory non-LLM route may instead learn an
absolute acceptability rejector: chosen names are positive, both names in a
neither pair are negative, and unchosen names from decisive pairs remain
ambiguous and excluded. Any such model is post-outcome hypothesis generation
and must pass a new untouched human study before production consideration.
