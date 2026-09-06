# Operation–object experiment

Open **Brief intent · Lab**, enable **Require operation–object links on next Generate**, then Generate. The option is off by default. A continuation retains the exact brief and option of its current run even if the checkbox or draft changes.

This experiment repairs the material stage and adds a conservative lexical evidence gate:

1. Existing common-word membership validates inflection candidates (`sizes → size`, `boxes → box`). That dictionary is not added to the naming inventory.
2. The primary object's head precedes an `of/in/on/with` complement when present. All original object terms and byte spans remain in the plan. The six-keyword budget starts with operation and head, followed by the other object terms. Context and conditions remain recorded but cannot fill this generation budget.
3. Two bounded material groups use the operation and object head, with at most eight roots each. Material consists only of brief literals, existing curated concept palettes, and existing bidirectional meaning fragments with an exact recorded association. No new names, model, aesthetic weights or semantic-neighbor equivalence is introduced.
4. Each returned spelling receives separate action/object match records. Full roots must occur at an edge, and the two roles need disjoint spans. One shared substring cannot prove both roles. This deliberately rejects partial, overlapping or unexplained coinages. It does not establish human semantic understanding or aesthetic quality.
5. The same nine families, per-family cap of 24, existing filters and round-robin finalist selection remain. A candidate without both links cannot enter the finalists. Unresolved parses return zero finalists under this option; the constraint is never silently relaxed.

`core/src/relation.rs` owns the material plan and evidence. Its synchronous scoped override is used by the additive WASM `generate_relation_candidate_diagnostics` export. The existing production Config API, Auto, original shared pool and original intent reader remain unchanged when this option is inactive. Scope restoration is tested for nested calls and unwinding. The scope cannot span asynchronous work.

The rule is intentionally conservative: a good metaphor can fail it, broad curated roots can still be weak names, and unsupported operations/coordinated objects remain unresolved. This is a capacity and specificity experiment, not a complete language parser. Conditions are retained but are not enforced as logical predicates.

## Evidence

`protocol.json` was fixed before comparison outputs. Four previously observed cases are development inputs; six separately written English developer briefs are evaluation inputs. All use 13, 67 and 313. Results do not estimate arbitrary-language or free-form coverage. After this run these briefs are no longer unseen.

`check.mjs` retains immutable source/data/WASM identities, complete compressed old/new/continuation traces, per-source rejection counts and finalists. It also replays all 48 original Auto pages, all 48 original shared pools, and all 33 previous intent pools. Exact comparisons omit duration only. Run `--replay` to compare again without replacing the retained evidence.

```powershell
cargo test -p neologism-core
wasm-pack build wasm --target web --out-dir ../web/src/wasm
node web/node_modules/typescript/bin/tsc -b web
node research/operation-object/check.mjs --replay
node research/operation-object/ui-check.mjs
```

Run browser scripts sequentially; they share the harness port. The UI check covers real WASM generation, toggling only on Generate, continuation snapshots, export, returning to the old intent path, unresolved/empty pools, inspection of rejected candidates, mobile overflow and saved-data isolation. Synthetic UI Keep choices are not human evidence.

Assistant choices and limitations are reported separately in `REPORT.md`. Original human promotion gates remain unchanged. There is no default switch or preference training.
