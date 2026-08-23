# Familiarity-controlled brand liking: data-insufficient checkpoint

Date: 2026-08-23

## Decision

The BRAND human-liking route stops before residualization, form-model fitting,
validation, or test. Only 300 distinct brands satisfy the frozen product-name
shape and observation requirements; the protocol required at least 350.

No threshold, token normalization, or name length was changed after inspecting
the workbook. No scorer or artifact exists and production remains untouched.

## Frozen identity

- Protocol SHA-256:
  `2aaa7cbb56dd283c2f7c8a6a209cbfa3189e1202286491e50f9cd99ae812a612`
- Refresh script SHA-256:
  `e9ae7a139c87486d2a2394ceb316b4c1243201199c9a4ccfc70f7a652695c94c`
- ResearchBox archive SHA-256:
  `f81f6a6ac798fc609094238ca9caefa31c58026527333efaba97fd12cfca2f79`
- Extracted workbook SHA-256:
  `1a440ceeb74920f776e54d0c053d9e5c5f1149b6d9d3f66568cd312bb39a7ce5`
- Snapshot manifest SHA-256:
  `584cbf82268c1a196805413ee39efe9aafd7fa5b5ba351bbc01476b4f6eef855`
- Read-only normalized extract SHA-256:
  `5e40dd100e5e02d1fb6a710afbb19972d849e5952c4d63cd641dd19b23c9d9d8`
- Source: ResearchBox 1892 / DOI `10.5281/zenodo.15039646`, CC BY 4.0.

## Observed preflight

- Workbook rows with a populated brand name: 597.
- Eligible distinct `[A-Za-z]{4,12}` single-token families with liking and
  familiarity: **300**; required: **350**.
- Eligible families represented in both 2020 and 2024: 247.
- Eligible industries: 32.

The source is valuable, but its product-shape subset is too small for the
declared family-disjoint 70/15/15 residual-learning experiment. Using space
deletion, punctuation removal, transliteration, three-letter brands, or a
post-hoc 300-family threshold would answer a different question.
