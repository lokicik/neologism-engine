# Neologism Engine

Generates invented names for three styles — **Big Tech brands**, **Sci-Fi**, and **Fantasy** — using a Rust engine compiled to WebAssembly and a React + Vite + TypeScript SPA. Name generation, Saved data, and taste processing run fully client-side; no backend or API keys are required for them.

Built for naming **packages, CLIs, libraries, and brands** — local generation is paired with on-request domain evidence and manual developer-namespace and trademark links, so you can investigate a displayed spelling before committing to it.

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
- **Description-driven naming** — simplified RAKE keyword extraction turns a product description into blend roots, with distinct offline semantic families for developer tools and common domains such as legal work, recruiting, delivery tracking, cloud deployment, meals, support, events, weather, habits, sales, and pet care; naming briefs get a scoped smoother-ending palette, structurally weak semantic forms become last-resort fallbacks rather than normal choices, and Respell styles only the product subject rather than audience or delivery words
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

160 unit tests covering Markov determinism, phonotactic filters, blend logic, score ranges, phoneme affinity, sonority sequencing, word-likeness, keyword extraction, semantic ranking, exclusion behavior, developer-domain coverage, guided metaphor/pair safety, first-page shape balance, and 100-name brief sessions.

> Quick quality check: `cargo run -p neologism-core --example sample` prints a batch of names for every style and variant.
> Keyword/root check: `cargo run -p neologism-core --example keyword_probe -- "your project brief"` prints the extracted keywords, ordinary semantic groups, isolated pair groups, and focused Respell sources used by the offline engine.
> Long-session check: `cargo run -p neologism-core --example concept_compare --release` audits ten rolling batches across eight representative briefs.
> Compound quality check: `cargo run -p neologism-core --example compound_compare --release` audits noun relevance, adjective–noun coherence, lexical echoes, structural scores, seed diversity, and 100-name capacity across twenty multi- and single-concept briefs.
> Developer-domain check: `cargo run -p neologism-core --example dev_domain_compare --release` audits semantic coverage across sixteen held-out developer briefs and both Brandable and Compound; from `web/`, `node e2e/dev-domain-audit.mjs` pins the same behavior in Chromium/WASM.
> Developer-namespace check: from `web/`, `node e2e/namespace-quality-audit.mjs` audits fifteen production cold Auto pages for npm/crates.io/registry semantics, direct-suffix concentration, quality-gated metaphor and scoped naming-role forms, duplicate Loom tails, filesystem leakage, structural quality, within-page similarity, and seed variety (`--verbose` prints every name).
> Guided-metaphor seed sweep: from `web/`, `node e2e/metaphor-seed-sweep.mjs` compares deterministic fallback offsets for the small Auto accent pool; any candidate still has to pass the complete namespace, cold, taste, and session audits before use.
> General-domain check: `cargo run -p neologism-core --example general_domain_compare --release` audits calibration and synonym-holdout prompts across eleven common product domains, independent seed sets, wrong-domain leakage, and rolling 100-name capacity in both Brandable and Compound.
> Broad-domain collision check: `cargo run -p neologism-core --example cross_domain_compare --release` audits 2,400 names across 48 domains, fails on any exact collision without a shared semantic root, and caps explained collisions at 1% while retaining composite, diversity, and per-domain uniqueness floors.
> Brandable morphology check: `cargo run -p neologism-core --example morphology_compare --release` audits 1,100 fixed-seed names plus 2,200 rolling-session names for the 75-point structural floor, transformation-family balance, collapsed suffixes, consonant metaphor seams, complete vowel-suffix seams, lossy shared overlaps, diversity, and 100-name capacity. Multi-concept joins that only resemble a collapsed metaphor seam are reported separately instead of counted as artifacts.
> Auto first-page check: from `web/`, `node e2e/auto-quality-audit.mjs` audits 85 deterministic guided pages, including product-subject Respell relevance and the one-or-two distinct 85+ metaphor contract (`--verbose` prints every page; `--forms` lists the metaphor forms).
> Cold Auto quality check: from `web/`, `node e2e/cold-quality-audit.mjs` audits 90 fixed pages, including the bounded weak/diversity repair, one-accent contract, structural floor, within-page similarity, guarded semantic/guided lead ordering, diversity-safe metaphor/two-concept final-gap retries, and non-leading semantic/existing-repair set upgrades.
> Held-out cold Auto check: from `web/`, `node e2e/heldout-cold-quality-audit.mjs` audits 105 production-path pages from 35 independent briefs and seeds plus 111 wording-stress pages covering AI workflow, recruiter tracking, feature flags, naming tools, color palettes, legal research, habit routines, education, terminal logs, message queues, delivery tracking, and cloud deployment, gating full batches, structural quality, concept coverage, family similarity, exact-stem concentration, suffix leads, the reviewed visible Respell inventory, scoped constructions, context-word leakage, and cross-seed first-page spread.
> First-impression sweep: from `web/`, `node e2e/first-impression-sweep.mjs` compares unchanged order, highest-score-first, guided-first, guarded guided-first, suffix-only non-template fallbacks, and semantic/guided near-ties at multiple quality tolerances over the same 90 pre-retry repaired name sets.
> Metaphor gap sweep: from `web/`, `node e2e/metaphor-gap-sweep.mjs` searches 72 deterministic seed offsets only against the remaining cold suffix leads, classifies Respell/capacity blockers, tries every eligible suffix replacement slot in production order, and reports whether each possible swap improves prefix-family balance and mean similarity.
> Construction gap sweep: from `web/`, `node e2e/construction-gap-sweep.mjs` compares the existing repair pool, deeper Brandable, semantic-pair, Compound, and metaphor pools on unresolved suffix and low-average pages, distinguishing lead-closing swaps from safe non-leading set upgrades while showing the exact production decision, replacement, concept coverage, quality, and similarity delta.
> Candidate quality probe: from `web/`, `node e2e/candidate-quality-probe.mjs PayMate RepLoop ...` scores hand-curated spellings with the browser engine's exact offline pronunciation, memorability, novelty, and composite metrics without adding them to generation.
> Personalized shortlist check: from `web/`, `node e2e/taste-quality-audit.mjs` audits 100 fixed pages across five briefs, four reference-name sets, and five seeds, gating structural quality, measured affinity uplift over engine order, specialized-brief retention, suffix-template balance, within-page family diversity, and meaningful variation across fresh sessions.
> Personalized session check: from `web/`, `node e2e/personalized-session-audit.mjs` compares hidden-pool and visible-only history over four deterministic 100-name sessions, then drives the real UI to 100 names while gating quality, brief coverage, uniqueness, and false exhaustion.
> Mode-aware taste check: from `web/`, `node e2e/mode-taste-audit.mjs` compares normal guided Auto with a bounded Compound accent pool for references that strongly prefer visibly two-part names, gating affinity, quality, vocabulary, brief coverage, and per-page mode share.
> Passed-review check: from `web/`, `node e2e/passed-history.mjs` drives the production Settings surface through scoped, cross-project, legacy, export, reload, focus, malformed-storage, and failed-write undo cases.
> Settings keyboard check: from `web/`, `node e2e/settings-keyboard.mjs` drives the production dialog through labeled modal focus containment and restoration, visible focus indicators, a dynamic final-pass focus handoff, and a 65-model mocked combobox covering capped-list scrolling, native text-editing keys, exact typed selection, mouse selection, and two-stage Escape behavior.
> Settings storage-failure check: from `web/`, `node e2e/settings-storage-failure.mjs` rejects the first AI-config write in the production dialog, then gates durable/in-memory truth, visible focused recovery at 390 pixels, Cancel behavior, successful retry, reload persistence, unchanged unrelated storage, and zero page errors.
> Corrupt Settings-config check: from `web/`, `node e2e/settings-corrupt-config.mjs` loads parseable wrong-type model/endpoint records, a non-object record, and a valid legacy partial record, then gates fail-closed Settings/Studio behavior, no repair-on-read, explicit Save recovery, current defaults, reload safety, and zero page errors.
> Recent-history corruption check: from `web/`, `node e2e/recent-history-corruption.mjs` loads non-array, mixed-type, valid, and oversized recent-name records, then gates non-destructive fail-closed reads, full Create pages, normal-generation repair, exact 20,000-name tail retention, and zero page errors or external HTTPS requests.
> Explicit-taste row corruption check: from `web/`, `node e2e/taste-row-corruption.mjs` mixes malformed entries into valid scoped and historical likes/passes, then gates startup safety, non-destructive reads, Saved/Settings identity, matched evidence, v2 export filtering, full personalized generation, and zero page errors or external HTTPS requests.
> Reference-name storage-failure check: from `web/`, `node e2e/taste-reference-storage-failure.mjs` rejects the first Advanced reference write, then gates persist-before-profile behavior, exact visible recovery, input focus/ring and 390-pixel containment, successful retry, reload persistence, unchanged unrelated storage, zero page errors, and zero external HTTPS requests.
> Create-filter keyboard check: from `web/`, `node e2e/command-chips-keyboard.mjs` drives the production Length, Creativity, and Advanced disclosures through category/state relationships, keyboard and pointer selection, visible focus, Escape restoration, natural forward/reverse focus exits, value preservation, single-popup behavior, and zero-network/storage-neutral interactions.
> Create-generation focus check: from `web/`, `node e2e/create-generation-focus.mjs` holds and rejects the first local generation load, then gates focusable busy semantics, duplicate keyboard/pointer suppression, visible focus, existing error truth, successful retry, exact shown-name history, unchanged unrelated storage, and zero page errors or external HTTPS requests.
> WASM initialization check: from `web/`, `node e2e/wasm-init-coalescing.mjs` holds a successful cold start and rejects a separate one, then gates one shared in-flight request, completed-init reuse across Create and Why, one clean retry after rejection, full-page recovery, retained Generate focus, and zero page errors or external HTTPS requests.
> Name-check keyboard/domain check: from `web/`, `node e2e/availability-evidence.mjs` drives the production per-card disclosure through named control relationships, keyboard and pointer entry, visible focus, Escape restoration, focus-safe busy/cancellation behavior, valid and unsupported spellings, session cache/reload semantics, responsive traversal, provider allowlisting, and zero-I/O manual-link inspection.
> Responsive-shell check: from `web/`, `node e2e/responsive-shell.mjs` drives fresh production navigation at 1280, 390, and 320 pixels, gating document-width containment before focus can hide an overflow, natural sidebar Tab order, six visible mobile-safe shell controls, Saved toolbar/grid/card containment, Settings focus restoration, unchanged storage, zero fetch/XHR calls, and zero external HTTPS requests.
> Sidebar current-page check: from `web/`, `node e2e/sidebar-current-view.mjs` drives the production shell at 390 pixels, gating a named application-navigation landmark, exactly one announced Create/AI Studio/Saved page, keyboard and pointer transitions, preserved visible focus, Settings-modal neutrality, unchanged storage, and zero page errors or external HTTPS requests.
> View-title check: from `web/`, `node e2e/view-title.mjs` drives Landing, Create, AI Studio, Saved, and Settings transitions at 390 pixels, gating truthful per-page browser titles, modal neutrality, keyboard and pointer paths, zero page errors, and zero external HTTPS requests.
> Landing-navigation focus check: from `web/`, `node e2e/landing-navigation-focus.mjs` drives keyboard, synthesized-click, pointer, reload, and About round trips through the production Landing/Create boundary, gating meaningful focus handoff, pointer-neutral behavior, visible 390/320-pixel heading focus, viewport stability, and zero page errors.
> Landing-demo mode-state check: from `web/`, `node e2e/landing-demo-mode-state.mjs` drives the four live Landing example modes by keyboard and pointer, gating a named native-button group, exactly one announced pressed state, preserved focus, unchanged storage, zero external HTTPS requests, and zero page errors.
> Empty-Saved navigation focus check: from `web/`, `node e2e/empty-saved-navigation-focus.mjs` drives keyboard and pointer round trips through the production empty Saved CTA, gating Create-field focus only for keyboard activation, visible focus, 320-pixel stability, unchanged storage, and zero page errors.
> Exhaustion-recovery focus check: from `web/`, `node e2e/exhaustion-recovery-focus.mjs` holds impossible exact filters through the production recovery action, then removes them, gating honest repeated exhaustion, focusable busy/retry semantics, cleared recent history, successful keyboard focus return, pointer neutrality, and zero page errors.
> Saved-removal focus check: from `web/`, `node e2e/saved-removal-focus.mjs` removes imported-only cards through keyboard, pointer, and forced storage-failure paths, gating next/final action focus only after durable keyboard success, pointer neutrality, exact stored rows, viewport stability, and zero page errors.
> AI Studio failure check: from `web/`, `node e2e/ai-studio-failure.mjs` drives the production Studio through initial and later ranking failures, local-pool fallback, truthful displayed-metric labels, same-pool Retry, single-active-operation guards, Settings focus restoration, and 390/320-pixel containment without using a real model or key.
> Feedback transaction check: from `web/`, `node e2e/feedback-transaction.mjs` forces browser-storage failures while switching likes and passes in Create and AI Studio, then gates old-choice rollback, honest neutral recovery when rollback also fails, visible errors, invoking-control focus, reload truth, and zero unhandled page errors.
> Liked-review check: from `web/`, `node e2e/liked-history.mjs` drives Settings through same-spelling project A/B/legacy likes plus a shared Saved copy, then gates exact neutralization, Saved/export/evidence updates, reload, focus, 390-pixel containment, and failed-write truth.
> Why-disclosure check: from `web/`, `node e2e/why-disclosure.mjs` drives two production cards through card-specific names and controlled regions, Enter/Space/pointer opening, Escape focus retention, live explanation completion, natural Tab order, 390-pixel containment, and zero added network/storage work.
> Why-failure recovery check: from `web/`, `node e2e/why-failure.mjs` rejects the first local WASM explanation load, then gates terminal non-busy guidance, trigger focus, 390-pixel containment, close/reopen retry, substantive recovery, unchanged storage, and zero page errors or external HTTPS requests.
> Clipboard-failure check: from `web/`, `node e2e/clipboard-failure.mjs` forces alternating clipboard rejection/success across card Copy, Saved Copy all, and Share link, gating visible errors, no false success, exact retry payloads, focus retention, 390-pixel containment, unchanged storage, and zero page errors.

