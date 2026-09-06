# Quality cause diagnostics

Read [REPORT.md](REPORT.md) for the findings and their limits. Research only: no new UI mode or production behavior.

The six briefs were already observed in the operation-object experiment. They diagnose failure mechanisms; they are not a fresh preference benchmark. Native Brandable/Reason controls and selection over frozen WASM pools are separate experiments, not a claim of native/WASM end-to-end parity.

From the repository root:

```powershell
# Preparation was run once. It refuses to overwrite the frozen inputs.
# node research/quality-cause/prepare.mjs
& "$env:USERPROFILE\.cargo\bin\cargo.exe" run --release -p neologism-core --example quality_cause_probe -- research/quality-cause/artifacts/configs.json research/quality-cause/artifacts/interventions-v2.json
& "$env:USERPROFILE\.cargo\bin\cargo.exe" run --release -p neologism-core --example quality_cause_probe -- research/quality-cause/artifacts/configs.json research/quality-cause/artifacts/interventions-repeat.json
node research/quality-cause/analyze.mjs
node research/quality-cause/verify.mjs
```

Analysis uses the existing local Playwright/Vite harness on port 4246 and requires permission to spawn those processes. Do not run other shared-pool harnesses on that port simultaneously. No external data fetching or model is used.

`analyze.mjs` checks that all 162 original native interventions remain identical, replays the six original finalist selections, changes selection seeds over fixed proposals, and tries a structured direct-operation-first Reason ordering. `verify.mjs` checks the repeated 234 native runs byte-for-byte and unchanged runtime/data identities. It deliberately fails if the recorded source state drifts.

The direct-operation control only reprioritizes the existing Reason chain's first link. It is not a complete semantic scorer and does not establish aesthetic quality. The disabled syllable gate admits truly long names too. The three disabled shape bonuses are not the entire ranking formula. Original human evaluation records and promotion gates are untouched.
