# Neologism Engine

Generates invented names for three styles — **Big Tech brands**, **Sci-Fi**, and **Fantasy** — using a Rust engine compiled to WebAssembly and a React + Vite + TypeScript SPA. Name generation, Saved data, and taste processing run fully client-side; no backend or API keys are required for them.

Built for naming **packages, CLIs, libraries, and brands** — local generation is paired with on-request domain evidence and manual developer-namespace and trademark links, so you can investigate a displayed spelling before committing to it.

## Interface

Create opens immediately with up to ten Auto names. A brief is optional. **More names** continues the current discovery; **Generate** starts a new one after you change the brief or Options. Downward scrolling can append one page at a time, with **Load more** available for explicit control. A same-tab reload retains the list and its position when session storage is available.

Save promising names, inspect their evidence in **Details**, and compare two to four in **Saved**. Search preserves collection order; removal offers Undo. **Tools** contains Lab, AI Studio, Settings, and About. Lab exposes every existing generator and experiment through one method selector; its generation state is separate from Create.

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

An isolated [brief-conditioned holistic GRU research lane](research/holistic/README.md)
tests whether a whole-name character model can move beyond assembled
root/suffix/metaphor forms without changing production. Its first frozen runs
are negative checkpoints: the compact deterministic GRU export and Python/Rust
parity passed, but its sealed conditioning gates did not; a later two-stage
contrastive scorer was also near random and weaker than lexical overlap. No
model was shipped or connected to Auto.

The isolated **Shared pool · Lab** mode compares nine existing naming families
before the Auto page is assembled. It keeps up to four finalists and exposes
structured candidate provenance and rejection traces. It is LLM-free and does
not change Auto or saved taste data. See the [experiment and verification guide](research/shared-pool/README.md)
and [retained comparison](research/shared-pool/REPORT.md). Human preference
evaluation is still pending; larger pools are not a better-name claim.

The follow-up **Brief intent · Lab** preserves operation/object/context terms
with a deterministic Rust grammar before filling the same pool. It remains
experimental: see the [implementation and replay guide](research/brief-intent/README.md)
and [comparison with editorial findings](research/brief-intent/REPORT.md).

The **Operation and object** method in Tools → Lab tests
separate lexical evidence for both roles. It is opt-in; its
[retained diagnosis](research/operation-object/REPORT.md) did not establish a
preference advantage. See the [implementation and replay guide](research/operation-object/README.md).

The subsequent [quality-cause investigation](research/quality-cause/REPORT.md)
isolates semantic role dilution, selection losses over fixed candidate pools,
and pronunciation-filter false rejections. It changes no production behavior;
the controlled results diagnose causes rather than establish a preference win.

The [meaning-first implementation](research/meaning-first/README.md) and its
[retained comparison](research/meaning-first/REPORT.md) remain reproducible as
`semantic_pool`. Its successor is available as **Product frame** in Tools → Lab. It adds sense-constrained benefit
associations and complete-word constructions, then selects eligible names
without literal-coverage priority. See the [paper comparison](research/product-frame/RESEARCH.md)
and [implementation results and examples](research/product-frame/REPORT.md).
The option defaults off; human preference gates remain pending.

The latest [product-relation revision](research/product-brief/README.md) recognizes
equivalent action/noun phrases, retains support words separately, and carries
the explicit benefit-root budget into blend producers without untyped neighbor
padding. The **Product brief** Lab method runs `brief_pool`; prior experimental exports
remain available for frozen replay. See [current comparisons](research/product-brief/REPORT.md).

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

The workspace currently has 232 passing Rust tests. Engine quality controls remain separate from interface behavior. From `web/`:

```sh
node e2e/auto-quality-audit.mjs
node e2e/heldout-cold-quality-audit.mjs
node e2e/cold-quality-audit.mjs
node e2e/taste-quality-audit.mjs
node e2e/mode-taste-audit.mjs
node e2e/shortlist-contract.mjs
node e2e/discovery-contract.mjs
node e2e/discovery-resilience.mjs
node e2e/saved-contract.mjs
node e2e/navigation-contract.mjs
node e2e/ui-surfaces.mjs
```

