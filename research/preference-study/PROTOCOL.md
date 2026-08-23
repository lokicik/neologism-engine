# Context-matched blind pairwise preference study

This study collects the evidence required for a small non-LLM aesthetic ranker.
It changes no generator, selector, WASM contract, web route, storage schema, or
public type.

## Frozen question

Can real within-brief human choices expose a repeatable aesthetic signal beyond
the current mechanical composite, strong enough for a compact transparent
pairwise ranker to generalize to unseen briefs?

This phase builds and validates the data-collection instrument only. It reports
no preference result until a human completes the frozen study.

## Source and pairing boundary

- Reuse the 30 semantically distinct Phase-270 study briefs at source-file
  SHA-256 `55fd0a4b95068f7b8df8711f830a607d7f74f59645d9836b5ea98fe2ad127f56`.
- For each frozen seed/brief, call the current local production Auto candidate
  generator twice with a 30-name pool. Ordered full `NameResult` records must be
  byte-identical, unique case-insensitively, ASCII `[A-Za-z]{4,12}`, and have
  composite quality >=75.
- Freeze the actual ignored WASM and JavaScript bridge SHA-256 values plus the
  exact tracked `engine.ts` and `auto.ts` commits in the source artifact. No
  network, AI judge, model, credential, browser storage, or user taste profile
  participates.
- Form five disjoint primary pairs per brief. Pair endpoints differ by at most
  two composite points. Order pairs by smallest score gap, then prefer different
  construction/source families, then a deterministic hash; a name appears in
  at most one primary pair for its brief.
- The blind study contains only case id, brief, and the two displayed names.
  Scores, source mode, construction, split, seeds, pool, and answer metadata stay
  in the owner key.

## Split and quality control

- Sort briefs by FNV-1a 64-bit hash of UTF-8 brief text. The first 20 are train,
  next five validation, and last five sealed test. A brief exists in exactly one
  split; individual name decisions never cross splits.
- The 150 primary choices receive 24 concealed repetitions selected by lowest
  SHA-256 of `case-id + repeat`; repeat sides are reversed. Repeats never add
  training examples.
- The evaluator may choose left, right, or neither. `neither` is honest missing
  preference, not a loss for either name.
- A usable dataset requires all 174 decisions, at least 120 decisive primaries,
  decisive counts of at least `80/20/20` in train/validation/test, and logical
  agreement on at least 20/24 concealed repeats.

## Offline collector boundary

- Package one self-validating HTML file with its exact study embedded as inert
  JSON and a `connect-src 'none'` CSP. It makes zero network requests and writes
  no local/session/browser storage.
- Keyboard and pointer choices are equivalent. The instrument exposes current
  brief, two names, progress, back navigation, `neither`, partial export, and
  same-study resume. It never reveals scores, split, repeats, or a recommended
  side.
- Choice exports contain only schema, study SHA-256, and case-id/choice rows.
  The owner key is never accepted by or packaged into the evaluator.
- Validation rejects altered hashes, wrong counts, duplicate ids/names,
  malformed choices, cross-study resume, leaked answer-side fields, and output
  overwrite.

Only after this study yields usable real choices may Phase 282 train candidates.
Training must group by brief, choose features/regularization on train+validation,
touch test once, beat the frozen composite on test with a preregistered margin,
and then pass production shadow gates. No human result means no ranker claim.
