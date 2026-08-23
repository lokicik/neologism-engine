# Frozen application of learned edits to WordNet anchors

This development-only probe is downstream of the passing Phase-279 data
preflight. It remains isolated from every product path and public type.

## Frozen generator

- Rebuild the byte-identical Phase-279 rule report at SHA-256
  `071d3f3ad90be53ad99952bf387c90a9125c01144051bca98c067e704d58f588`.
- Use all 13 eligible rules. No rule may be removed or reweighted because its
  examples or outputs look weak.
- Production `extract_keywords` and `brand_root_groups` provide semantic seeds.
  WordNet source, relations, exception morphology, depth-two traversal, anchor
  vocabulary, and the 24/11 FNV split stay identical to Phase 277.
- Apply a rule only where its exact character edit, position bucket, and
  left/right boundary/vowel/consonant context match. Every output is exactly
  edit-one from one recorded anchor. Do not chain edits or emit an anchor.
- Reject output that is a common/curated word, prompt keyword, graph seed,
  production root, or exact source anchor. Reject exact/edit-one matches against
  the full Phase-268 review inventory and BigTech list.

## Frozen development gates

- All 24 development briefs have at least 40 collision-clean transformed
  candidates and at least 30 after production respell phonotactic, one-to-three
  syllable, bad-substring, and composite-quality >=75 filters.
- Seeds `13/67/313` produce 10/10 pages; every page uses at least three learned
  rules and no rule more than four times. One anchor supplies at most one card
  per page.
- When two or more semantic concept groups have eligible candidates, each page
  represents at least two.
- Partition average quality is >=84.0; mean/minimum page ILAD is
  >=`0.72/0.60`.
- Each brief has >=27 unique names across 30 outputs; seed-page overlap averages
  <=1/10 and never exceeds 3/10; page sets never repeat.
- The chosen anchor's true-brief graph score beats nine deterministic wrong
  briefs in >=70% of comparisons.
- Edit trace, rule support, collision, prompt/root/anchor identity, lexical
  hazard, and single-piece surface checks all pass with zero exceptions.
- Same-process replay and two fresh processes reproduce candidates, rejection
  counters, and ordered pages byte-for-byte.

Any development failure stops before the sealed 11 briefs, shadow hybrid, or
human preference work. Passing is still not evidence that names are better.
