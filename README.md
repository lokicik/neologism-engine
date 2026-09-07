# Neologism Engine

A browser-based name exploration tool built with Rust, WebAssembly, React, and TypeScript. Generate names locally, save candidates, compare a shortlist, and inspect domain evidence.

**Project status · 2026-09-08:** the existing application is retained as a small name exploration tool. Further naming-quality research is paused. Structural scores and completed engineering checks do not establish that people will want to use the generated names. See the [research guide](research/README.md) for the retained results and their limits.

## Using the app

- The root page is the landing page. **Open app** enters Create at `?view=create`.
- Create starts with Auto names. A brief is optional; **More names** continues the current discovery.
- **Saved** keeps candidates and compares two to four names.
- **Tools** contains Lab, AI Studio, Settings, and About. Lab methods remain experimental; AI Studio is optional.

Generation and taste processing run locally without an API key. Domain lookups, manual search links, and optional AI ranking contact third parties only when requested. Domain evidence is preliminary: registry records and DNS answers have different meanings, and neither establishes trademark clearance.

## Run locally

Prerequisites: stable Rust, the `wasm32-unknown-unknown` target, `wasm-pack` (the deployment recipe pins `0.13.1`), and Node.js with npm.

From the repository root:

```sh
rustup target add wasm32-unknown-unknown
wasm-pack build wasm --target web --out-dir ../web/src/wasm
cd web
npm ci
npm run dev
```

Open [localhost:5173](http://localhost:5173/). On Windows, Rust tools must be on `PATH`, normally through `%USERPROFILE%\.cargo\bin`.

`web/src/wasm/` is generated and ignored by Git. Rebuild it after changing `core/` or `wasm/`; from `web/`, use `npm run build:wasm`.

## Build and checks

From the repository root:

```sh
cargo test --workspace
```

From `web/`, after building WASM and installing dependencies:

```sh
npm run build
```

The production bundle is written to `web/dist/`. [Current interface checks](web/e2e/README.md) document the browser contracts and engine audits. Use a separate `UI_EVIDENCE_DIR` when rerunning screenshot checks to preserve the retained delivery captures.

[netlify.toml](netlify.toml) contains the deployment build recipe; its presence is not evidence of a live deployment.

## Repository map

| Location | Purpose |
| --- | --- |
| [core/](core/) | Pure Rust generation library, bundled data, tests, and examples |
| [wasm/](wasm/) | `wasm-bindgen` wrapper around the core |
| [web/](web/) | React application and browser checks |
| [docs/](docs/README.md) | Documentation index, interface delivery records, and historical archive |
| [research/](research/README.md) | Indexed experiments, protocols, results, and data preparation tools |

## Further reading

- [Product behavior and constraints](PRODUCT.md)
- [Design reference](DESIGN.md)
- [Data sources, attribution, and redistribution boundaries](DATA-LICENSES.md)
- [Documentation and historical notes](docs/README.md)

Historical plans describe decisions at their recorded dates. They are preserved for reference and do not reopen research or change the current project status.
