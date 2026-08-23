# Fixed ordinal-valence scorer: external negative checkpoint

Date: 2026-08-23

## Decision

The Phase-285 form scorer does not advance to engine-candidate reranking or a
blind naming study. On an untouched Spanish pseudoword source, the controlled
effect and both permutation tests passed, but the primary raw Spearman was
`0.0954`, below the frozen `0.10` threshold. The threshold remains unchanged.

No Spanish outcome was used to fit or alter the scorer. No model is connected
to production, WASM, web code, storage, or taste.

## Source and eligibility

- Source article: Martínez-Tomás et al., *When the meaningless make sense:
  Wordlikeness and affective norms for 4,800 pseudowords and 1,200 Spanish
  words*, DOI `10.3758/s13428-026-02976-4`, CC BY 4.0.
- Public OSF node: `baues`. Its license relationship metadata was empty, so raw
  files remain local and ignored.
- Only source condition `e` was used: pseudo-root plus pseudo-suffix. This is
  the declared condition containing neither a real Spanish root nor a real
  suffix.
- 1,125 distinct lowercase ASCII `[a-z]{4,12}` items survived unchanged; each
  has at least 25 human valence ratings and 25 wordlikeness ratings.
- Base-word valence and item wordlikeness were included only as controls, never
  as model inputs.

## Frozen identity

- Protocol SHA-256:
  `0749ed0555ea668b735b323f04a126dde8cc2a484f290e8ddb85a5863e762428`
- Refresh script SHA-256:
  `b121fb124fbbd884822e9d2ba76378be97a4104ba32f17fadc44300e9b86941b`
- Executed evaluator SHA-256:
  `6af6ac88832e0f4b3aa8d3ea7c335f00ec22f089805679b65fab79952f2f180f`
- Snapshot manifest SHA-256:
  `488d32568ed8131ad052bf13148bdb20ebded3faed1c292ab63103fdb30235c3`
- Source valence CSV SHA-256:
  `afea12a9bc3050736aa73f7dba4818dbba198b6f0fbbedb7f6ad89255ceabc9c`
- Source wordlikeness CSV SHA-256:
  `5e7d0cc77964644c838a734b1ef67fe60b14269c692f44ee36c7bd0b0c2fd066`
- Fixed Phase-285 coefficients SHA-256:
  `51bc0f3bcdbc5692f378577a7e74a8392ecde15fc9ba3812ad7ea581ed7e13fd`

Two clean CPU evaluations were byte-identical:

- normalized records:
  `022d4788947946b024ac481a0097766012c7ba45e734f79f24312dca57c4a646`
- report:
  `98464888f6c65e907670ba07845ae6e19adb1e702ea27d01c1f284a81a9863d4`

## External gates

| Gate | Required | Observed | Result |
|---|---:|---:|---|
| Raw Spearman | >=0.10 | **0.0954** | **FAIL** |
| Raw permutation p | <=0.01 | 0.0010 | PASS |
| Controlled partial Spearman | >=0.08 | 0.0904 | PASS |
| Controlled permutation p | <=0.01 | 0.0010 | PASS |
| Required length buckets positive | yes | yes | PASS |

The `8-12` bucket contains 931 items and has raw/controlled correlations
`0.0800/0.0728`, both positive. The `4-7` bucket contains only 194 items and was
therefore descriptive; its correlations are `0.1244/0.1184`.

## Interpretation

The signal is unlikely to be random and does not disappear after controlling
for wordlikeness and source-word valence. Its cross-language effect is still
too small for the predeclared application gate. A `0.095` post-hoc threshold or
selection from the better short-word bucket would be outcome-driven tuning.

Together with Phase 285, this narrows the remaining non-LLM route: learn an
ordinal preference function prospectively on actual engine candidates and
evaluate it on new brief-disjoint human choices. Public pseudoword valence is a
useful prior, but not strong enough by itself to justify reranking product
names.
