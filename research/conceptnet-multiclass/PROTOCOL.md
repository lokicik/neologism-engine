# Phase 302: multiclass source-keyword density selector

Date frozen: 2026-08-23

This is the final isolated automatic semantic preflight in the current
ConceptNet sequence. It selects only from immutable Phase 300 development
pools, generates no new names, inspects no sealed brief, and changes no product
code.

## Frozen question and inputs

Can a candidate retain enough source-keyword-specific spelling information for
its generating keyword model to beat every other canonical keyword model,
while leaving enough collision-clean, high-quality candidates to fill diverse
pages?

- Phase 300 development report SHA-256:
  `8140a0b00f83e3cc3607fa7b4fe097ad61d790a46fe6c9d3ab14a05e97e4bde0`.
- Phase 298 anchor SHA-256:
  `ff207ad1570356b1a820726dc6c6dc980826425bd40e440ce4dac0d0f4788e55`,
  a separately attributed CC BY-SA 4.0 derived data artifact.
- Candidate `source_group` maps to its page's ordered production `keywords`;
  Phase 298 supplies a non-empty model for all 111 keywords, so no group is
  skipped or repaired.
- Nine-wrong-brief scores, Phase 300/301 selected pages, sealed data, human
  choices, name identities, and network data are forbidden selector inputs.

## Frozen multiclass energy

- Fit 111 separate add-`0.1` order-three anchor character models. Within a
  keyword, observation weight is anchor score divided by that keyword's
  maximum. BOS/EOS and alphabet match Phase 300.
- Score a candidate under every keyword model. It is eligible only if its
  declared generating source keyword has strictly greater average log
  likelihood than all 110 other keyword models. Exact ties are ineligible.
- Define `source_margin = source_logp - max_other_keyword_logp`.
- Relevance inside the eligible fixed pool is `0.60 * quality + 0.20 *
  normalized global_product_logp + 0.20 * normalized source_margin`.
- Greedy normalized-edit-distance MMR lambda is `0.70`; lowercase spelling
  breaks ties. Eligible lane caps remain 4/5/10 for three-plus/two/one lanes.

This top-1 rule is stronger than the later nine-wrong diagnostic but is not
fitted to its brief pairs: it compares all 111 canonical keyword classes for
every candidate.

## Frozen gates

- Every one of 72 fixed source pools remains 160 and yields a 10-card page.
- Every selected source margin is strictly positive.
- Minimum/average composite `>=75 / >=84.0`; mean/minimum ILAD
  `>=0.72 / >=0.60`.
- At least 27 unique names per brief; mean/maximum cross-seed overlap
  `<=1 / <=3`; duplicate page sets zero.
- Recorded own-brief semantic logp beats the recorded nine-wrong maximum for at
  least 70% of selected cards.
- Each page uses two source lanes when two are eligible; all lane caps hold.
- Template tails at most 20%; Phase 300 hard-filter, collision, anchor-copy,
  hazard, and form-floor invariants remain true by subset construction.
- Two clean runs reproduce report and manifest byte-for-byte.

Failure closes this automatic semantic route; do not weaken top-1 to top-k or
select on the nine-wrong outcome after inspection. Passing would open a
separately frozen sealed-source run, not production or a better-name claim.
Blind human full-page evidence remains mandatory.
