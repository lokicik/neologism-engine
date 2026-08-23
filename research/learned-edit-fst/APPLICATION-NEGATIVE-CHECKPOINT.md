# Learned-edit WordNet application: negative checkpoint

Date: 2026-08-23

## Decision

The frozen 13-rule edit transducer passes every development gate but fails a
sealed held-out semantic concept-coverage gate. It stops before production
shadowing or human preference work. No held-out-driven selector repair or
weight change is allowed.

The Phase-279 train-data sufficiency pass remains valid and reproducible; this
checkpoint rejects its tested WordNet application and selector. The temporary
application builder and Rust helpers were removed.

## Frozen identities

- Application protocol SHA-256:
  `e21ee69269f1fbed0c44e682f3eb0f80f13a1223d02e7e0cdcfe691da540d190`
- Rule report SHA-256:
  `071d3f3ad90be53ad99952bf387c90a9125c01144051bca98c067e704d58f588`
- Candidate artifact SHA-256, reproduced twice:
  `c56b6ee0f35512f7e4cbd9b4e4aa4c0282d88be420977cda8858f381b403af1f`
- Development report SHA-256, reproduced twice:
  `5cb1bb9c3b6df4358584ec9220b46c16032be6546f0fdd0d75c35c2751dc93d6`
- Held-out report SHA-256, reproduced twice:
  `3865daf7c23a531b3d708a5b14f13634bab90d8e89058556f000304af0d362f1`

## Development result

All 72 development pages and all frozen gates passed:

- 720/720 cards; minimum eligible pool 140
- average quality `88.06`
- average/minimum ILAD `0.9205 / 0.8717`
- average/maximum cross-seed overlap `0 / 0`
- 72/72 unique page sets and >=27/30 names per brief
- true-anchor score wins against nine wrong briefs `95.43%`
- zero lexical hazards; edit traces, rule caps, and concept coverage all pass
- same-process and two-fresh-process output is byte-identical

## Sealed failure

The 33 held-out pages remain mechanically strong (330/330 cards, average
quality `88.40`, average/minimum ILAD `0.9168/0.8739`, zero overlap, zero
hazards, `95.52%` anchor contrast), but one frozen gate fails.

For `a personal budget and expense tracker`, seed 313 has eligible outputs from
two semantic concept groups but selects all ten cards from group 0. The page
includes `Totaly`, `Ecount`, `Provida`, `Answerr`, `Gaino`, `Dollaro`, and
`Icancel`. Retuning or hard-coding group reservation after seeing this sealed
brief would invalidate the evaluation.

## Interpretation

The failure is not merely one selector bit. Many high-scoring outputs still
look mechanically decorated (`Mmode`, `Ilimit`, `Glorys`, `Totaly`) rather than
like strong intentional names. The train-derived edit inventory is real, but
its support mostly captures shallow product-name orthography, including plural
and single-letter affix patterns. Current quality metrics reward pronounceable
edit-one forms and cannot recognize that weakness.

This architecture therefore does not advance to a shadow hybrid. A future
non-LLM route needs a stronger aesthetic supervision signal or a structure that
does not reduce naming style to one-character decoration; the passing Phase-279
rule miner remains research evidence, not a production dependency.
