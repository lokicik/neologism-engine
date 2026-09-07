# Auto-first interface delivery

The application now opens into one continuous Auto discovery: explore names, save candidates, and compare two to four. Generator methods and experiments are under Tools → Lab. This delivery changes the interface and its state management; it does not establish an improvement in name quality.

## Delivered behavior

- Create starts with up to ten real Auto results and an optional brief. Unchanged inputs continue the list; changed inputs replace it only after successful generation. Options holds the existing constraints.
- Downward scrolling can request one more page near the end. Load more remains available, and dirty drafts, dialogs, errors, exhaustion, or leaving Create stop automatic continuation. Late responses cannot update results or history.
- A versioned same-tab session preserves results, draft, generation context, salt, and scroll position. Unusable storage produces a visible warning while discovery remains usable.
- Cards show a large name, recorded construction evidence when present, Save, Copy, and Details. The modal drawer preserves list width and returns keyboard focus. Structural estimates and name checks remain in Details.
- Saved preserves collection order while searching case-insensitively. Comparison requires two to four names, shows existing evidence, and does not declare a winner. Export is secondary. Undo restores only the removed sources and respects choices made afterward.
- Create, Lab, and AI Studio use separate generation state. Existing shared links open Saved. Stored preferences keep their existing format; scrolling and comparison do not record taste.

Testing also exposed and fixed a saved-source validator that rejected some existing generator families on reload, comma entry being lost from controlled exclusion inputs, and explicit prefix/contains constraints missed by a few legacy accent generators. The last fix filters the UI batch against the user's explicit request; it does not change generator weights or quality thresholds.

## Commit delivery and preservation

All commits are local on `master`, authored with the existing user identity and without co-author trailers. Nothing was pushed.

The first **20 commits** preserve the accumulated naming and research work. The sequence, including each experiment in its own commit, is recorded in [commits.tsv](commits.tsv). Interdependent module/data changes and compile-time fixtures were kept together. Shared files were staged by selected hunks or explicit content; no blanket staging was used.

The interface is delivered in these **five commits**:

| Commit | Scope |
|---|---|
| `0a3a784` | Navigation and Lab separation |
| `0b72373` | Continuous discovery and same-tab sessions |
| `441c437` | Simplified cards and modal Details |
| `c561789` | Saved search, comparison, and Undo |
| This report's delivery commit | Accessibility, edge-case fixes, current checks, design documentation, and visual evidence |

The last commit is identified by the Git revision containing this report, so the ledger does not need a self-referential hash. Run `git log --reverse --oneline 339ff490d6ac539b25b174dfa0d20acf8a3a1617..HEAD` for all 25 commits.

Before editing, the original working tree was copied and hashed: **1,262 files**. At the preservation boundary `585e623`, every original working-tree file still had its starting bytes. Comparing Git blobs with that capture yields **1,250 byte-identical files, 12 line-ending-only normalizations, and zero other content mismatches**. UI work has no changes under `core/`, `wasm/`, or `research/`. See [baseline-manifest.json](baseline-manifest.json) and [preservation.json](preservation.json).

Each code commit's staged tree was materialized into a temporary checkout and compiled before committing. Rust boundaries used workspace tests; frontend boundaries used TypeScript and Vite builds. The logs are retained in [checks](checks/); [staged-ui-commits.jsonl](staged-ui-commits.jsonl) records the first four UI trees, with the fifth tree's verification in `ui-5-*` logs. Research-only commits retain their existing protocols, traces, and reports.

## Verification

| Check | Result |
|---|---|
| Rust workspace | 232 tests passed |
| WASM | Regenerated successfully from the retained Rust code |
| TypeScript and production build | Passed, including the final staged UI tree |
| Auto, held-out, cold, taste, mode-taste audits | Passed; all five output logs are byte-identical to the baseline |
| Discovery contract | 13 checks passed |
| Discovery resilience | 17 checks passed |
| Saved contract | 18 checks passed |
| Navigation contract | 17 checks passed |
| Shortlist contract | 14 checks passed; original algorithm gates retained separately from Create |
| Responsive surfaces | 26 checks passed |

