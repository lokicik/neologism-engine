# Experimental place-name spelling profiles

These corpora exist only for the standalone `language_accent_probe` experiment. They do not feed
`generate()`, Auto, WASM, the web app, or any public naming mode. The labels describe narrow
GeoNames place-name spelling profiles; they do **not** claim linguistic authenticity, phonetic
accuracy, or culturally safe brand names.

## Source and license

The checked-in snapshot was derived on 2026-08-10 from the GeoNames daily country extracts:

- `IT.zip` — `D674BE34C4DE239350B140AFCCD78C5175CAAB00A59CABEB33B82E35D0A18EA5`
- `alternatenames/IT.zip` — `E76B00F93B2B0C3CEDE06664B43ABF035D3DDCB7FFEF3CDC7F2B9E2F6FD4EDF4`
- `JP.zip` — `D4A326F3D11CF3A7EDA1E0EE24769F5DAF5BD668448082226A639C04C853FF13`
- `alternatenames/JP.zip` — `FFD4EE1B103F1BFBDBA1DEFF7C993F2B9C0E72FA68EE9763F7A6540E87CB890D`
  (used only by the optional raw-source audit)

Source: <https://download.geonames.org/export/dump/> and
<https://download.geonames.org/export/dump/alternatenames/>.

GeoNames data is licensed under the Creative Commons Attribution 4.0 License:
<https://creativecommons.org/licenses/by/4.0/>. Attribution: **GeoNames**,
<https://www.geonames.org/>. These files are modified subsets: rows were filtered, normalized to
lowercase ASCII, deduplicated, ranked, and truncated as described below. GeoNames provides the data
as-is without a warranty of accuracy, timeliness, or completeness. This notice applies to the two
derived data files, not to the project's source code. GeoNames does not endorse this project.

Derived snapshot hashes:

- `italian.txt` — `29177D0EF855A830B0727CBB3021EA8F47409F4F5FCE01A9BE402A4537E56DE2`
- `japanese-ascii.txt` — `940D0943A9A27A979621A4FD1D7D7DC2C0371EC7205166E5E8492BC15D3E14B8`

## Deterministic derivation

Both files contain exactly 1,000 unique, single-token names with 4–10 ASCII letters. The builder:

1. keeps GeoNames feature class `P` with population at least 1,000;
2. for Italy, joins the country extract to `it`-labeled alternate names, rejects colloquial and
   historic alternates, then keeps one unique preferred spelling or one unambiguous non-preferred
   spelling; unresolved alternatives are dropped instead of being chosen by lexical order;
3. for Japan, uses the country extract's plain-ASCII `asciiname` field; GeoNames does not document
   it as a controlled transliteration standard, so this is not a verified Hepburn-romaji or
   Japanese-phonology corpus;
4. excludes historical, abandoned, and destroyed populated-place feature codes (`PPLH`, `PPLQ`,
   and `PPLW`);
5. deduplicates by normalized name, keeping the largest recorded population;
6. sorts by population descending and name ascending, then keeps the first 1,000 names.

Run the checked-in builder against extracted GeoNames TSV files:

```powershell
cargo run -p neologism-core --example build_language_accent_corpora --release -- `
  <IT.txt> <IT-alternate-names.txt> <JP.txt> core/data/experimental/accents
```

The probe holds out every fifth entry, trains on the remaining 800, derives its generation
likelihood floor only from those 800 training names, and rejects exact training entries from
generated output. The sealed holdout is not used for model fitting, thresholds, filtering,
scoring, or selection; it is consulted only after pages are fixed, by the exact-leakage audit and
the class-wise profile classifier. It exists to test whether the two spelling profiles are
distinguishable and whether unseen source names are reconstructed; it is not a beauty score.

The frozen stress run uses 30 declared seeds per profile, an 80-candidate bounded pool, ten visible
names, and at most 10,000 attempts per seed. It reports raw rejection buckets, exact selected-corpus
and dictionary leakage, page metrics, order-independent duplicate pages, cross-seed overlap,
class-wise holdout recall, and balanced accuracy. Generated-name self-classification is labeled as
a circular diagnostic because the same target model samples and evaluates those names.

The current snapshot intentionally exits non-zero: its mechanical capacity, structural,
determinism, filter-bias, and sealed-classifier gates pass, but cross-seed uniqueness reaches only
`255/300` for Italian and `220/300` for Japanese ASCII, below the frozen `270/300` gate. Four
Japanese selections also reconstruct two unique sealed-holdout names (`Tama` and `Tomi`). Do not
weaken the thresholds or add a post-hoc holdout blocklist to turn the experiment green.

`mori` is the one exact spelling shared by both 1,000-name profiles. It is reported as ambiguous
and excluded from the Japanese holdout denominator, leaving 200 Italian and 199 Japanese evaluation
names. The resulting class recalls are 95.5% and 98.0%, with 96.7% balanced accuracy.

An optional read-only audit checks visible outputs against canonical, ASCII, and inline-alternate
strings plus name-bearing alternate-table rows in the supplied IT and JP dumps. Metadata tags
`link`, `wkdt`, `post`, `iata`, `icao`, `faac`, `unlc`, and `abbr` are excluded:

```powershell
cargo run -p neologism-core --example language_accent_probe --release -- `
  --audit-geonames <IT.txt> <IT-alternate-names.txt> <JP.txt> <JP-alternate-names.txt>
```

This is an **IT/JP raw-source audit**, not a global GeoNames audit. On the checked-in snapshot it
finds 159 exact source collisions among 475 unique visible strings. Two are the sealed-holdout names
above; the other 157 are raw-source-only collisions outside the selected 2,000-name snapshot. The
distinction matters: training-corpus leakage tests the exclusion invariant, while post-generation
holdout and raw-only matches show that the model reconstructs real source names. When the optional
audit is requested, zero visible source collisions is a hard gate; this snapshot therefore fails
that gate as well.

## Boundaries before any product use

- GeoNames plain-ASCII names and source records can contain mistakes or mixed conventions.
- The engine's `y`-as-vowel and English sonority checks are not Japanese phonology.
- A place-name profile is narrower than a language and can overrepresent large cities.
- A generated string can still collide with an unlisted place, person, product, or offensive word.
- The checked-in 2,000-name exclusion is not a global name-clearance database. Global GeoNames,
  trademark, product, person-name, and cultural screening remain separate work.
- Structural scores and corpus likelihood can prove technical coherence, not that a human wants the
  name.
- Any future integration needs cultural and lexical review plus blinded, context-matched human
  preference evidence against production Auto. A proxy win alone is a rejection, not a ship gate.
