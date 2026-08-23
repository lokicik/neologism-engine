# ConceptNet semantic-lattice beam: Phase 299 negative checkpoint

Date: 2026-08-23

## Decision

Phase 299 stops on development before sealed held-out, product shadowing, or
human preference work. The weighted beam finds the joint high-probability modes
of the train-product prior and ConceptNet anchor prior, but every inspected path
collapses into a duplicate, known-word/name collision, complete anchor copy, or
other hard rejection. None of 72 development pages has one eligible candidate.

No beam width, completion count, form/semantic weight, jitter, filter, or gate
changed after the first report. A second fresh clean run reproduced both
retained artifacts byte-for-byte. Sealed held-out was not run.

## Frozen identity and reproduction

- Protocol commit: `9038427`.
- Implementation commit: `6f88819`.
- Protocol SHA-256:
  `dd3cc43a7d43ee8ebce022f8baec2520d43839c94f8cb009f610123d3b93c7fe`.
- Probe SHA-256:
  `d970d316e35936afcd1c46a0f243535bd50789fc2ad8774109432b4c0e1a1e9c`.
- Runner SHA-256:
  `1a0f7ab38d92443dd76196033974985f9359449d1958a4b2440ea6824a659eda`.
- Input anchors SHA-256:
  `ff207ad1570356b1a820726dc6c6dc980826425bd40e440ce4dac0d0f4788e55`.
- Reproduced development report SHA-256:
  `88512d81c2f9adba6096f595295d61b2b5c2d962d77a4841ddc70b6c55d512a2`.
- Reproduced manifest SHA-256:
  `ae99ba234612d73f1754d084039f5e70b1ec4d560a213709615a4df73896c1f8`.

## Observed development result

- Pages / raw completed paths inspected: 72 / 110,592.
- Full pools / full pages / selected cards: 0 / 0 / 0.
- Duplicate rejections: 59,257.
- Exact/edit-one dictionary/review collisions: 60,532.
- Complete four-plus anchor copies: 2,655.
- Lexical hazards / structural failures: 315 / 121.
- Form-floor failures / post-filter quality failures: 0 / 0.
- Same-process replay: byte-identical.

Counts exceed raw paths because the same spelling can be emitted by multiple
keyword lanes and each path is classified at its first applicable hard filter.
The decisive fact is the zero eligible pool, not any downstream page metric.

## Interpretation and boundary

Phase 298's semantic coverage remains valid; Phase 299 rejects maximum-score
beam inference. The common modes of an English-anchor character distribution
and a product-name character distribution are unsurprisingly existing lexical
forms. The beam therefore optimizes toward precisely the region that the
novel-name collision boundary must remove.

Increasing beam width after this result would be an outcome-driven repair and
would still search the same modes. A distinct follow-up may preserve the
validated ConceptNet semantic expert but use frozen stochastic whole-form
sampling, because Phase 292 already demonstrated that sampling can populate
novel collision-clean pools. Such a protocol must be declared separately and
must retain the same condition, quality, diversity, collision, sealed, and
human gates. It cannot claim that Phase 299 nearly passed.
