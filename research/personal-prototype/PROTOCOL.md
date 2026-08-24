# Phase 305: personal prototype energy over brief-conditioned whole forms

Date frozen: 2026-08-24

This is an isolated, non-LLM personal naming experiment. It changes neither
production `generate()`, WASM, Auto, web types, storage, taste, nor the public
`NameResult`. Passing mechanical gates cannot establish that names are better;
that requires a new untouched absolute human evaluation.

## Frozen question and interpretation

The user supplied eleven names they genuinely like: `Linear`, `Vercel`,
`Stripe`, `Anthropic`, `OpenAI`, `Perplexity`, `Notion`, `Obsidian`, `Godot`,
`Instagram`, and `Twitch`.

Can an abstract phonographic prototype energy derived only from those explicit
positive anchors steer the already brief-conditioned Phase 303 whole-form
candidate supply without copying an anchor, losing semantic discrimination, or
collapsing mechanical page quality and diversity?

The list is deliberately heterogeneous. It is frozen as three declared style
families rather than being forced into one density model:

- `lexical`: Linear, Stripe, Perplexity, Notion, Obsidian, Twitch
- `coined`: Vercel, Godot
- `derived`: Anthropic, OpenAI, Instagram

These labels describe surface formation only. Brand fame, company category,
meaning, popularity, and commercial success are forbidden inputs. The family
assignment, feature weights, selector weights, and gates below are frozen
before computing a Phase 305 metric or selected page.

## Frozen inputs

- Anchor artifact: `research/personal-prototype/anchors.json`.
- Phase 303 development report SHA-256:
  `fb0e2d53a05210ed314323e31adf2f81fa9d3ab84077eeb059d9eddb46b247a5`.
- Phase 303 sealed report SHA-256:
  `7457f1439be84dfb5f7d3a4891961a5fa81686baf8517671f890fa218243f525`.
- Phase 303 reports are immutable generated traces. Phase 305 uses the first
  120 candidates in recorded acceptance order from each pool. The size is
  fixed from Phase 303's already-known sealed minimum of 137, not from any
  Phase 305 score.
- The background for the anchor-coherence preflight is the immutable Phase 303
  train-name list. Select 256 names by ascending `(FNV-1a-64(name), name)`.
- Network access, product code, sealed-result tuning, human choice outcomes,
  candidate rank, and Phase 303 selected-page membership are forbidden model
  inputs. Existing selected pages are used only as a post-selection baseline.

## Frozen prototype representation

Normalize a name to lowercase ASCII. Map each character to one articulatory
class: vowel `V` (`aeiou`), stop `T` (`bcdgkpt`), fricative `F`
(`fsvxz`), nasal `N` (`mn`), liquid/glide `L` (`lrwy`), or other `O`
(`hjq`). `y` is always a liquid/glide; this avoids a result-driven contextual
rule.

For two names, prototype distance is the weighted sum below, capped to `[0,1]`:

- `0.35` normalized Levenshtein distance between articulatory-class strings;
- `0.20` absolute length difference divided by eight, capped at one;
- `0.15` absolute vowel-run count difference divided by three, capped at one;
- `0.10` absolute vowel-fraction difference;
- `0.10` start-class mismatch;
- `0.05` end-class mismatch;
- `0.05` absolute unique-letter-ratio difference.

Similarity is `1 - distance`. A candidate's score for one family is its maximum
similarity to an anchor in that family. Its `prototype_score` is the maximum of
the three family scores; ties choose `lexical`, then `coined`, then `derived`.
No coefficient or family is fitted.

Before page selection, leave each anchor out in turn and rank its most similar
other anchor among that set plus the 256 background names. At least 7/11 held
anchors must place the other anchor in the top half, and the median fractional
rank must be at most `0.35`. This is only a coherence check; it is not aesthetic
validation.

## Frozen copying and selection rules

- Reject a candidate at Levenshtein distance at most two from any anchor.
- Reject a candidate sharing a four-or-more-letter prefix or suffix with an
  anchor. Interior fragments are not rejected because the style score itself
  never sees literal character n-grams.
- Preserve every inherited Phase 303 hard filter and recorded semantic trace.
- Within each 120-candidate pool, min-max normalize composite quality,
  `global_logp`, `source_margin`, and `prototype_score`. Constant columns
  normalize to one.
- Relevance is `0.40 * quality + 0.15 * global_form + 0.20 * source_margin +
  0.25 * prototype_score`.
- Greedy normalized-edit-distance MMR remains `0.70`; lowercase spelling is the
  final tie-break.
- Preserve Phase 303 source-lane caps of `4/5/10` for three-plus/two/one
  eligible source lanes. No prototype family may occupy more than six cards,
  which forces at least two surface families on every full page.

## Frozen development gates

Run only the 24 Phase 303 development briefs and three seeds first.

- Anchor coherence passes both declared checks.
- Every input pool has at least 120 records; at least 100 remain after the
  anchor-copy guard; all 72 pages contain ten cards.
- Minimum/average composite is at least `75/84.0`; mean/minimum page ILAD is at
  least `0.72/0.60`.
- At least 27 unique names per brief; mean/maximum seed overlap is at most
  `1/3`; duplicate normalized page sets are zero.
- Recorded own-brief likelihood beats the nine wrong briefs for at least 70%
  of cards. Source-lane and prototype-family caps hold.
- Anchor edit-distance and prefix/suffix copy violations, lexical hazards,
  review collisions, source-anchor copies, and form-floor failures remain zero.
- Mean prototype score exceeds Phase 303's original selected-page mean by at
  least `0.03`, and at least 48/72 pages improve. This proves selector effect
  only and is not independent evidence of preference.
- Two fresh executions reproduce normalized anchors, coherence ranks,
  exclusions, pages, report, and manifest byte-for-byte.

Failure records a negative checkpoint and stops. Passing opens the sealed 11
briefs with every rule and threshold unchanged.

## Frozen sealed and human boundary

Sealed evaluation repeats the capacity, page, quality, diversity, semantic,
copy, family, prototype-effect, and deterministic gates over 33 pages. No
development or sealed result may change a feature, weight, threshold, cap, or
anchor.

Passing both partitions permits preparing a new local study of at most 30
single names. Each is rated `Kullanırım`, `Belki`, or `Hayır`; there are no
forced pair choices. The study source, sampling, repeats, and acceptance rule
must be frozen before the user sees a name. Until that untouched human gate
passes, Phase 305 is a mechanistic research result only and cannot enter a
production shadow, claim better names, or modify Auto.
