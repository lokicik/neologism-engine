# Multi-domain phonosemantic iconicity preflight

This protocol is frozen before inspecting the source file inventory or any
human outcome. The experiment asks whether a compact, text-only non-LLM
representation can recover several human sound-symbolic judgments. It does not
claim that iconicity is beauty, brief fit, or name preference.

## Source boundary

- Primary source: Kumar, Lacey, Dorsi, Nygaard, and Sathian, *Acoustic
  parameter combinations underlying mapping of pseudoword sounds to multiple
  domains of meaning: representational similarity analyses and machine-learning
  models*, DOI `10.1121/10.0041768`.
- Public OSF node `hdm7w`. The paper reports 537 auditory pseudowords rated in
  eight domains: rounded/pointed, small/big, bright/dark, hard/soft,
  smooth/rough, light/heavy, calming/exciting, and good/bad.
- First refresh only records recursive filenames, sizes, source URLs, node
  metadata, and license metadata. Exact source files will be declared in a
  separate source-selection checkpoint before their contents are opened.
- If the node has no explicit reusable-data license, raw files remain local and
  ignored; only transformations, hashes, aggregate reports, and code may be
  committed. Network access is permitted only with explicit
  `refresh.py --refresh`.

## Data gate

- Require at least 500 distinct pseudowords with observed human ratings in all
  eight domains and at least 25 retained participants per domain.
- Use human item ratings only. Author KNN predictions, fitted acoustic scores,
  real-word semantic ratings, and generated/imputed outcomes are forbidden.
- Product-compatible inputs are lowercase ASCII spellings matching
  `[a-z]{4,12}`. No transliteration, concatenation, or repaired spelling.
- Stop before modeling if the selected files cannot recover item identity,
  domain, participant identity, scale direction, and the paper's reported
  sample counts without guessing.

## Frozen split and representation

- Build connected item families under exact identity and edit distance one.
  Keep each family in one partition. Sort families by FNV-1a 64-bit hash and
  allocate 70/15/15 train/validation/sealed test by item count.
- Fit eight independent intercept-plus-ridge models to train-only item means.
  Validation selects ridge `{0.1, 1, 10, 100}` independently per domain by
  Spearman, then MAE, then stronger regularization.
- The main representation is signed stable-hashed character 1/2/3-grams plus
  transparent length, vowel share, C/V alternation, repetition, sonority, and
  boundary-letter features. It receives spelling only, never audio or source
  acoustic measurements, because the product must score unseen written names
  locally.
- The fixed ablation removes hashed n-grams and retains only the transparent
  aggregate form features. Train-mean prediction is the calibration baseline.

## Frozen gates

- Validation must contain at least 70 items. At least six of eight domains must
  reach Spearman `>=0.25`; mean Spearman must be `>=0.30` and exceed the fixed
  aggregate-feature ablation by `>=0.05`. Otherwise sealed test stays closed.
- Sealed test must independently satisfy the same three ranking gates, have
  positive Spearman in all eight domains, and improve mean MAE over train-mean
  prediction by at least 5%.
- Against 100 deterministic family-preserving outcome permutations, empirical
  one-sided `p<=0.05` for sealed mean Spearman.
- Two clean CPU runs must produce byte-identical normalized records, split,
  coefficients, validation report, and sealed report.

Passing proves only a reusable human-grounded sound-profile representation. It
may then be frozen as an optional nested feature block in the still-unopened
Phase-287 preference learner. That comparison must be declared before any
human choice is collected; its sealed test may open only once. No direct
production score, style mapping, or ranking weight follows from this preflight.
