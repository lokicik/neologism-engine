# Contrastive name-form energy: negative checkpoint

Date: 2026-08-23

## Decision

The linear real-name-versus-corruption energy model is not eligible for sealed
test evaluation, Rust parity, generator guidance, or production shadowing. It
learned most synthetic pair distinctions, but failed to add a meaningfully new
signal over a train-only order-3 character likelihood and did not reach the
frozen global AUC gate.

The test partition was never read for metrics. No binary model was exported.
The one-off trainer was removed after two clean validation reproductions.

## Frozen identity

- Protocol SHA-256:
  `7a56bb8b594c6443340d5e7faa8e80d3b6e9f855b5646da758a37f0b2fb9c3a1`
- Executed trainer SHA-256:
  `a5121230cb25fcc68460c8056751c1b387495488160138dbd65a79563d4e80ef`
- Dataset SHA-256:
  `dd4b7b977ea62aea570f7ec5b9941ca06174fd7cbb882a39ffbd2183f488d9d6`
- Two fresh validation reports were byte-identical at SHA-256
  `64b220a7ff8193044fd778420749a6c077cc13e3f423b958acebae667eef787a`.
- Selected L2: `0.0001`; dimensions: `4,112`; epochs: `18`; seed: `283`.

## Observed validation gates

| Gate | Required | Observed | Result |
|---|---:|---:|---|
| Pairwise original > corruption | >=75% | 84.854% | PASS |
| Real-vs-corruption AUC | >=0.75 | **0.6924** | **FAIL** |
| Pairwise uplift over Markov | >=3 points | **+0.450 points** | **FAIL** |
| Mean pair margin | >0 | 1.5869 | descriptive |

Per-family pairwise rates were `98.33%`, `77.46%`, `76.67%`, `86.51%`,
`93.81%`, and `76.35%`. Those strong-looking local numbers do not rescue the
failed global discrimination or negligible baseline uplift.

## Interpretation

Deterministic spelling corruptions are not an aesthetic label. The model mostly
rediscovers corpus likelihood and learns the corruption generator's artifacts.
It therefore cannot justify reranking production names or repairing the WFST's
high-scoring junk.

A distinct next route needs independently collected human judgments of
word/nonword appeal, pronounceability, or name preference. Public human-rated
data may supply that without any runtime or training-time LLM; if no suitable
license-clean dataset exists, the honest remaining path is explicit human
feedback rather than another synthetic proxy.
