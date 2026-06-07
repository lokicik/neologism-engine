# Neologism Engine

Generates invented names for three styles — **Big Tech brands**, **Sci-Fi**, and **Fantasy** — using a Rust engine compiled to WebAssembly and a React + Vite + TypeScript SPA. Everything runs fully client-side; no backend or API keys required.

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
- **Description-driven naming** — simplified RAKE keyword extraction turns a product description into blend roots
- **Phonotactic filters** — rejects vowel-less output and over-long consonant clusters (relaxed for harsh variants), plus a Sonority Sequencing check so "soft" styles read naturally
- **Word-likeness ranking** — big-tech blends are ranked by their probability under the real-brand Markov model, surfacing the most brand-like names
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

28 unit tests covering Markov determinism, phonotactic filters, blend logic, score ranges, phoneme affinity, sonority sequencing, word-likeness, and keyword extraction.

> Quick quality check: `cargo run -p neologism-core --example sample` prints a batch of names for every style and variant.

### Production build

```sh
cd web
npm run build:wasm   # rebuild wasm first if needed
npm run build        # output in web/dist/
```

## Features

- **Style selector** — Big Tech / Sci-Fi / Fantasy
- **Sub-styles** — Sci-Fi (Stellar / Machine / Alien) and Fantasy (Elvish / Dwarvish / Orcish / Common), plus "Mixed"
- **Controls** — count, min/max length, randomness (temperature), seed words, product description
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
- **Syllable structure & phonotactics** — onset/nucleus/coda phoneme classes ([Essentials of Linguistics §3.4](https://ecampusontario.pressbooks.pub/essentialsoflinguistics/chapter/3-4-syllable-structure/)). Basis for the phoneme-class model and validity filter.
- **Sonority Sequencing Principle** — Clements (1990), *The role of the sonority cycle in core syllabification*. Basis for the sonority validity check (clusters rise toward the vowel, fall away) used to keep soft styles pronounceable.
- **RAKE keyword extraction** — Rose, Engel, Cramer & Cowley (2010), *Automatic Keyword Extraction from Individual Documents*. Basis for description-driven naming — lightweight, training-free, runs in WASM.
- **Word-likeness (statistical language modeling)** — Shannon-style average log-probability under the trained Markov model. Basis for ranking big-tech blends by how typical they are of real brand names.
- **Intra-List Diversity (ILAD)** — Ziegler et al. (2005), building on Smyth & McClave (2001); average pairwise distance within a result set. Basis for the batch **diversity** metric.

> **What's *not* from a paper:** the metrics **composite score** (a weighted blend of the three per-name scores) and the **recommendation tips** (if-then UX rules) are pragmatic design choices, not drawn from research — only the diversity metric above is paper-grounded.

> **Implementation note:** every technique above is implemented from scratch in Rust as a *simplified, heuristic* adaptation — not a faithful reproduction of the source paper, and no third-party library code is used. Scoring operates on spelling (with light digraph handling), not a full grapheme-to-phoneme model.
