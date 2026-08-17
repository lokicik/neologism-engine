# Blind brief-aware ranking study

This directory owns the preregistered human gate for Phase 270. Its isolated
collector can generate a frozen local pool and call one explicitly configured
ranking model; none of this code is imported by production. Each case compares:

- control: generic metric-only prompt;
- candidate: the same metric plus the pool-owned project brief.

The protocol freezes 30 semantically distinct primary briefs and 12 concealed
left/right reversals. Every primary contributes one forced full-page choice.
Reversals are quality control only and never increase the efficacy denominator.
The shared 24-name pool is deliberately prompt-independent. The brief is hidden
from pool generation and the generic control, then supplied only to the
candidate ranker. This isolates the causal ranking change instead of giving both
arms a pool that was already conditioned on the answer. Every brief also owns a
frozen generator seed. The canonicalized protocol object hashes to
`3b89d5efc4f0899143a12637f991a9e252003e141d39d51f25df3a3ea6b0ad6a`.

## Frozen gates

- all 30 primary decisions must be present;
- at least 21/30 primary choices must prefer the brief-aware page;
- all 12 reversal decisions must be present;
- at least 10/12 reversals must select the same arm as their primary;
- one evaluator proves only that evaluator's preference.

The study must not be described as independent observations per name. The brief
is the inferential unit. A page contains the top ten names from one 24-name pool.

## Source format

`study-tools.mjs prepare` accepts a JSON document with this shape:

```json
{
  "schema": "neologism-ranking-source-v1",
  "protocolSha256": "...",
  "poolPolicy": {
    "style": "big_tech",
    "variant": "auto",
    "count": 24,
    "minLength": 4,
    "maxLength": 12,
    "temperature": 0.85,
    "variety": 0.4,
    "roots": [],
    "description": null,
    "deterministicDoubleRun": true
  },
  "model": { "provider": "localhost", "id": "frozen-model-id" },
  "generatorCommit": "...",
  "selectorCommit": "...",
  "cases": [
    {
      "briefId": "p01",
      "brief": "...",
      "seed": 271001,
      "criterion": "sounds like a memorable and distinctive product brand",
      "pool": ["24 unique names"],
      "generic": {
        "prompt": "the exact provider prompt with the numbered pool",
        "promptSha256": "...",
        "orderedNames": ["the same 24 names in ranked order"]
      },
      "contextual": {
        "prompt": "the exact provider prompt with the quoted brief and numbered pool",
        "promptSha256": "...",
        "orderedNames": ["the same 24 names in ranked order"]
      }
    }
  ]
}
```

The builder fails closed unless both rankings are exact permutations of the
same pool, all hashes are lowercase SHA-256, all 30 frozen briefs appear once,
each case uses its frozen seed and prompt-independent pool policy,
each prompt hash matches its stored prompt, the generic prompt omits the brief,
and the contextual prompt contains the frozen criterion, quoted brief, and
numbered pool. It writes:

- `blind-study.json`: shuffled unlabeled page pairs for the evaluator;
- `answer-key.json`: arm ownership, source hash, and reversal links.

Candidate placement is balanced: 15/15 across primary pages and 6/6 across
reversals. The key has its own content hash; answers bind to both the blind
study and key hashes. Give the evaluator only `blind-study.json`, never the
source or answer key.

## Collect a real source

The collector is a separate Vite entry point, not a product route. Build and
open it from the repository root:

```powershell
node web/node_modules/typescript/bin/tsc `
  -p research/selection-study/collector/tsconfig.json `
  --noEmit --incremental false
node web/node_modules/vite/bin/vite.js build `
  --config web/selection-study.vite.config.ts
node web/node_modules/vite/bin/vite.js preview `
  --config web/selection-study.vite.config.ts `
  --host 127.0.0.1 --port 4202 --strictPort
```

Open `http://127.0.0.1:4202/`. Enter one exact provider/model identity and the
generator/selector commits. **Prepare locally** runs the frozen generator twice
and enables no provider request unless both ordered pools match. **Run two
rankings** then sends the displayed criterion, brief, and 24 names to the chosen
provider. Cases run sequentially; there is no automatic 60-request burst. If
the two top-ten pages are identical, the frozen source fails: do not omit that
brief or shop for a different model after seeing the result.

The API key remains in page memory, never enters local/session storage, and is
not exported. Reload loses unfinished work. Provider pricing, privacy, and
retention terms still apply. A hosted model ID records the requested model but
cannot prove immutable hosted weights; use a local artifact SHA-256 when that
stronger provenance is available.

After all 30 cases, download `ranking-source.json`, then validate and prepare it:

```powershell
node research/selection-study/study-tools.mjs prepare `
  --source path/to/ranking-source.json `
  --out path/to/new-empty-output-directory
```

The local seed audit is available at `http://127.0.0.1:4202/seed-audit.html`.
The mocked browser contract is dependency-local and sends no real provider call:

```powershell
node research/selection-study/collector-check.mjs
```

The answer file contains exactly one `left` or `right` choice for every blind
case and binds to the hashes written in the blind package and key:

```json
{
  "schema": "neologism-blind-page-answers-v1",
  "studySha256": "...",
  "keySha256": "...",
  "answers": [
    { "caseId": "c01", "choice": "left" }
  ]
}
```

Score it with:

```powershell
node research/selection-study/study-tools.mjs score `
  --study path/to/blind-study.json `
  --key path/to/answer-key.json `
  --answers path/to/answers.json
```

Run the dependency-free protocol and adversarial fixture checks with:

```powershell
node research/selection-study/study-tools.mjs self-test
```

Until a real frozen source and all 42 human decisions exist, Phase 270 has no
human preference result and cannot authorize a Create/Auto integration.