That is **105 current UI checks**, including 100 real generated names without duplicates, one-page scroll bounds, rapid double click, stale completion, error/Retry, empty pools, constraints, reload/position, routing, share imports, 2–4 comparison, source-specific Undo, and recovery from storage failure. The five unchanged engine logs are summarized in [engine-audit-comparison.json](engine-audit-comparison.json).

The earlier numbered-phase UI probes assumed the old sidebar, finalist/reveal list, and inline details. Their historical instructions are retained in [previous-validation-guide.md](previous-validation-guide.md); the active replacement contracts are documented in [web/e2e/README.md](../../web/e2e/README.md). This is not a claim that every historical probe was run against the redesigned interface.

The first baseline WASM attempt could not complete inside the sandbox; its log is explicitly named `baseline-wasm-sandbox-attempt.log`. A permitted rebuild subsequently succeeded, and `final-wasm.log` records the successful final rebuild. Vite still emits its existing large-chunk advisory; the build succeeds.

## Browser and visual evidence

Actual browser captures were inspected at **320, 390, 768, 1251, and 1440px**. Columns are 1/1/2/3/3 with no page overflow. Primary controls meet 44px target dimensions. Keyboard checks cover skip navigation, modal containment, Escape, and focus return. Reduced motion is honored, and an 80-character rendering fixture wraps without clipping.

Rendered text/control contrast was **16.44:1** for names and inputs, **7.20:1** for supporting text and Details estimates, and **5.06:1** for the primary button. The Details estimate line inherited a 10.56px size and 0.7 opacity; it now uses 14px and full opacity, with an explicit browser regression check. These are sampled implemented states, not a blanket accessibility certification.

On this development host, restoring a **500-card rendering fixture** took approximately **258ms**, and editing its brief took **59ms**. This is isolated Chromium without CPU throttling; it is not evidence about mobile hardware or 500 generated names. Full values and context are in [measurements.json](measurements.json).

| Surface | Before | After |
|---|---|---|
| Desktop Create | [1440px before](screenshots/before-desktop.png) | [1440px after](screenshots/create-1440.png) |
| Mobile Create | [390px before](screenshots/before-mobile.png) | [390px after](screenshots/create-390.png) |
| Details | — | [Desktop](screenshots/details-1440.png) · [Mobile](screenshots/details-390.png) |
| Saved | — | [Desktop](screenshots/saved-1440.png) · [Mobile](screenshots/saved-390.png) |
| Comparison | — | [Desktop](screenshots/compare-1440.png) · [Mobile](screenshots/compare-390.png) |

Use the [visual comparison page](review.html) to inspect the before/after images together. Generated names differ between independent capture sessions; these are interface comparisons, not name-quality comparisons.

Impeccable's [initial independent review](initial-finish-review.md) and [bounded final verdict](finish-review.md) are retained separately. Its initial material finding, inconsistent Details glyph icons, was corrected using the existing SVG style. Documentation then exposed the inherited faint estimate line; a targeted browser measurement confirmed that issue and a second bounded correction made it readable. The same Details screenshots were recaptured for each correction. The detector's two font warnings were retained with the user's explicit Inter/Space Grotesk requirement as their disposition. The implemented design system is documented in [DESIGN.md](../../DESIGN.md) and its `.impeccable/design.json` sidecar.

## Replay and limits

From the repository root, run `cargo test --workspace --offline` and `wasm-pack build wasm --target web --out-dir ../web/src/wasm`. From `web/`, run `node node_modules/typescript/bin/tsc -b`, `node node_modules/vite/bin/vite.js build`, and the six current scripts listed in `e2e/README.md`. Set `UI_EVIDENCE_DIR` before rerunning the screenshot script to preserve this delivery's captures. The five engine audit scripts and their thresholds are unchanged.

Verification used local Chromium and emulated viewport sizes, not physical phones, Safari, or a screen-reader session. Mobile comparison intentionally scrolls inside its named table region to keep candidates side by side. Domain observations retain source and check time when available; local snapshot absence is never current availability. AI-provider output was not part of the offline UI verification. No naming-quality or human-preference gain is claimed.

The optional in-app opening of `review.html` was blocked by the browser's local-file URL policy. The gallery is saved and its file links resolve, but it was not browser-inspected as a page. Its component screenshots were individually inspected and reviewed. The rebuilt application itself was loaded successfully over the existing HTTP preview on port 4247 and left on Create.
