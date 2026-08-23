# Phase 289 data-insufficient checkpoint

Date: 2026-08-23

## Decision

The frozen spelling-only development experiment cannot open. The selected
source does contain a 31 by 537 observed human-rating matrix, documented scale
direction (`1=rounded; 7=pointed`), stimulus identifiers, and segmental CVCV
content. It does not provide 500 directly observed lowercase ASCII spellings.

Concatenating only the four source-provided segment fields, without adding a
post-inspection transliteration, yields:

- 537 items and 536 distinct observed segment sequences;
- 535 items with at least 25 finite ratings;
- 221 distinct strings matching `[a-z]{4,12}` directly;
- 219 distinct strings satisfying both the ASCII and 25-rating gates.

The remaining source symbols include `I`, `ɛ`, `ʊ`, `tʃ`, and `dʒ`. Mapping
these to English-looking graphemes would be a new, ambiguous normalization
chosen after source inspection. It would turn the frozen spelling model into
a romanized phoneme model and contradict the fail-closed source-selection
rule. The required 500-item minimum is therefore not met.

No model, split, validation result, sealed result, or optional Phase-287
feature was produced. The frozen external PLOS XLSX and DOCX were not opened.

## Reproducibility

- Frozen protocol SHA-256:
  `38f717108c55a0e325764643abd350b7ad460b4a074e24ff3206b0dccafd81e3`
- Inspected MAT SHA-256:
  `9288d0895e8eb628e96721550b47dd692f862577084a9b5143f0d2c3a642d62c`
- Inspection dependencies: Python 3.12, NumPy 2.3.5, SciPy 1.16.1.
- Command:
  `python inspect_development.py --source-root source`

`inspect_development.py` verifies the source hash and reports the frozen gate
counts without reading either external file.
