# Phonetic Pareto naming probe

This is an isolated, LLM-free mechanism experiment. It is not imported by
`generate()`, WASM, Auto, web types, storage, or taste export.

## Frozen question

Can the existing transparent brief lexicon drive whole-spelling phonetic
offspring that are less visibly assembled than production Brandable names,
without sacrificing the retained mechanical quality and diversity floors?

This first checkpoint deliberately uses no learned semantic model and no
network access. `extract_keywords` and `brand_root_groups` provide the same
transparent semantic atoms already used by production. The experimental
generator then recombines consonant and vowel streams across two semantic
groups, applies bounded phonetic mutations to the whole spelling, and selects
from non-dominated objective fronts. It never appends the production suffix or
metaphor inventories.

Source trace is a mechanistic conditioning diagnostic, not proof that a human
will perceive the intended meaning. Composite quality is likewise not proof of
beauty. Human preference remains a later gate.

## Frozen inputs

- Canonical briefs: `research/holistic/canonical_briefs.json`
- Seeds: `13`, `67`, `313`
- Collision review: the Phase 268 review index regenerated from the checked-in
  Wikidata snapshot, plus BigTech, roots, dictionaries, and the two experimental
  accent snapshots compiled into the Rust example
- Candidate pool/page: `120/10`
- Maximum attempts per page: `20,000`
- Existing BigTech phonotactics, sonority, scoring, ILAD, dictionary, and
  edit-one checks

## Frozen mechanism gates

- 35 briefs x 3 seeds = 105 pages; every page is 10/10 and every pool is 120/120.
- Every card has composite quality at least 75; aggregate average is at least
  84.0.
- Mean/minimum page ILAD is at least `0.72/0.60`.
- Every brief has at least 27 unique names across its 30 outputs.
- Cross-seed page overlap averages at most 1/10 and never exceeds 3/10; no two
  normalized page sets are identical.
- Exact/edit-one review-index collisions are zero.
- At least 75% of selected names score higher against their own two source
  groups than against nine deterministic wrong-brief group pairs. This is only
  a source-trace test.
- At most 20% of selected names end in a Phase 141 direct-suffix or
  root-metaphor tail, and at most 25% visibly contain an unchanged source root
  of four or more letters.
- The same brief/model-free algorithm and seed reproduce the pool, rejection
  counters, Pareto metadata, and ordered page exactly within one process. Two
  fresh release processes must produce byte-identical stdout.

If any gate fails, stop before production shadow replacement or human testing.
Record a negative checkpoint rather than weakening a threshold after seeing
the output.

## Command

Regenerate the ignored review index first when needed, then run:

```powershell
& "$env:USERPROFILE\.cargo\bin\cargo.exe" run -p neologism-core --example phonetic_pareto_probe --release -- `
  --matrix research/holistic/canonical_briefs.json `
  --review research/holistic/work/dataset-final/review-names.txt
```
