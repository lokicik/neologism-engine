# Current interface checks

Run from `web/` after building WASM and installing dependencies. Each script launches and closes its own local Vite server and isolated Chromium session; it does not edit your saved names in the normal preview.

| Script | Contract |
|---|---|
| `discovery-contract.mjs` | One initial Auto page, append, dirty draft, navigation and same-tab reload/scroll |
| `discovery-resilience.mjs` | 100 real names, bounded scroll, double click, delayed response, errors/Retry, constraints, exhaustion, corrupt/unwritable storage |
| `saved-contract.mjs` | Details/focus, search, 2–4 comparison, no implicit taste, source-specific Undo and saved-family reload |
| `navigation-contract.mjs` | Query routes, Back, isolated Lab/Studio, Product names Lab, shared links, check observations and failed Undo retry |
| `ui-surfaces.mjs` | 320/390/768/1251/1440px captures, target sizes, keyboard, reduced motion, rendered contrast, 500-card fixture |
| `shortlist-contract.mjs` | Full list on Create; unchanged legacy finalist count/explanation/context contracts tested independently |

`ui-surfaces.mjs` writes captures and measurements to `docs/uiux-2026-09-07` by default. Set `UI_EVIDENCE_DIR` to a different screenshot directory for later runs so this delivery's evidence can remain frozen. The 500-card case is a rendering fixture, not 500 generated quality examples. Timing limits are generous local regression guards, not cross-device guarantees.

Production engine controls remain `auto-quality-audit`, `heldout-cold-quality-audit`, `cold-quality-audit`, `taste-quality-audit`, and `mode-taste-audit`. Their original numeric thresholds were retained.

Other numbered-phase UI probes remain available for historical replay at commit `585e623`. Their earlier sidebar, inline Why, method-chip, finalist/reveal, or landing-first assumptions have been replaced by the current contracts above. No claim is made that every historical probe runs against the redesigned surface. Pure storage/domain/taste/judge checks and isolated research harnesses are unaffected by this UI contract migration.
