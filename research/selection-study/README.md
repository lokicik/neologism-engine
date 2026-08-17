# Blind brief-aware ranking study

This directory owns the preregistered human gate for Phase 270. It does not
generate names, call a model, or change production. It consumes rankings that
were already produced from the same local 24-name pool by one frozen model:

- control: generic metric-only prompt;
- candidate: the same metric plus the pool-owned project brief.

The protocol freezes 30 semantically distinct primary briefs and 12 concealed
left/right reversals. Every primary contributes one forced full-page choice.
Reversals are quality control only and never increase the efficacy denominator.
The canonicalized protocol object hashes to
`5f4dc48f8e4f0c4dc9ef794275bc44e1aee63a8e076c6cd3c36940e24fd9250d`.

## Frozen gates

- all 30 primary decisions must be present;
- at least 21/30 primary choices must prefer the brief-aware page;
- all 12 reversal decisions must be present;
- at least 10/12 reversals must select the same arm as their primary;
- one evaluator proves only that evaluator's preference.

The study must not be described as independent observations per name. The brief
is the inferential unit. A page contains the top ten names from one 24-name pool.

## Source format

`prepare-study.mjs` accepts a JSON document with this shape:

```json
{
  "schema": "neologism-ranking-source-v1",
  "protocolSha256": "...",
  "model": { "provider": "localhost", "id": "frozen-model-id" },
  "generatorCommit": "...",
  "selectorCommit": "...",
  "cases": [
    {
      "briefId": "p01",
      "brief": "...",
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
each prompt hash matches its stored prompt, the generic prompt omits the brief,
and the contextual prompt contains the frozen criterion, quoted brief, and
numbered pool. It writes:

- `blind-study.json`: shuffled unlabeled page pairs for the evaluator;
- `answer-key.json`: arm ownership, source hash, and reversal links.

Candidate placement is balanced: 15/15 across primary pages and 6/6 across
reversals. The key has its own content hash; answers bind to both the blind
study and key hashes. Give the evaluator only `blind-study.json`, never the
source or answer key.

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