### Audit exported taste data

After exporting **Local taste data** from Settings, measure how often the current offline
composite agrees with preference pairs derived from explicit likes and passes. Scoped pairs stay
inside one project; historical unscoped labels remain in a separate legacy bucket:

```sh
cargo run -p neologism-core --release --example taste_audit -- path/to/neologism-taste.json
```

The report includes derived-pair agreement, project-context counts, labels by source mode,
and the worst score-vs-label disagreements. It validates v2 comparison direction and context,
then counts unique `(project context, normalized name)` endpoints that actually participate in
at least one pair. The minimum descriptive-audit checkpoint is 10 matched likes and 10 matched
passes; 100 Cartesian pairs from one 10-by-10 context still count as 10/10, not 100 independent
observations. Historical unscoped pairs remain auditable but never satisfy that checkpoint.

Names received through a share link belong to Saved but are not likes, never activate the local
profile, and never enter this export. Likes and passes are separate unary actions, not randomized blind choices. Direct blinding and
reversed-choice consistency are therefore **not evaluated**, and 10/10 means enough to inspect,
not proof for new scorer weights. Judge readiness from one current v2 export. Multiple-file output
is descriptive only because the schema has no rater/profile/snapshot identity and cumulative
exports can double-count. The JSON preserves each name's brief but never the API key or recent-name
history.

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
- **Keyboard-operable Create filters** — Length, Creativity, and Advanced are named nonmodal disclosures with observable expanded/controlled state. Preset choices expose their selected value; Escape and selection return focus to the exact trigger, while natural Tab/Shift+Tab and outside clicks close without stealing the destination. Advanced keeps native form-field behavior and values, and every trigger, choice, and input has a visible focus ring; the panels are deliberately not modeled as ARIA menus or modal focus traps.
- **Focus-safe Create generation** — Generate remains a focusable button while local work is pending, exposes busy/disabled semantics without native-disabling itself, and keeps a visible ring through both failure and success. Keyboard and pointer repeats are ignored by the single logical-operation guard; an existing Create error remains visible on failure, while a normal retry returns the full page and records only the names actually shown.
- **Coalesced local engine startup** — concurrent cold Create sub-pools and on-demand helpers share one in-flight WASM initialization instead of fetching the same module four times. A successful page reuses the resolved initialization; a rejected start is shared consistently and then cleared so one explicit retry can perform one fresh local initialization.
- **Named, recoverable Why explanations** — every card's Why control includes the displayed name, exposes its expanded state and a unique controlled region, and keeps focus on the persistent trigger. Enter, Space, and pointer activation share one contract; Escape closes only that card's explanation without dropping focus. The local explanation reports polite live/loading state, adds no hidden Tab stop, and remains a nonmodal region rather than claiming menu or dialog behavior. If its local WASM load fails, busy state ends with visible guidance; closing and reopening Why performs a natural retry without touching storage or external services.
- **Truthful clipboard actions** — card Copy, Saved Copy all, and Saved Share link show success only after the browser accepts the clipboard write. Permission/privacy rejection produces a visible local alert, keeps focus on the invoking button, and can be retried without changing storage. Share encoding errors remain distinct from clipboard-access errors; a successful retry keeps the existing name/style-only share payload.
- **Brief-aware Compound mode** — readable two-word names use project-specific adjective palettes, semantic noun roots, and role-compatible pairings (`QuietInk`, `FairTally`, `SwiftSignal`) instead of arbitrary corpus combinations; recognized concepts keep their focused first page and expand to 100 fresh names on continued exploration
- **Project-scoped local taste selection** — add 3–8 example names you already like for an immediate local profile, or teach each project by starring/passing on 3+ generated names. Scoped feedback identity is `(project context, normalized name)`, so one spelling can be liked for project A and passed for project B without either action erasing the other; historical unscoped records remain in their separate null-context compatibility bucket. Future batches request up to a 6× offline candidate pool, reject structurally weak options when enough stronger names exist, preserve candidates that carry an additional brief concept, keep any one stem family to 20% of the visible page, cap one exact ending at 20% on naming briefs or 30% elsewhere, and reserve at least two slots for non-suffix naming forms when the pool allows it. If at least 75% of positive examples are visibly two-part names, guided Auto adds only three Compound candidates for the same local judge; explicit Compound remains the all-Compound path. A fresh manual generation explores a nearby high-quality shortlist while continued scrolling keeps one coherent taste direction. Only names actually shown enter recent history, so unshown shortlist candidates remain available on later pages. References and share-link imports stay separate from feedback/export data, and everything remains in `localStorage`.
- **Validated explicit feedback rows** — stored likes and passes must carry a safe name/style, finite syllable and score values, string connotations, and a complete scoped context when present. Malformed entries are ignored in memory so one bad row cannot crash Saved, Settings, export, or personalized Create; valid scoped and historical rows remain active. Filtering itself never rewrites the raw arrays; the previously documented legacy share-stub migration remains the one read-side write path.
- **Fail-closed recent history** — the operational recent-name record is accepted only as an all-string array and is capped to its newest 20,000 entries at both load and save. Parseable corruption cannot enter the generator exclusion list or block Create; loading leaves the raw record untouched, while the next successful generation naturally replaces invalid data with the names actually shown.
- **Focus-safe exhaustion recovery** — **Clear seen names & regenerate** remains focusable and visibly busy while retrying. If exact filters still yield no names, keyboard focus returns to the same honest exhaustion action; if corrected filters recover a page, focus returns to persistent Generate. The action clears only recent-name history, and pointer recovery does not force focus.
- **Truthful reference-name persistence** — Advanced “Names you like” updates the active local shape profile only after the browser stores the edited string. If storage rejects the write, the previous field value, 2/3-style progress, and ranking direction remain active; an inline alert names the failure and the focused input can retry naturally. A successful retry clears the alert, activates the new references, and survives reload without touching other local data.
- **Taste data export** — Settings turns explicit likes and passes into a versioned JSON dataset, preserving each name's project brief while keeping scoped preference pairs inside one project and historical unscoped labels in a separate legacy bucket. Share-only Saved names are excluded. The UI separately tracks unique matched likes and passes toward the 10/10 descriptive-audit checkpoint, so one-sided, legacy, or cross-project totals cannot look ready. It never exports AI credentials or recent-name history.
- **Reviewable pass feedback** — Settings keeps passed names in a collapsed local review surface. Every row shows its naming style, project brief and roots, or the historical unscoped bucket; undo removes only that exact `(project context, normalized name)` pass and makes it neutral without liking or saving it. A failed browser-storage write leaves the row and taste evidence unchanged instead of pretending the undo succeeded.
- **Reviewable like feedback** — Settings gives explicit likes their own collapsed review surface instead of forcing Saved's spelling-wide removal. Same-spelling likes from different projects and the historical unscoped bucket remain separate rows; undo makes only that exact like neutral, never passes the name, and preserves other-project likes plus any shared Saved copy. Share-only names never appear as likes. A failed browser-storage write leaves the row, Saved provenance, and taste evidence unchanged.
- **Recoverable like/pass switches** — switching an exact project-scoped name removes its old feedback label before writing the new one. If the second browser-storage write fails, the app makes a best-effort rollback and keeps the visible state aligned with what remains durable; if rollback also fails, that exact name becomes visibly neutral instead of appearing both liked and passed. The failure is announced in Create or AI Studio and never becomes an unhandled page error.
- **Keyboard-accessible Settings** — Settings is a labeled modal focus boundary: opening moves focus inside, Tab and Shift+Tab stay contained, every close path restores the opener, and focus rings remain fully visible at the overflow-clipped disclosure boundary. The editable model picker exposes combobox/listbox state, keeps Home/End as native caret controls, supports Arrow Up/Down, Enter, Escape, and mouse selection, and scrolls its active option into view without moving DOM focus away from the input.
- **Truthful Settings persistence** — AI provider, model, prompt, endpoint, and key update the running app only after the browser accepts the existing local-storage write. A rejected write keeps the dialog and edited draft open, preserves the previous durable and in-memory config, exposes a visible alert beside the focused Save action, and supports a normal retry. Cancel after failure discards the unsaved draft; a successful retry survives reload without touching unrelated local data.
- **Fail-closed AI config loading** — the local AI record is runtime-validated before Settings or AI Studio receives it. Valid partial records inherit current defaults and unknown future fields are ignored in memory; a wrong-type known field or non-object record disables AI safely instead of crashing model, endpoint, or readiness operations. Reading never rewrites the original record. An explicit Settings Save replaces it with the current valid shape.
- **Contained responsive shell** — at 640 pixels and below, the six existing shell controls wrap in their unchanged DOM and Tab order instead of widening the document; their mobile targets are at least 40 pixels high. At 560 pixels and below, result cards can shrink to the available single column instead of retaining the old 300-pixel grid minimum. No overflow clipping or horizontal-scroller workaround hides content.
- **Keyboard-aware view navigation** — keyboard and synthesized activation of any Landing entry action or the empty Saved **Go create** action moves focus into Create's brief field; keyboard About navigation moves focus to the Landing heading, where the next Tab reaches the hero action. Pointer entry and ordinary reload do not force a form or heading focus. The narrow heading box and its visible focus ring remain contained at 390 and 320 pixels.
- **Announced live Landing modes** — the four visual mode examples remain ordinary native buttons in one named selection group. Exactly one exposes `aria-pressed=true`, and keyboard or pointer selection moves that announced state without replacing the focused button or pretending the demo is a tablist/menu.
- **Truthful AI Studio recovery** — a failed optional AI ranking never hides the 24 names already generated locally. A first failure shows their untouched engine order without AI reasons or a false pick; a later metric failure keeps the last successful order and label. The visible alert can retry the same pool and frozen criterion or open Settings, while focus stays on the invoking control and one pending operation cannot start a competing request. No pool, error, or retry state is persisted.
- **Brief-aware Auto** — a project description gets semantic Brandable names plus at most one mode accent. A Respell earned by a main product concept gets priority only after it clears the same 75-point visible-quality floor; a weak but related spelling can no longer starve a stronger construction. When no safe Respell exists, Auto may surface one 85+ root-and-metaphor Brandable selected from a bounded offline pool (`Keyflow`, `Tagwave`) instead of showing only suffix templates. A second form with a different metaphor ending may replace one direct-suffix card only when it is at least as strong; the page never shows more than two guided metaphors. If the first pool has fewer than two qualifying forms, a deterministic second pool may fill the missing slot on a fresh first page only; primary-pool winners keep first refusal and continued sessions keep their original direction. After normal repair and ordering, a still-mechanical cold lead may open small deterministic retry pools. A lead-closing candidate enters only if there is no Respell, guided capacity remains, it replaces a no-stronger suffix, does not deepen an overflowing prefix family, and does not increase mean similarity. An 84+ two-concept pair that cannot lead may instead replace a non-leading Brandable only when it gains at least two structural points, preserves concept coverage, and keeps both name-family caps and mean similarity from worsening. Small domain-specific pair lanes can express missing tool roles without widening ordinary Brandable; formatter/linter briefs, for example, can surface `TidyKit` or `LintFix`. The same proven-gap path may reuse one unused 85+ non-template Brandable from the already-generated repair pool under those set guards, without another engine call. Incidental words such as `developer`, `builder`, `companion`, `planner`, or `reminder` cannot take the Respell slot when a stronger product subject is present. Strong, explicit two-part local taste may contribute a bounded Compound accent without changing the cold default. On a cold page, a separate Brandable-only fallback replaces missing/sub-75 slots and makes only quality-neutral substitutions when the full page is too repetitive, without adding another mode accent. If four of ten cards still begin with the same exact four-letter stem, that bounded pool may replace a non-leading ordinary Brandable only with a non-suffix candidate that preserves quality and concept coverage while improving every measured repetition guard. An empty brief keeps the broader four-mode sampler.
- **Readable Auto Respell** — Auto admits only compact, easily reversible brand spellings: a short `i -> y` form such as `Desygn` / `Vysual`, or a final `e` drop such as `Browsr`. Mid-word vowel damage such as `Grocry`, `Monytor`, and `Filesystm` yields to a stronger guided Brandable; explicit Respell mode keeps the broader exploratory vocabulary.
- **Terminal-log intent normalization** — briefs that combine terminal, shell, console, command, or CLI language with logging/monitoring use one stable `Term` / `Shell` / `Prompt` / `Log` / `Exec` / `Pane` palette beside the existing observability roots. Audience and function words such as `developer`, `output`, `inspection`, and `viewer` cannot become names or steal the Respell accent; CLI keeps its ordinary developer meaning outside this combined context.
- **Message-queue intent normalization** — queue, broker, stream, topic, and bus briefs share one stable messaging palette with a scoped `Pub` lane from publish/subscribe terminology. Context words such as `async`, `developer`, `event`, and `monitoring` cannot replace the product domain or take the Respell accent; unrelated uses of those words remain unchanged.
- **Household inventory roles** — a brief that explicitly combines household belongings with a catalog or inventory can use the isolated `StowLog` / `StowTag` / `StowMap` pair family; generic catalogs and ordinary Brandable keep their existing vocabulary.
- **Recruiter workflow roles** — candidate/applicant-tracking briefs can use the isolated `JobLoop`, `HireHub`, and related hiring-workflow pair family. Auto now prefers that clear workflow role over damaged long forms such as `Recruitr` / `Recruyt`; explicit Respell remains available for deliberate exploration, and unrelated trackers never open this pool.
- **Feature-flag control roles** — feature flag/toggle/rollout briefs can use the isolated `FlipOps`, `FlipKit`, and related control-role pair family. Auto preserves its strongest metaphor and admits the pair only through the existing guarded replacement path, avoiding another `Gate...` card on already repetitive pages. Audience words such as `developer` remain available to ordinary Brandable semantics but cannot consume this brief's Respell accent.
- **Naming-tool word-making roles** — explicit naming engines, product-name generators, and package-name availability tools can use the isolated `LexLoom` / `LexMint` family. Auto keeps the strongest existing metaphor; a role must improve a direct suffix by two points when it shares that page, while the sole guided form may make a no-weaker replacement. If a strong `Keyloom` is already visible, Auto tries `LexMint` instead of repeating the Loom tail. Both insertion paths require an eligible mechanical Lex-suffix card to leave rather than creating a fourth `Lex...` card. Baby-name journals, word puzzles, brand analytics, and unrelated product tools do not open this lane.
- **Color-palette variation** — explicit color/palette design briefs supplement the generic visual roots with viable `Tone` / `Tint` families. A strong prompt-linked Respell such as `Vysual` may keep its slot beside one 85+ metaphor such as `Toneseed` or `Toneloom`, breaking otherwise identical suffix-heavy seed pages without widening generic design-token briefs. In this scoped lane, audience/function words such as `designer`, `generator`, and `scheme` cannot become Brandable roots or consume the Respell accent.
- **Sharper AI vocabulary** — AI/model/agent/automation briefs use the more specific `Cogn`, `Logic`, and `Axiom` families instead of relying on generic `Mind` / `Spark` roots. This yields forms such as `Logicia`, `Cognora`, and `Axiomia` beside the existing two-concept `CogLoop` role, while explicit unknown-domain uses of the word “spark” remain available rather than being globally blocked.
- **Stronger cold first impression** — on a fresh, unpersonalized Auto page, an existing guided form may move to the first card only when it is at least as structurally strong and carries at least as many brief concepts as the current lead. If a direct suffix still leads, a non-suffix form normally needs the same coverage plus a full two-point quality advantage. One final near-tie rule allows at most a half-point trade only when the alternative adds a brief concept or is already a quality-gated guided form. Ordering alone preserves the ten-name set; the final targeted retry may swap one weaker suffix to close a proven gap, then reuse at most one existing repair candidate to upgrade a non-leading card without changing the first result. Local taste keeps full ownership once taught, and Load more keeps its session order.
- **Deep brief sessions** — initial semantic batches stay focused; later Brandable batches search a deeper curated metaphor pool on the visible ten-name rhythm, independent of any larger hidden taste pool, so repeated scrolling reaches 100 fresh, prompt-linked names while keeping structurally weak forms out whenever a full stronger page remains.
- **Root-preserving coinages** — concept suffixes keep the full semantic root at vowel boundaries (`Bridgeora`, not the lossy `Bridgea`; `Cacheora`, not `Cachera`)
- **Readable semantic joins** — concept pairs keep meaningful boundary consonants (`Poolledger`, not `Pooledger`); awkward vowel collisions and shared-overlap typos such as `Aurank`, `Settledger`, and `Tagent` are skipped for a cleaner pair.
- **Score bars** — pronounceability, novelty, and memorability per generated name
- **Provenance-safe Saved collection** — explicit stars and names received from share links appear together once per spelling, while cards explain whether the source was a project like, a historical unscoped like, a share, or a combination. Share-only names are not taste evidence. Removing a name backed by multiple sources requires confirmation; passes are preserved. TXT, JSON, and forwarded share links expose only the deduplicated spelling/style shortlist. The collection persists in `localStorage`.
- **Focus-safe Saved removal** — after a durable keyboard removal, focus moves to the next card's Remove action (or the previous card when the removed card was last); removing the final card focuses the empty-state **Go create** action. Pointer removal does not force focus. A rejected browser-storage write keeps the card, durable row, and invoking Remove focus instead of pretending the collection changed.
- **On-request domain evidence** — opening Name checks sends nothing. Each card exposes its checks as a named nonmodal region: opening moves focus into that region, Escape returns to the exact card trigger, and a running lookup remains focusable instead of dropping keyboard context. An explicit domain action sends only the displayed valid label, plus normal IP/request metadata, through six lookups across four third-party providers: Verisign, Identity Digital, Google Registry, and Cloudflare. It reports time-stamped registry-record evidence for `.com`, `.ai`, `.app`, and `.dev`, and DNS evidence for `.io` and `.co`; the absence of an exact record or DNS answer is not legal, trademark, or market clearance. GitHub, npm, PyPI, crates.io, USPTO, and EUIPO remain manual links and are **not evaluated**. Those providers receive the name only when their link is opened. These domain requests never include the project brief, Saved/taste data, or AI credentials; generation and taste processing remain local.
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
