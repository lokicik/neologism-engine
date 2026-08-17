# Contrastive brief/name scorer: negative checkpoint

Date: 2026-08-17

## Decision

The scorer-only preflight is **not eligible to unlock a holistic denoising
generator**. On the sealed grouped test partition, its retrieval performance is
near random and weaker than a fixed character-trigram lexical baseline.

This result rejects the proposed two-stage path for the current Wikidata
description/name pairs. It does not claim that contrastive learning is
universally incapable of ranking names; it shows that this frozen corpus does
not provide enough generalizable brief-to-spelling supervision.

## Frozen protocol

- Input dataset SHA-256:
  `dd4b7b977ea62aea570f7ec5b9941ca06174fd7cbb882a39ffbd2183f488d9d6`.
- Existing owner/developer/parent plus normalized-name-family split:
  10,138 train / 1,260 validation / 1,193 sealed test.
- Brief encoder: mean of train-only 512-word embeddings, 48 dimensions.
- Name encoder: stable-hashed character 2/3/4-grams, 4,096 buckets,
  48 dimensions.
- Symmetric batch contrastive loss, cosine temperature 0.10, seed 29.
- Validation loss alone selects the checkpoint. Test data is read only after
  epoch selection.
- Evaluation uses each correct pair against nine deterministic wrong pairs in
  both brief-to-name and name-to-brief directions. Exact score ties receive
  fractional credit, so an all-tie baseline cannot masquerade as failure.

## Observed gates

| Gate | Required | Observed | Result |
|---|---:|---:|---|
| Bidirectional 10-way top-1 | >=35% | 12.0275% | **FAIL** |
| Bidirectional pairwise wins | >=70% | 52.9175% | **FAIL** |
| Correct-minus-wrong cosine margin | >=0.05 | 0.004769 | **FAIL** |
| Pairwise uplift over lexical baseline | >=5 points | -2.1631 points | **FAIL** |

The fixed lexical baseline reached 18.0152% top-1 and 55.0806% pairwise.
The learned scorer's best validation checkpoint was epoch 2. Two clean runs
produced the same float-state hash:
`6c16abaeaa27d28bac8d4be672526d10932cf5f14a563baeb1935c900ad6e3af`.

## Consequence

No masked-denoising generator was implemented. The predeclared preflight was
designed specifically to prevent spending a larger model and integration
budget after the semantic selector failed. Production remains unchanged.
