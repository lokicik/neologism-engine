# Phase 305 untouched absolute human study

Date frozen: 2026-08-24

This study is frozen after Phase 305 passed its development and sealed
mechanism gates, but before a study source exists and before the user sees or
rates any recruited name.

## Question

Does the Phase 305 personal-prototype selector turn the same
brief-conditioned whole-form pool into names the user is more willing to use
than the unchanged Phase 303 selector?

The study presents one brief and one name at a time. It never forces a choice
between two bad names. The only responses are `Kullanırım`, `Belki`, and
`Hayır`. Candidate origin, automatic scores, prototype anchors, pair identity,
and repeat identity stay hidden.

## Frozen source construction

- Required Phase 305 development/sealed report SHA-256:
  `944167f4d9874738bb4d5c33852713bbce464be82d6c55d202a552b3379867ef` /
  `cfb537f3f164c52611ede09c9c009c7607eb71551e83ff9032d58b9144669cf2`.
- Required Phase 303 development/sealed report SHA-256:
  `fb0e2d53a05210ed314323e31adf2f81fa9d3ab84077eeb059d9eddb46b247a5` /
  `7457f1439be84dfb5f7d3a4891961a5fa81686baf8517671f890fa218243f525`.
- Take the union of the 35 canonical briefs and sort by
  `(FNV-1a-64("phase305-human-brief-v1|" + brief), brief)`. Retain the first
  twelve.
- For each brief choose one of seeds `13/67/313` using
  `FNV-1a-64("phase305-human-seed-v1|" + brief) mod 3`.
- The prototype candidate is the first unused name on the matching Phase 305
  selected page. The control is the first unused, different name on the
  matching Phase 303 selected page. Process briefs in retained order and
  maintain one global lowercase-name exclusion set. A source page that cannot
  provide both candidates makes source construction fail closed.
- This creates 24 primary single-name tasks: twelve prototype and twelve
  control, paired only in the hidden audit key by brief.
- Choose six primary tasks for exact concealed repeats by ascending
  `(FNV-1a-64("phase305-human-repeat-v1|" + task_id), task_id)`. A repeat keeps
  the exact brief and name. It adds no effectiveness observation.
- Sort all 30 displayed tasks by
  `(FNV-1a-64("phase305-human-order-v1|" + task_id), task_id)`.
- The public source contains task ID, brief, name, and `repeatOf` only. The
  source arm and brief-pair mapping exist only in the audit key. Source and key
  hashes must be frozen before the collector opens.

## Collection contract

- Store progress locally against the exact public-source and collector hashes.
- One click records exactly one of `use`, `maybe`, or `no`; previous decisions
  may be revisited before export.
- Completion requires all 30 task IDs exactly once. Export records source
  hashes, ordered decisions, and no inferred choice.
- Repeats are displayed like ordinary tasks. The UI reveals neither completion
  statistics by arm nor the acceptance result.

## Frozen analysis and gates

Map `Hayır=0`, `Belki=1`, and `Kullanırım=2`. Repeats test exact response
consistency only; exclude them from every effectiveness count.

- Exactly 24 primary and six repeat decisions are present with no unknown,
  duplicate, or missing task.
- At least 5/6 concealed repeats receive the exact same response.
- Each source arm contributes exactly twelve primary ratings.
- Prototype candidates receive at least four `Kullanırım` and at least eight
  non-rejections (`Kullanırım` or `Belki`).
- Prototype non-rejections exceed control non-rejections by at least three.
- Within the twelve hidden brief pairs, the prototype ordinal rating exceeds
  control in at least seven briefs and is lower in at most two.
- Source reconstruction, response normalization, counts, pair outcomes,
  report, and manifest reproduce byte-for-byte in two fresh analyses.

Every gate must pass. Failure closes this surface-prototype architecture and
does not permit adding features, changing weights, or replacing the supplied
anchors from the observed outcomes. Passing is direct but small personal
evidence; it opens only a separately frozen production shadow comparison. It
does not authorize integration or a general better-name claim.
