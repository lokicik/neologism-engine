# Phase 293 normalization and component freeze

Date: 2026-08-23

Only the six frozen CSV header rows were inspected before this checkpoint. No
crate row, name, description, relation value, owner value, count, or model
result was visible.

## Exact fields

- `crates.csv`: `id`, `name`, and `description` only. `readme`, URLs, timestamps,
  feature/upload settings, and trust-publishing state are ignored.
- `crate_owners.csv`: group on the documented pair `(owner_kind, owner_id)`;
  require at least one owner and allow only documented kinds `0` and `1`.
- `keywords.csv` plus `crates_keywords.csv`: join `id -> keyword`.
- `categories.csv` plus `crates_categories.csv`: join `id -> slug`.

Every selected table must retain its frozen header exactly and every source
file must match the extraction-manifest SHA-256.

## Exact text normalization

- A crate name is eligible only when its observed lowercase field matches
  `[a-z]{4,12}` exactly.
- Extract description/keyword/category terms directly with ASCII regex
  `[a-z][a-z0-9]{1,23}` after Unicode lowercase. Do not normalize Unicode,
  transliterate, strip punctuation from names, or join spelling pieces.
- Remove the exact crate-name token and this frozen stoplist:
  `a, an, and, are, as, at, be, by, can, crate, crates, for, from, has, have,
  in, into, is, it, its, library, of, on, or, package, provides, rust, simple,
  that, the, their, this, to, tool, use, used, using, via, was, with`.
- Require at least three retained description tokens before keywords/categories.
- Description features are `u:<token>` plus adjacent retained-token
  `b:<left>_<right>`. Keyword terms use `k:<token>` and category-slug terms use
  `c:<token>`. Relation terms are deduplicated and sorted before appending;
  observed description term frequency is retained.
- Exact-description grouping fingerprints the ordered retained description
  token sequence before feature prefixes or relation terms.

## Exact components and split

- Distinct eligible crate names are nodes. Duplicate eligible names fail.
- Union nodes sharing any `(owner_kind, owner_id)`, exact normalized-description
  fingerprint, or exact/edit-one name relationship. Edit-one is ordinary
  Levenshtein insertion, deletion, or substitution; transposition is not one
  edit.
- Sort components by `(FNV-1a(first lexicographic name), first name)`. Fill
  train without crossing `floor(0.80*N)`, then validation without crossing
  `floor(0.10*N)`, and assign the remainder to sealed test. Once a phase closes,
  later smaller components do not backfill it.
- The preparation report and canonical normalized JSONL gzip are deterministic.
  Gzip uses timestamp zero; records sort by crate name then numeric ID.
