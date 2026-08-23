# Human wordlikeness product-manifold: negative checkpoint

Date: 2026-08-23

## Decision

The local product-name manifold route stops on validation. It is not eligible
for sealed-test inspection, generator application, production shadowing, or
human preference work. The representation predicts independent human
wordlikeness well, but it fails the experiment's central requirement: it is
materially weaker than the fixed global character-model baseline.

No threshold, neighbor count, feature definition, family split, or baseline was
changed after the result. Sealed-test ratings were not aggregated and no
`test-report.json` exists.

## Frozen evidence

- Protocol SHA-256:
  `7efeae5132310cbe321b25f9a249351edc25c1354b7e765425db8adae9d358dd`
- Executed runner SHA-256:
  `4bc7cfc61f57bfe75e3cc3aaa4f076cd64f60e887dfa16109f150a5cbc74a950`
- Product dataset SHA-256:
  `dd4b7b977ea62aea570f7ec5b9941ca06174fd7cbb882a39ffbd2183f488d9d6`
- PseudoLex CSV SHA-256:
  `70f4e7a92fc300ba609013a172db18fe04e44855b2162313ce2b8c57b7000289`
- Eligible items/families: `8,394 / 7,026`.
- Development/validation/sealed-test items: `5,036 / 1,678 / 1,680`.
- Product manifold names: `10,138` train-only product labels.
- Selected validation-only neighbor count: `k=20`.
- Both clean runs produced seven byte-identical artifacts. The validation
  report SHA-256 was
  `d8afec4af2e0e967f40de9d7bbd2295c862a259776f7fbbdab512fd383298526`.

## Validation result

| Metric | Required | Product kNN | Global Markov | Result |
|---|---:|---:|---:|---|
| Raw Spearman | >=0.25 | 0.5172 | 0.5975 | PASS for kNN |
| Length-controlled Spearman | >=0.20 | 0.5164 | 0.6120 | PASS for kNN |
| Controlled uplift over Markov | >=0.05 | -0.0956 | baseline | **FAIL** |

All five frozen neighbor counts had positive controlled correlation, rising
from `0.3483` at `k=1` to `0.5164` at `k=20`. That is genuine evidence that
real product-name neighborhoods encode human-perceived wordlikeness. It is not
evidence for an additional generator signal: the simpler train-product trigram
model explains substantially more of the same held-out judgment.

## Consequence

The useful architectural finding is narrower than the proposed manifold: the
existing generator can treat a globally trained product-name character model
as a validated form prior, but this experiment does not authorize that change.
A separate prospective application must freeze how the prior participates in
search and prove page quality, diversity, collisions, brief relevance, and
human preference without tuning on PseudoLex.

Production remains untouched. Nothing in this directory is imported by Rust,
WASM, web Auto, public results, taste export, or storage.
