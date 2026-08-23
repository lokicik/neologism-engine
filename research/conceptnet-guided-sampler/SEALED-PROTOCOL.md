# Phase 303 sealed protocol

Date frozen: 2026-08-23

The 24 development briefs passed every frozen Phase 303 gate in two
byte-identical executions. This protocol freezes the untouched 11-brief sealed
run before it is opened.

## Frozen implementation

- Protocol / implementation commits: `bb571ec` / `53a2cdd`.
- Development report / manifest SHA-256:
  `fb0e2d53a05210ed314323e31adf2f81fa9d3ab84077eeb059d9eddb46b247a5` /
  `ae66f2ea1160271758c99268e86e2169e9db58b75117b0e017c8d01367f0c69d`.
- Materializer / runner SHA-256:
  `4f7d43c8684d038ebcb31721e5b09cad1f2dfedf5d67fac99de8fce0f476bf51` /
  `c298ad8bc142c9e102b304bd550f3123a927985e050cd39160d7f42ebc99a925`.
- No code, input, model, threshold, seed, attempt budget, selection weight, or
  gate may change between development and sealed execution.

## Sealed partition and gates

- Use the existing FNV-sorted canonical indices 24 through 34 and seeds
  `13/67/313`: 33 pages total.
- Repeat every Phase 303 gate unchanged: `160/10` pools/pages within 40,000
  attempts; positive source margins; quality `75/84`; ILAD `0.60/0.72`; at
  least 27/30 unique names; overlap at most `1/3`; no duplicate page set;
  own-vs-nine-wrong at least 70%; lane coverage/caps; template tails at most
  20%; inherited hard-filter invariants.
- Run the sealed partition twice in fresh clean-core release processes. Report,
  manifest, attempt counts, rejection counters, pools, and ordered pages must
  be byte-identical.

Any failed gate closes the architecture without repair or sealed-driven
tuning. Passing allows only a separately frozen production shadow audit. It
does not authorize integration or support a better-name claim; blind human
full-page preference evidence remains mandatory.
