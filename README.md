# Neologism Engine

Generates invented names for three styles — **Big Tech brands**, **Sci-Fi**, and **Fantasy** — using a Rust engine compiled to WebAssembly and a React + Vite + TypeScript SPA. Everything runs fully client-side; no backend or API keys required.

Built for naming **packages, CLIs, libraries, and brands** — it's the rare generator that checks **developer namespaces** (GitHub username, npm, PyPI, crates.io) alongside domain registries and trademark search, so you can clear a name everywhere it matters before you commit.

## Architecture

```
neologism-engine/
  core/        Pure Rust library — generation engine (no WASM deps, fully testable)
  wasm/        wasm-bindgen wrapper — compiles core to a .wasm module
  web/         React + Vite + TypeScript SPA — consumes the WASM
```

**`core/`** implements:
- **Markov chains** (order-3, character-level) for Sci-Fi and Fantasy styles
- **Syllable blending** (portmanteau) + tech suffix transforms for Big Tech style
- **Sub-style phonologies** — per-variant phoneme-affinity profiles that re-rank Markov output toward a target sound (Elvish, Dwarvish, Orcish, Common; Stellar, Machine, Alien)
- **Description-driven naming** — simplified RAKE keyword extraction turns a product description into blend roots, with distinct offline semantic families for developer tools and common domains such as legal work, recruiting, meals, support, events, weather, habits, sales, and pet care; naming briefs get a scoped smoother-ending palette, structurally weak semantic forms become last-resort fallbacks rather than normal choices, and Respell styles only the product subject rather than audience or delivery words
- **Developer-domain semantics** — compact offline maps for databases, queues, formatters, environment tools, filesystems, feature flags, schedulers, dependency updates, documentation, package registries, namespace availability, and other common dev domains keep technical briefs tied to their actual meaning
- **Phonotactic filters** — rejects vowel-less output and over-long consonant clusters (relaxed for harsh variants), plus a Sonority Sequencing check so "soft" styles read naturally
- **Word-likeness ranking** — big-tech blends are ranked by their probability under the real-brand Markov model, surfacing the most brand-like names
- **Connotation tags** — each name is tagged with the "vibe" it evokes (small/large, bold/smooth/sleek, sharp/round) from sound symbolism
- **Scoring** — pronounceability (CV alternation), novelty (dictionary distance), and memorability (initial plosive, brevity, repetition), each 0–100

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Rust | ≥ 1.70 | [rustup.rs](https://rustup.rs) |
| wasm32 target | — | `rustup target add wasm32-unknown-unknown` |
| wasm-pack | 0.13.x | `cargo install wasm-pack --version "=0.13.1"` |
| Node | ≥ 18 | [nodejs.org](https://nodejs.org) |

> **Windows note:** After installing Rust, add `%USERPROFILE%\.cargo\bin` to your PATH, or prefix commands with `$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"` in PowerShell.

> **wasm-pack version:** `wasm-pack 0.15.x` requires Rust 1.91+. Install `0.13.1` with `--locked` if your Rust is older.

## Development

### 1. Build the WASM module (required before first run)

```sh
# From the repo root
wasm-pack build wasm --target web --out-dir ../web/src/wasm
```

Or from `web/`:
```sh
npm run build:wasm
```

> `web/src/wasm/` is a **generated artifact** — it is gitignored and must be rebuilt after any changes to `core/` or `wasm/`.

### 2. Install frontend dependencies

```sh
cd web
npm install
```

### 3. Start the dev server

```sh
cd web
npm run dev
```

App runs at **http://localhost:5173/**.

### Test the Rust core

```sh
cargo test -p neologism-core
```

138 unit tests covering Markov determinism, phonotactic filters, blend logic, score ranges, phoneme affinity, sonority sequencing, word-likeness, keyword extraction, semantic ranking, exclusion behavior, developer-domain coverage, first-page shape balance, and 100-name brief sessions.

> Quick quality check: `cargo run -p neologism-core --example sample` prints a batch of names for every style and variant.
> Long-session check: `cargo run -p neologism-core --example concept_compare --release` audits ten rolling batches across eight representative briefs.
> Compound quality check: `cargo run -p neologism-core --example compound_compare --release` audits noun relevance, adjective–noun coherence, lexical echoes, structural scores, seed diversity, and 100-name capacity across twenty multi- and single-concept briefs.
> Developer-domain check: `cargo run -p neologism-core --example dev_domain_compare --release` audits semantic coverage across sixteen held-out developer briefs and both Brandable and Compound; from `web/`, `node e2e/dev-domain-audit.mjs` pins the same behavior in Chromium/WASM.
> Developer-namespace check: from `web/`, `node e2e/namespace-quality-audit.mjs` audits fifteen production cold Auto pages for npm/crates.io/registry semantics, filesystem leakage, structural quality, within-page similarity, and seed variety (`--verbose` prints every name).
> General-domain check: `cargo run -p neologism-core --example general_domain_compare --release` audits calibration and synonym-holdout prompts across eleven common product domains, independent seed sets, wrong-domain leakage, and rolling 100-name capacity in both Brandable and Compound.
> Broad-domain collision check: `cargo run -p neologism-core --example cross_domain_compare --release` audits 2,400 names across 48 domains, fails on any exact collision without a shared semantic root, and caps explained collisions at 1% while retaining composite, diversity, and per-domain uniqueness floors.
> Brandable morphology check: `cargo run -p neologism-core --example morphology_compare --release` audits 1,100 fixed-seed names plus 2,200 rolling-session names for the 75-point structural floor, transformation-family balance, collapsed suffixes, consonant metaphor seams, complete vowel-suffix seams, lossy shared overlaps, diversity, and 100-name capacity. Multi-concept joins that only resemble a collapsed metaphor seam are reported separately instead of counted as artifacts.
> Auto first-page check: from `web/`, `node e2e/auto-quality-audit.mjs` audits 85 deterministic guided pages, including product-subject Respell relevance (`--verbose` prints every name).
> Cold Auto quality check: from `web/`, `node e2e/cold-quality-audit.mjs` audits 90 fixed pages, including the bounded weak/diversity repair, one-accent contract, structural floor, and within-page similarity.
> Personalized shortlist check: from `web/`, `node e2e/taste-quality-audit.mjs` audits 100 fixed pages across five briefs, four reference-name sets, and five seeds, gating structural quality, taste affinity, specialized-brief retention, suffix-template balance, within-page family diversity, and meaningful variation across fresh sessions.
> Personalized session check: from `web/`, `node e2e/personalized-session-audit.mjs` compares hidden-pool and visible-only history over four deterministic 100-name sessions, then drives the real UI to 100 names while gating quality, brief coverage, uniqueness, and false exhaustion.

### Audit exported taste data

After exporting **Local taste data** from Settings, measure how often the current offline
composite agrees with real `liked > passed` choices:

```sh
cargo run -p neologism-core --release --example taste_audit -- path/to/neologism-taste.json
```

The report includes pairwise agreement, project-context counts, labels by source mode, and
the worst score-vs-human disagreements. It accepts historical v1 exports and validates that
v2 comparisons stay within one project context. Pairs share examples, so treat the result as
descriptive until the export has at least 10 liked and 10 passed names. It is an evidence gate
for scorer experiments, not a production model.

### Production build

```sh
cd web
npm run build:wasm   # rebuild wasm first if needed
npm run build        # output in web/dist/
```

## Features

- **Style selector** — Big Tech / Sci-Fi / Fantasy
- **Sub-styles** — Sci-Fi (Stellar / Machine / Alien) and Fantasy (Elvish / Dwarvish / Orcish / Common), plus "Mixed"
- **Controls** — count, min/max length, randomness (temperature), seed words, product description, starts-with / contains constraints
- **Brief-aware Compound mode** — readable two-word names use project-specific adjective palettes, semantic noun roots, and role-compatible pairings (`QuietInk`, `FairTally`, `SwiftSignal`) instead of arbitrary corpus combinations; recognized concepts keep their focused first page and expand to 100 fresh names on continued exploration
- **Project-scoped local taste selection** — add 3–8 example names you already like for an immediate local profile, or teach each project by starring/passing on 3+ generated names. Future batches request up to a 6× offline candidate pool, reject structurally weak options when enough stronger names exist, preserve candidates that carry an additional brief concept, keep any one stem family to 20% of the visible page, cap one exact ending at 20% on naming briefs or 30% elsewhere, and reserve at least two slots for non-suffix naming forms when the pool allows it. A fresh manual generation explores a nearby high-quality shortlist while continued scrolling keeps one coherent taste direction. Only names actually shown enter recent history, so unshown shortlist candidates remain available on later pages. References stay separate from feedback/export data, and everything remains in `localStorage`.
- **Taste data export** — Settings turns explicit likes and passes into a versioned JSON dataset, preserving each name's project brief while forming preference pairs only within the same project context. It never exports AI credentials or recent-name history.
- **Brief-aware Auto** — a project description gets semantic Brandable names plus at most one Respell earned by a main product concept; incidental words such as `developer`, `companion`, `planner`, or `reminder` cannot take that accent slot. On a cold page, a bounded Brandable-only offline fallback replaces missing/sub-75 slots and makes only quality-neutral substitutions when the full page is too repetitive, without adding another accent. An empty brief keeps the broader four-mode sampler.
- **Deep brief sessions** — initial semantic batches stay focused; later Brandable batches search a deeper curated metaphor pool on the visible ten-name rhythm, independent of any larger hidden taste pool, so repeated scrolling reaches 100 fresh, prompt-linked names while keeping structurally weak forms out whenever a full stronger page remains.
- **Root-preserving coinages** — concept suffixes keep the full semantic root at vowel boundaries (`Bridgeora`, not the lossy `Bridgea`; `Cacheora`, not `Cachera`)
- **Readable semantic joins** — concept pairs keep meaningful boundary consonants (`Poolledger`, not `Pooledger`); awkward vowel collisions and shared-overlap typos such as `Aurank`, `Settledger`, and `Tagent` are skipped for a cleaner pair.
- **Score bars** — pronounceability, novelty, and memorability per generated name
- **Favorites** — star names; persisted across reloads via `localStorage`
- **Domain indicator** — checks `.com` / `.io` availability via Cloudflare DNS-over-HTTPS (no API key; labeled as indicator, not authoritative)
- **Batch metrics & tips** — a stats panel shows the batch's average scores, diversity, and uniqueness, with 👑/✦/🔊 badges on standout names and contextual suggestions (e.g. "raise Randomness for more invented results"). A CLI eval harness (`cargo run -p neologism-core --example metrics`) prints per-style aggregates for regression tracking.

## How it works

| Style | Generator | Flavoring |
|---|---|---|
| Big Tech | Portmanteau blend of root words + tech transforms (vowel-drop, `-ly`/`-ify`/`-io` suffixes); a Markov model trained on real brand names fills variety | Roots come from a product description (RAKE keywords), seed words, or a built-in root list |
| Sci-Fi / Fantasy | Order-3 character Markov chain trained on a curated corpus | A variant trains on its own sub-corpus and re-ranks candidates by a phoneme-affinity profile (sonorous liquids → soft; harsh plosives/clusters → hard) |

Every candidate passes a phonotactic filter, is scored on three axes, deduped, and returned. Generation is deterministic when a `seed` is supplied.

## Research & references

This engine is built from published techniques rather than ad-hoc heuristics:

- **Brand-name blending & appeal** — Gangal et al., *Generating Appealing Brand Names*, [arXiv:1706.09335](https://arxiv.org/abs/1706.09335). Basis for syllable blending, vowel-dropping, and scoring candidates for readability/pronounceability.
- **Markov / n-gram name generation** — the classic character-Markov approach to culture-specific names ([Markov name generation](https://luetkemj.github.io/170102/2016-markov-name-generation/)). Basis for the Sci-Fi/Fantasy generator.
- **Sound symbolism (bouba/kiki)** — Köhler (1929); Klink, *Creating Brand Names with Meaning* / "Sounds good: phonetic patterns in top brand names"; Pathak et al. (2020), *Harsh voices, sound branding*, [Psychology & Marketing](https://onlinelibrary.wiley.com/doi/abs/10.1002/mar.21346). Basis for the memorability score (initial plosives) and the sub-style phoneme profiles (soft liquids vs. spiky plosives).
- **Phonetic connotation** — Sapir (1929), *A Study in Phonetic Symbolism* (front vowel = small, back = large); Klink (2000) and Lowrey & Shrum (2007), *Phonetic Symbolism and Brand Name Preference* ([J. Consumer Research](https://coehuman.uodiyala.edu.iq/uploads/Coehuman%20library%20pdf/English%20library%D9%83%D8%AA%D8%A8%20%D8%A7%D9%84%D8%A7%D9%86%D9%83%D9%84%D9%8A%D8%B2%D9%8A/linguistics/LowreyBookChapter2006.Final.pdf)). Basis for the connotation tags (small/large, bold/sleek/smooth, sharp/round).
- **Syllable structure & phonotactics** — onset/nucleus/coda phoneme classes ([Essentials of Linguistics §3.4](https://ecampusontario.pressbooks.pub/essentialsoflinguistics/chapter/3-4-syllable-structure/)). Basis for the phoneme-class model and validity filter.
- **Sonority Sequencing Principle** — Clements (1990), *The role of the sonority cycle in core syllabification*. Basis for the sonority validity check (clusters rise toward the vowel, fall away) used to keep soft styles pronounceable.
- **RAKE keyword extraction** — Rose, Engel, Cramer & Cowley (2010), *Automatic Keyword Extraction from Individual Documents*. Basis for description-driven naming — lightweight, training-free, runs in WASM.
- **Word-likeness (statistical language modeling)** — Shannon-style average log-probability under the trained Markov model. Basis for ranking big-tech blends by how typical they are of real brand names.
- **Intra-List Diversity (ILAD)** — Ziegler et al. (2005), building on Smyth & McClave (2001); average pairwise distance within a result set. Basis for the batch **diversity** metric.

> **What's *not* from a paper:** the metrics **composite score** (a weighted blend of the three per-name scores) and the **recommendation tips** (if-then UX rules) are pragmatic design choices, not drawn from research — only the diversity metric above is paper-grounded.

> **Implementation note:** every technique above is implemented from scratch in Rust as a *simplified, heuristic* adaptation — not a faithful reproduction of the source paper, and no third-party library code is used. Scoring operates on spelling (with light digraph handling), not a full grapheme-to-phoneme model.