The [current browser contracts](web/e2e/README.md) cover discovery sessions, constraints, late responses, failure recovery, Saved/Undo, comparison, shared links, keyboard operation, responsive layout, contrast, and a 500-card rendering fixture. `shortlist-contract` checks the full Auto list and the unchanged legacy shortlist algorithm independently. The [previous phase-by-phase validation guide](docs/uiux-2026-09-07/previous-validation-guide.md) is historical; its old UI selectors are not a claim about the redesigned interface.

The [delivery report](docs/uiux-2026-09-07/REPORT.md) records exact checks, preserved data, local commits, and before/after captures. Structural measurements are not a human preference result.

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

The locked web build chain is intentionally small: Vite's WASM plugin is sufficient for the
generated module, so the separate top-level-await transform and its SWC/UUID dependency tree are
not installed. At the 2026-08-13 checkpoint, the committed lockfile reports zero npm advisories;
this is build-tool hygiene, not a claim that future registry advisories cannot appear.

## Features

- **Style selector** — Big Tech / Sci-Fi / Fantasy
- **Sub-styles** — Sci-Fi (Stellar / Machine / Alien) and Fantasy (Elvish / Dwarvish / Orcish / Common), plus "Mixed"
- **Controls** — count, min/max length, randomness (temperature), seed words, product description, starts-with / contains constraints
- **Keyboard-operable Create filters** — Length, Creativity, and Advanced are named nonmodal disclosures with observable expanded/controlled state. Preset choices expose their selected value; Escape and selection return focus to the exact trigger, while natural Tab/Shift+Tab and outside clicks close without stealing the destination. Advanced keeps native form-field behavior and values, and every trigger, choice, and input has a visible focus ring; the panels are deliberately not modeled as ARIA menus or modal focus traps.
- **User-controlled Landing name motion** — the live hero example has one visible Pause/Resume control that keeps its current generated name, all four decorative name-wall rows, and keyboard focus stable. Visitors who prefer reduced motion start paused; enabling that preference while Landing is open also pauses both layers. Returning to ordinary motion never resumes automatically, while an explicit Resume may rotate the hero spelling but cannot override the preference that keeps the wall animation off. The choice is not persisted and adds no storage or network work.
- **Truthful Landing privacy boundary** — Landing describes name generation as local and offline without claiming that every optional workflow stays inside the tab. Domain evidence, manual lookup links, and AI ranking remain user-started third-party actions; the app itself has no account, tracking, or naming backend.
- **Truthful Landing repeat boundary** — Landing derives its displayed 20,000-name rolling guard directly from the shipped recent-history constant. Exact repeats stay outside that current window; the separate 100,000-name full-session research sweep is not presented as the browser app's promise.
- **Readable Landing footnotes** — the small captions carrying provider, repeat-window, and local-generation boundaries use the full muted-text color instead of a second opacity reduction. Against their shipped tile surface they render above the 4.5:1 small-text contrast threshold at desktop and narrow widths.
- **Truthful first-entry persistence** — entering from Landing still opens Create when browser storage rejects the existing visited marker, but the page now says that it could not remember the visit and that Landing may return later. Keyboard entry keeps its normal brief-field focus. Reloading the same history entry may remain in Create; a new root visit falls back to Landing until a later marker write succeeds. The warning is session-only and changes no storage key, navigation rule, or network behavior.
- **Visible Create mode focus** — Auto, Brandable, Real words, Respelled, and Compound retain their single `aria-pressed` selection and native button behavior while sharing a fully contained 2px keyboard-focus ring at desktop and narrow widths.
- **Visible, contained primary text fields** — Create's main project brief shares the contained 2px keyboard-focus ring already used by AI Studio's brief and Custom criterion, while the surrounding command bar keeps its existing focus-within boundary. At 320 pixels the Custom criterion can shrink beside its natural-width Rank action, keeping both controls and the focused ring inside the document instead of widening the page.
- **Contained keyword trace** — Create still displays every extracted brief term in full, including long unbroken package-like strings, but wraps that trace at arbitrary character boundaries when necessary so user input cannot widen the 320-pixel product shell.
- **Focus-safe Create generation** — Generate remains a focusable button while local work is pending, exposes busy/disabled semantics without native-disabling itself, and keeps a visible ring through both failure and success. Keyboard and pointer repeats are ignored by the single logical-operation guard; an existing Create error remains the sole live failure channel, while successful first pages and infinite-scroll additions update one atomic polite status with the exact number of names currently shown. A normal retry returns the full page and records only the names actually shown.
- **Coalesced local engine startup** — concurrent cold Create sub-pools and on-demand helpers share one in-flight WASM initialization instead of fetching the same module four times. A successful page reuses the resolved initialization; a rejected start is shared consistently and then cleared so one explicit retry can perform one fresh local initialization.
- **Named, recoverable Why explanations** — every card's Why control includes the displayed name, exposes its expanded state and a unique controlled region, and keeps focus on the persistent trigger. Enter, Space, and pointer activation share one contract; Escape closes only that card's explanation without dropping focus. The local explanation reports polite live/loading state, adds no hidden Tab stop, and remains a nonmodal region rather than claiming menu or dialog behavior. If its local WASM load fails, busy state ends with visible guidance; closing and reopening Why performs a natural retry without touching storage or external services.
- **Truthful Saved action feedback** — card Copy, Saved Copy all, and Saved Share link show and politely announce the exact completed action only after the browser accepts the clipboard write. When overlapping clipboard promises settle out of order, only the newest invoked action may update its card or Saved-page feedback; an older error cannot erase a newer success, and an older success cannot hide a newer error. Each repeated Copy all or Share success restarts its full visual confirmation window instead of letting an older timer clear the newer state; leaving Saved clears pending visual timers. Saved TXT and JSON likewise announce only after their existing browser download starts. Permission/privacy rejection clears stale success, produces a visible local alert, keeps focus on the invoking button, and can be retried without changing storage. Share encoding errors remain distinct from clipboard-access errors; a successful retry keeps the existing name/style-only share payload.
- **Brief-aware Compound mode** — readable two-word names use project-specific adjective palettes, semantic noun roots, and role-compatible pairings (`QuietInk`, `FairTally`, `SwiftSignal`) instead of arbitrary corpus combinations; recognized concepts keep their focused first page and expand to 100 fresh names on continued exploration
- **Project-scoped local taste selection** — add 3–8 example names you already like for an immediate local profile, or teach each project by starring/passing on 3+ generated names. Scoped feedback identity is `(project context, normalized name)`, where the name key is trimmed, lowercased, and NFC-normalized; one spelling can therefore be liked for project A and passed for project B without either action erasing the other, while canonically equivalent Unicode forms cannot inflate same-project evidence. Historical unscoped records remain in their separate null-context compatibility bucket. Future batches request up to a 6× offline candidate pool, reject structurally weak options when enough stronger names exist, preserve candidates that carry an additional brief concept, keep any one stem family to 20% of the visible page, cap one exact ending at 20% on naming briefs or 30% elsewhere, and reserve at least two slots for non-suffix naming forms when the pool allows it. If at least 75% of positive examples are visibly two-part names, guided Auto adds only three Compound candidates for the same local judge; explicit Compound remains the all-Compound path. A fresh manual generation explores a nearby high-quality shortlist while continued scrolling keeps one coherent taste direction and the visible page's original project context, even if the command controls are being edited for a later request. The visible local-taste note and result-derived tips remain attached to that result owner until a successful fresh generation takes over. Only names actually shown enter recent history, so unshown shortlist candidates remain available on later pages. References and share-link imports stay separate from feedback/export data, and everything remains in `localStorage`.
- **Validated explicit feedback rows** — stored likes and passes must carry well-formed Unicode across their name, connotations, and scoped context id/description/roots, plus a safe style, finite syllable and score values, and a complete scoped context when present. Optional source mode, guided construction/rank, concept coverage, and lexical-hazard metadata must also match the runtime `NameResult` contract before a row can teach local taste or enter an export. Malformed entries are ignored in memory so one bad row cannot crash, leak replacement glyphs, create a fictitious taste mode, or contaminate Saved, Settings, export, and personalized Create; valid astral pairs and valid optional metadata remain active. Filtering itself never rewrites the raw arrays; the previously documented legacy share-stub migration remains the one read-side write path.
- **Fail-closed recent history** — the operational recent-name record is accepted only as an all-string array and is capped to its newest 20,000 entries at both load and save. Parseable corruption cannot enter the generator exclusion list or block Create; loading leaves the raw record untouched, while the next successful generation naturally replaces invalid data with the names actually shown. If browser storage rejects a history write, the current session still avoids those names but Create visibly warns that they may return after reload. A later accepted write persists both the missed and current visible batches and clears that warning.
- **Focus-safe exhaustion recovery** — **Clear seen names & regenerate** remains focusable and visibly busy while retrying. If exact filters still yield no names, keyboard focus returns to the same honest exhaustion action; if corrected filters recover a page, focus returns to persistent Generate. The action clears only recent-name history, and pointer recovery does not force focus.
- **Focus-safe example generation** — choosing an empty-state project example by keyboard moves focus to the persistent Generate action before the example list unmounts, retaining a visible place through local generation and its result page. Pointer selection keeps native pointer focus behavior.
- **Truthful reference-name persistence** — Advanced “Names you like” updates the active local shape profile only after the browser stores the exact edited string. The writer rejects ill-formed or over-240-unit values before touching storage instead of silently slicing a surrogate pair; the previous field value, progress, and ranking direction remain active with the existing inline failure guidance. A successful retry clears the alert, activates the new references, and survives reload without touching other local data. Reload accepts only well-formed Unicode inside the same 240 UTF-16-unit limit; malformed or oversized raw values remain untouched for inspection but cannot silently activate or widen the controlled input.
- **Taste data export** — Settings turns explicit likes and passes into a versioned JSON dataset, preserving each name's project brief while keeping scoped preference pairs inside one project and historical unscoped labels in a separate legacy bucket. Share-only Saved names are excluded. The UI separately tracks unique matched likes and passes toward the 10/10 descriptive-audit checkpoint, so one-sided, legacy, or cross-project totals cannot look ready. A browser download failure is announced without a false success; retry uses the same current dataset, and both failed and successful click paths release their temporary object URL. It never exports AI credentials or recent-name history.
- **Reviewable pass feedback** — Settings keeps passed names in a collapsed local review surface. Every row shows its naming style, project brief and roots, or the historical unscoped bucket; undo removes only that exact `(project context, normalized name)` pass and makes it neutral without liking or saving it. A failed browser-storage write leaves the row and taste evidence unchanged instead of pretending the undo succeeded.
- **Reviewable like feedback** — Settings gives explicit likes their own collapsed review surface instead of forcing Saved's spelling-wide removal. Same-spelling likes from different projects and the historical unscoped bucket remain separate rows; undo makes only that exact like neutral, never passes the name, and preserves other-project likes plus any shared Saved copy. Share-only names never appear as likes. A failed browser-storage write leaves the row, Saved provenance, and taste evidence unchanged.
- **Recoverable like/pass switches** — switching an exact project-scoped name removes its old feedback label before writing the new one. If the second browser-storage write fails, the app makes a best-effort rollback and keeps the visible state aligned with what remains durable; if rollback also fails, that exact name becomes visibly neutral instead of appearing both liked and passed. The failure is announced in Create or AI Studio and never becomes an unhandled page error.
- **Keyboard-accessible, network-truthful Settings** — Settings is a labeled modal focus boundary: opening moves focus inside, Tab and Shift+Tab stay contained, every close path restores the opener, and focus rings remain fully visible at the overflow-clipped disclosure boundary. The editable model picker exposes combobox/listbox state, keeps Home/End as native caret controls, supports Arrow Up/Down, Enter, Escape, and mouse selection, and scrolls its active option into view without moving DOM focus away from the input. Duplicate exact model ids collapse to the provider's first valid row before the 60-option window is built, so one id cannot create ambiguous accessible options or displace later choices. A saved/manual model that is absent from a refreshed catalog no longer hides every new option as though its complete id were an active search; the list remains browsable until the user actually edits the field, at which point ordinary filtering resumes. A query with zero catalog matches truthfully says manual entry remains possible without promising that an arbitrary id will work. If an untouched current id is absent after a nonempty provider list settles, the picker names that mismatch with OpenRouter- or localhost-specific guidance and points to choosing a reported model or verifying the id instead of silently implying that the saved value was rediscovered. When AI is enabled, the modal explicitly says that Settings requests model choices from the selected provider; the automatic OpenRouter catalog request carries no API-key authorization header, while the key is sent only by an on-demand AI Studio ranking. A nonempty OpenRouter catalog remains session-cached, but an HTTP-success response whose rows all filter out is retried on the next Settings discovery instead of making the empty result permanent for that tab. During that empty state, the provider-owned [`openrouter/free`](https://openrouter.ai/docs/guides/routing/routers/free-router) option remains selectable and is explicitly labeled as a variable-model fallback until a later live catalog replaces it; the app no longer seeds that recovery path with drifting specific-model ids. A localhost endpoint is rechecked on every discovery so reopening Settings cannot keep showing a model that the same local server has replaced. If its newly reported loaded model differs from the exact saved selection, Settings keeps that selection user-owned but exposes the mismatch until the reported model is chosen. If discovery instead yields no valid model, the picker says so and points to manual id entry plus endpoint/CORS recovery instead of mislabeling the provider failure as a text-search miss. Changing provider or endpoint clears the prior discovery scope immediately; stale options cannot be selected under the new loading state. Changing that scope or closing Settings aborts its owned pending discovery request instead of merely ignoring the eventual response. Ollama setup shows the exact current app origin for [`OLLAMA_ORIGINS`](https://docs.ollama.com/faq#how-can-i-allow-additional-web-origins-to-access-ollama) instead of instructing users to allow every web origin; the dynamic command wraps without widening the narrow Settings modal.
- **One honest, brief-aware AI-ranking prompt surface** — Settings configures the provider connection and model actually consumed by AI Studio; it no longer exposes a judge-prompt field that Studio would silently replace. The visible **Custom ranking criterion** remains the user-owned ranking instruction. Each local 24-name pool freezes the trimmed project brief that created it, and optional ranking asks the configured model to judge both that context and the selected criterion. Editing the draft cannot silently redefine an existing pool; metric switches and Retry keep its frozen brief, while a new pool adopts the new draft and an empty brief preserves generic metric-only ranking. The sent brief is bounded to 240 input units and quoted as context rather than instructions. Studio discloses beside the action that ranking sends the displayed names, selected criterion, and pool-owned brief to the configured provider. The stored `prompt` field and library default remain readable for backward compatibility, but legacy prompt data cannot resurrect the retired Settings control or alter Studio's metric-owned request.
- **Truthful model-catalog rows** — model discovery validates each provider row independently, so a numeric, ill-formed, empty, or control-character id cannot erase valid neighboring options or become selectable. If a provider repeats one exact id, the first valid row owns its complete metadata and later duplicates are discarded before sorting and caching; conflicting duplicate prices cannot create a second option or silently overwrite the first. OpenRouter models with missing, malformed, or variable pricing remain visibly unknown instead of being labeled free or producing a negative estimate; only a `:free` id or an explicit zero/zero price pair is treated as free. A finite raw price whose per-million label or estimated request total overflows JavaScript's numeric range also stays `$?`, never `$Infinity` or `$NaN`. Optional malformed names/context sizes are omitted without changing a usable model id, while localhost's existing local-cost fallback remains zero.
- **Shared localhost model identity** — when a local AI configuration leaves its model blank, AI Studio resolves `/models` through the same row validator as Settings. Numeric, ill-formed, control-character, and empty leading ids are skipped; the first valid id is trimmed once and used consistently for the chat body and cache identity. An explicit nonblank id crosses the same validation boundary before readiness or persistence, while blank continues to mean OpenRouter default or localhost auto-detect. A malformed catalog prefix can no longer hide a later usable model or send an unvalidated value to the server.
- **Truthful Settings persistence** — AI provider, model, endpoint, and key update the running app only after the browser accepts the existing local-storage write. A rejected write keeps the dialog and edited draft open, preserves the previous durable and in-memory config, exposes a visible alert beside the focused Save action, and supports a normal retry. Cancel after failure discards the unsaved draft; a successful retry survives reload without touching unrelated local data.
- **Fail-closed AI config loading** — the local AI record is runtime-validated before Settings or AI Studio receives it. An enabled OpenRouter record needs a non-empty, well-formed key without HTTP-unsafe control characters; a dormant key is never trimmed or silently rewritten. A localhost request base keeps its existing outer-whitespace and trailing-slash normalization but rejects embedded controls, backslashes, and literal or percent-encoded one/two-dot path segments that the URL parser would silently remove, reinterpret, or collapse. Valid partial records inherit current defaults and unknown future fields are ignored in memory; a wrong-type known field, unsafe active credential or endpoint, or non-object record disables AI safely instead of crashing model, endpoint, header, or readiness operations. Reading never rewrites the original record. An explicit Settings Save replaces it with the current valid shape.
- **Contained responsive shell** — at 640 pixels and below, the six existing shell controls wrap in their unchanged DOM and Tab order instead of widening the document; their mobile targets are at least 40 pixels high. At 560 pixels and below, result cards can shrink to the available single column instead of retaining the old 300-pixel grid minimum. No overflow clipping or horizontal-scroller workaround hides content.
- **Contained Create-card actions** — the five Create actions keep their Why → Name checks → Copy → Pass → Save DOM and Tab order while the row wraps naturally on a card too narrow for one line. Every action exposes the same contained 2px keyboard-focus ring; none is clipped or pushed beyond the 320-pixel document.
- **Visible Saved toolbar focus** — Copy all, TXT, JSON, and Share link retain their existing order, sizing, and actions while sharing the same contained 2px keyboard-focus ring at desktop and narrow widths.
- **Visible shell navigation focus** — logo, Create, AI Studio, Saved, Settings, and About retain their natural DOM and Tab order while sharing the same contained 2px keyboard-focus ring across desktop and wrapped mobile layouts.
- **Keyboard-aware view navigation** — keyboard and synthesized activation of any Landing entry action or the empty Saved **Go create** action moves focus into Create's brief field; keyboard About navigation moves focus to the Landing heading, where the next Tab reaches the hero action. Pointer entry and ordinary reload do not force a form or heading focus. The narrow heading box and its visible focus ring remain contained at 390 and 320 pixels.
- **Focus-aware view history** — native Back/Forward restores page state, title, and a visible programmatic destination together: application pages focus their main landmark and Landing focuses its heading. Explicit pointer navigation and ordinary reload retain their existing neutral focus behavior; recovery hashes remain untouched.
- **Keyboard-aware Landing jump** — **How it works** scrolls every visitor to the same named steps region. Keyboard activation also moves a visible focus indicator to that destination so the next Tab continues from the new location; pointer activation keeps native focus on the initiating action.
- **Visible Landing action focus** — Open app, both Find your name actions, How it works, and the four live demo modes share one contained 2px keyboard-focus ring. A small scroll margin keeps the full ring visible as keyboard focus traverses the long page at 390 and 320 pixels.
- **Visible empty-state recovery focus** — Create examples, empty Saved's Go create action, and exhaustion recovery share one contained 2px keyboard-focus ring and scroll clearance while preserving their existing keyboard-only destination handoffs.
- **Announced live Landing modes** — the four visual mode examples remain ordinary native buttons in one named selection group. Exactly one exposes `aria-pressed=true`, and keyboard or pointer selection moves that announced state without replacing the focused button or pretending the demo is a tablist/menu.
- **Truthful AI Studio recovery** — a failed optional AI ranking never hides the 24 names already generated locally. A first failure shows their untouched engine order without AI reasons or a false pick; a later metric failure keeps the last successful order and label. While a provider is still pending, **Cancel ranking** aborts either local model discovery or the chat request, preserves the same truthful fallback, unlocks Studio, restores the invoking metric focus, and exposes the existing same-pool Retry path. That Retry also retains the failed pool's frozen project brief; editing the draft cannot silently change the context of displayed candidates. Saving a request-shaping provider, key, endpoint, model, or enabled-state change during that request retires it through the same fallback without stealing Settings focus; Retry alone may use the new saved configuration. The visible alert remains the sole live failure/cancellation channel. Fresh, retried, and cached successful rankings instead update one atomic polite status with the exact 24-name total and verified metric label. Both cache layers reuse a result only when provider, effective OpenRouter credential scope, normalized request base, effective model, full criterion plus pool-owned-brief prompt content, and ordered candidate list match; equal-length custom prompts, different briefs, distinct localhost endpoints, reordered candidates, a key or model changed in Settings, and a different model auto-loaded at one localhost endpoint cannot inherit an earlier ranking. Replacing an OpenRouter key clears the per-pool cache and advances the bounded shared cache scope, so the same local pool and metric must make one request with the new credential before exact-repeat reuse. Local request bases trim surrounding whitespace and all trailing slashes before model discovery, ranking, and cache identity are derived. Local auto-detect rechecks `/models` before shared-cache reuse, while an unchanged resolved id still avoids another chat completion. A same-pool Retry preserves its failed criterion and brief while using the current saved provider/model configuration. Disabling AI hides that ranked view and synchronously empties its stale success channel; re-enabling restores the local verified view without replaying the old live message or making another ranking request. Retry can also open Settings, while focus stays on the invoking control and one pending operation cannot start a competing request. No pool, error, success, cancellation, or retry state is persisted.
- **Validated AI judge replies** — a provider response becomes a ranking only when its array contains exactly one row per candidate and every resolved index has one finite 1–10 score plus one well-formed, non-empty reason without ASCII controls and within the requested eight-word and 160-unit limits. A missing, duplicate, extra, or invalid row rejects the whole response into AI Studio's existing local-pool/last-good fallback instead of displaying a partial ranking, overwritten result, invisible control text, invented explanation, extreme score, or unbounded provider text. Exact eight-word and 160-unit reasons remain valid without truncation.
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
- **Provenance-safe Saved collection** — explicit stars and names received from share links appear together once per spelling, while cards explain whether the source was a project like, a historical unscoped like, a share, or a combination. Share-only names are not taste evidence. A valid share opened as the initial URL or as a hash-only navigation in an already-mounted tab uses the same idempotent importer and opens Saved; a successful runtime import consumes only that hash history entry, so Back returns to the page that was open before it. The share hash is consumed only after both the imported shortlist and first-visit marker persist. If either write fails, it remains as the reload recovery copy; a later idempotent success clears it. Removing a name backed by multiple sources requires confirmation; passes are preserved. Canonically equivalent Unicode spellings share one Saved identity while the first record's exact display spelling is retained. TXT, JSON, and forwarded share links expose only that deduplicated spelling/style shortlist; a valid imported Unicode spelling is preserved when forwarded instead of failing at the browser's byte-only Base64 boundary, while rows containing unpaired UTF-16 surrogates are discarded at the share boundary. Saved renders every accepted shared spelling in full, wrapping even the 80-character input limit inside a 320-pixel card instead of hiding the exact tail behind an ellipsis. Its monogram takes two Unicode code points rather than two UTF-16 units, so an astral character such as `🚀` cannot be split into a broken glyph. A failed TXT/JSON browser click reports the exact operation without a false success, releases its temporary object URL, and can be retried from the same focused action. The collection persists in `localStorage`.
- **Focus-safe Saved removal** — after any durable removal, one atomic polite channel names the removed spelling and exact remaining Saved count. Keyboard focus moves during the committed DOM update to the next card's Remove action (or the previous card when the removed card was last); removing the final card keeps the announcement mounted and focuses the empty-state **Go create** action. Pointer removal announces the same success without forcing focus. A rejected browser-storage write uses a local inline alert rather than a second blocking browser dialog, keeps the success channel empty, and preserves the card, durable row, and invoking Remove focus for an ordinary retry. Multi-source removal still requires its deliberate destructive confirmation.
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

- **Brand-name blending & appeal** — Hiranandani, Maneriker and Jhamtani, *Generating Appealing Brand Names*, [arXiv:1706.09335](https://arxiv.org/abs/1706.09335). Basis for syllable blending, vowel-dropping, and scoring candidates for readability/pronounceability; not evidence that our hand-tuned scores predict brand preference.
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
