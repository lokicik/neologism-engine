# Brief-conditioned holistic GRU: negative checkpoint

Date: 2026-08-17

## Decision

The isolated model is **not eligible for generation, shadow hybrid evaluation,
or human preference testing**. It fits the requested size and determinism
boundary, but it does not use the brief strongly enough on the sealed test
partition. No model binary is checked in or connected to production.

## Frozen inputs

- Wikidata snapshot: 13,267 direct instances with an English, single-token
  `[A-Za-z]{4,12}` label and English description.
- Snapshot SHA-256:
  `5ee2d1a80e2ac9a2fe4c1877a9eef010101ae1efa8e1c66105e202ac0c2cbcea`.
- Derived dataset: 12,591 names; train/validation/test =
  10,138/1,260/1,193; 12,021 owner/developer/stem groups.
- Dataset SHA-256:
  `dd4b7b977ea62aea570f7ec5b9941ca06174fd7cbb882a39ffbd2183f488d9d6`.
- Condition vocabulary: 512 train-observed words. A deterministic minimum
  coverage reservation for the frozen 35 canonical product briefs is filled
  first, then the remaining entries are selected by train frequency. All
  35/35 canonical briefs have at least one known condition word.
- Architecture: character embedding 24, condition embedding 64, one-layer GRU
  with 96 hidden units; symmetric per-row int8 matrix export.

## Observed gates

| Gate | Required | Observed | Result |
|---|---:|---:|---|
| Eligible unique names | >=8,000 | 12,591 | PASS |
| Canonical brief condition coverage | 35/35 | 35/35 | PASS |
| Quantized artifact size | <=128 KiB | 90,543 bytes | PASS |
| Two clean CPU model hashes | identical | `a0282ed8...c6c12` twice | PASS |
| Python/Rust max logit difference | <=0.02 | 0.000002 | PASS |
| Python/Rust next-token top-1 | >=99% | 100/100 | PASS |
| Malformed artifact rejection | fail closed | 5/5 | PASS |
| Conditional test NLL improvement | >=5% | 0.2605% | **FAIL** |
| True vs nine wrong conditions | >=65% | 55.8443% | **FAIL** |

The best checkpoint was epoch 31: validation NLL 2.488876,
conditioned test NLL 2.506795, and empty-condition test NLL 2.513341. The
validation-only sampling matrix selected temperature 0.65 and top-k 8, but
sampling parameters cannot repair the failed conditioning evidence.

## Consequence

The 105-page generation audit, shadow replacement audit, and blind human gate
were deliberately **not run**. Their prerequisite failed. Running them anyway
would turn surface quality into a post-hoc excuse for a model that did not
establish its claimed brief-conditioning mechanism.

The current production path remains the byte-identical control: this research
directory is not imported by `generate()`, WASM, web Auto, public `NameResult`,
taste export, or storage.
