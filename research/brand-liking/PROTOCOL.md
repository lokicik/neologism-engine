# Familiarity-controlled human brand-liking preflight

This is an isolated, non-LLM evidence experiment. It does not generate or rank
production names and is not imported by Rust, WASM, Auto, web types, storage,
or taste.

## Source and license

- Raffaelli, Bocchi, Estes, and Adelman, *BRAND: Brand Recognition and
  Attitude Norms Database*, DOI `10.3758/s13428-024-02525-x`.
- ResearchBox 1892 archive DOI `10.5281/zenodo.15039646`.
- The public ResearchBox contains familiarity and liking responses for more
  than 500 brands from 2,000 US-resident consumers in 2020 and 2024. Its posted
  content is CC BY 4.0.
- Network access is allowed only through the explicit `refresh.py --refresh`
  command. It records the URL, retrieval time, archive/workbook SHA-256, source
  DOI, and license. All analysis runs offline from that frozen snapshot.

## Frozen question

After removing familiarity, year, and industry effects, does the spelling and
sound form of a brand name predict any held-out human liking signal?

This deliberately avoids treating raw liking as name quality: established
brands inherit product experience, advertising, reputation, and exposure. The
experiment asks only whether a small residual signal generalizes across brand
families. Passing is not causal proof and does not authorize a product claim.

## Eligibility and split

- Keep names that are a single ASCII token matching `[A-Za-z]{4,12}` and have
  both familiarity and name-liking observations. Do not remove spaces,
  punctuation, suffixes, or transliterate.
- Normalize only ASCII case for identity. The same brand/name family and all
  years for that family stay in one partition.
- Sort family IDs by FNV-1a 64-bit hash: 70% train, 15% validation, 15% sealed
  test. Require at least 350 eligible families and at least 50 validation and
  50 test families.
- Fit familiarity, year, and industry controls on train only. Apply the frozen
  control coefficients to validation/test liking to obtain residual targets.

## Frozen form model and gates

- Model uses only signed stable-hashed character 2/3/4-grams plus transparent
  length, vowel balance, sonority/alternation, repetition, and boundary-sound
  features. Ridge values `{0.1, 1, 10, 100}` are selected by validation
  Spearman correlation, then MAE, then stronger regularization.
- Validation must show Spearman >=0.15 and >=3% MAE improvement over the
  train-mean residual baseline before sealed test opens.
- Sealed test must show Spearman >=0.15, >=3% MAE improvement, and the same
  correlation sign independently in 2020 and 2024 where each year has at least
  25 eligible rows.
- Against 100 deterministic within-industry residual permutations, the actual
  test Spearman must have one-sided empirical `p <= 0.05`.
- Two clean CPU runs must produce byte-identical normalized data, coefficients,
  validation report, and test report.

A failure ends this route before any production-candidate scoring. A pass opens
only a separate frozen application protocol with Rust parity, production shadow
gates, and a context-disjoint human preference study.
