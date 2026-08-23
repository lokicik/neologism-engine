# Articulatory syllable WFST: negative checkpoint

Date: 2026-08-23

## Decision

The train-only articulatory WFST is not eligible for sealed held-out testing,
production shadowing, or human preference work. It passed eight of nine
development gates, but one page missed the frozen minimum-diversity floor. Its
visible outputs also confirm that the current mechanical score still rewards
strings that do not read like intentional names.

No production generator, WASM, web, taste, storage, or public type changed.
The one-off Rust probe was removed after the deterministic evidence was saved.

## Frozen identity

- Protocol SHA-256:
  `ccf1655c396a1878a0f1a576fac54f0e0152ae3b65412ef2205eebb82a4f7df`
- Corpus builder SHA-256:
  `458e1620762970774e1bc3f215f25f7a10c7d1ae6f1a324356e32d33872cdefd`
- Executed Rust probe SHA-256:
  `27a9bbe83d9ce8a65276ced4ade1de3a7c0c63fa0b92c4767117c60834fd8dca`
- Source dataset SHA-256:
  `dd4b7b977ea62aea570f7ec5b9941ca06174fd7cbb882a39ffbd2183f488d9d6`
- Train/validation names: `10,138 / 1,260`, with zero overlap.
- Train/validation corpus SHA-256:
  `fe974bf069a620061ed60727154861b2373a4626f8d185a81e7b5aa4392b9c70` /
  `fc464b1b7486e3e6ab58f69cebfcb8cba89705177c9ff8bf77b91b685e5e51a4`.
- Two clean corpus manifests were byte-identical at SHA-256
  `c902c236309115b7d3613aeb63f848e940894df9b8697e83ea2831b0508a3e7f`.
- Two fresh release reports were byte-identical at SHA-256
  `7a1164179f51c67f0edff099612e18802a1c1d9d21d96094bd0b70ebe6309c18`.

## Observed development gates

| Gate | Required | Observed | Result |
|---|---:|---:|---|
| Full pages / pools | 72 at 10 / 72 at 120 | 72 / 72 | PASS |
| Minimum / average quality | >=75 / >=84.0 | >=75 / 86.746 | PASS |
| Mean page ILAD | >=0.72 | 0.7364 | PASS |
| Minimum page ILAD | >=0.60 | **0.5915** | **FAIL** |
| Per-brief unique names | >=27/30 | 30 | PASS |
| Mean / maximum seed overlap | <=1 / <=3 | 0 / 0 | PASS |
| Own source trace vs nine wrong briefs | >=70% | 77.840% | PASS |
| Template tails / unchanged roots | <=20% / <=25% | 4/720 / 0/720 | PASS |
| Lexical hazards | 0 | 0 | PASS |

The failing recruiter seed-313 page was `Trirt`, `Crayeel`, `Piclerling`,
`Tridemc`, `Parseogloir`, `Kacplez`, `Mairliodtis`, `Pirtirst`,
`Creepcunirt`, and `Frocer`. Its pool was full after only 524 attempts, so the
failure is not capacity starvation. The examples show that a corpus-plausible
syllable path plus high legacy composite is still not an aesthetic boundary.

## Consequence

Do not tune the MMR weight or lower the 0.60 floor. A subsequent non-LLM route
should first learn a small discriminative energy signal from real product-name
forms against deterministic hard corruptions, using group-disjoint partitions.
Only a scorer that generalizes on a sealed real-vs-corruption test should be
allowed to guide another generator or production shadow selector.
