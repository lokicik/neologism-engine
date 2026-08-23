# Human shape-iconicity transfer preflight

This protocol is frozen before inspecting either source inventory or outcome.
It narrows the inaccessible Phase-288 proposal to one independently available
sound-symbolic dimension and adds a cross-study human transfer gate. Shape is
not treated as beauty, brief relevance, or preference.

## Sources

- Development source: Lacey et al., *Stimulus Parameters Underlying
  Sound-Symbolic Mapping of Auditory Pseudowords to Visual Shapes*, DOI
  `10.1111/cogs.12883`. The paper reports 537 CVCV pseudowords rated by 31
  English-speaking participants. Public OSF nodes: rating data/scripts
  `y9zjc`, stimuli `ekpgh`.
- Untouched external source: De Carolis et al., *Assessing sound symbolism:
  Investigating phonetic forms, visual shapes and letter fonts in an implicit
  bouba-kiki experimental paradigm*, DOI
  `10.1371/journal.pone.0208874`. Freeze supplementary files `s005` (the
  pseudoword XLSX) and `s007` (its structure DOCX). The CC BY paper reports 128
  pseudowords and 41 French-speaking participants.
- First OSF refresh records only recursive filenames, sizes, URLs, public
  state, and license metadata. Exact OSF files are declared before download.
  Raw source remains ignored if a node lacks an explicit data license. Network
  access is allowed only through `refresh.py --refresh`.

## Data gates

- Development requires at least 500 distinct lowercase ASCII pseudowords
  matching `[a-z]{4,12}`, at least 25 retained human ratings per item, explicit
  participant identity, and recoverable rounded/pointed scale direction.
- External requires at least 120 distinct eligible pseudowords, 35 retained
  participants, correct-trial response time, frame identity, and item identity.
- Use only observed human ratings or response times. Author model output,
  acoustic predictors, consonant-class labels, and generated/imputed outcomes
  are forbidden targets.

## Development model

- Build connected spelling families under exact identity and edit distance
  one. Keep each family in one partition. Sort families by FNV-1a 64-bit hash
  and allocate 70/15/15 train/validation/sealed test by item count.
- Fit an intercept-plus-ridge model to train-only mean pointedness. Validation
  chooses ridge `{0.1, 1, 10, 100}` by Spearman, then MAE, then stronger
  regularization.
- Main features are signed stable-hashed character 1/2/3-grams plus transparent
  length, vowel share, C/V alternation, repetition, sonority, consonant manner,
  voicing, and boundary-letter features. The fixed ablation keeps only the
  transparent aggregates. Both receive spelling only.
- Validation must have at least 70 items, Spearman `>=0.35`, and exceed the
  aggregate ablation by `>=0.05` before sealed test opens. Sealed test must
  repeat both gates, improve MAE over train mean by at least 5%, and pass 100
  deterministic family-preserving permutations at one-sided `p<=0.05`.

## Untouched external transfer

- Open external data only after the sealed development mechanism passes.
- Keep correct pseudoword trials with finite positive response time. For each
  item, compute mean log-response-time separately in round and spiky frames;
  require at least ten observations on each side. Define transfer effect as
  `round_log_rt - spiky_log_rt`, so positive values mean relatively faster
  processing in a spiky frame.
- Correlate the frozen model's pointedness score with that item effect. Require
  at least 100 items, Spearman `>=0.15`, and a one-sided 1,000-permutation
  item-family test at `p<=0.05`.
- Two clean CPU runs must reproduce normalized records, split, coefficients,
  development reports, external report, and hashes byte-for-byte.

Passing proves only that one human sound-shape axis transfers from explicit
auditory ratings to an implicit independent study. It may then be declared as
one optional nested Phase-287 feature before any preference choices exist. It
cannot directly change production rank, generate a name, or support a
better-name claim.
