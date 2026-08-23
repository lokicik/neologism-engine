# Prospective preference learner: source preflight pass

Date: 2026-08-23

## Decision

Phase 287 may proceed to building the immutable human-choice collector. The
source recruitment gate passed without lowering Phase 281's name quality,
pair-quality difference, pool size, or pairability requirements.

This pass creates no human evidence and authorizes no model fit, reranking, or
production change.

## Frozen identity

- Brief bank SHA-256:
  `a9df3b6e60e24c8c8049e36f4b0b0eb415d11012061008e8387b0e7660b7a712`
- Source protocol file SHA-256:
  `b1cb9656ee8b0ef1671e26e5163e1406ca92377916e8c933fa848071f2935e23`
- Learning protocol SHA-256:
  `18bcce3edb43f89a0a66d3d428169a4bbf56e87b65f20b8cbc85ce44bedb8135`
- Executed source builder SHA-256:
  `2c329e76e941a1f9101ef0bf1130ce2d43c1d3e6295f749b6c7d10ec63bcb68c`
- Vite configuration SHA-256:
  `8ef5514612f482234f3cfae67085b5e81a07512dda9707d16a44f19e553574ab`
- Combined browser protocol SHA-256:
  `15ddc7f7219b161306d655bf6ec54b6d9bb5b0a16876683fa483aee1327c17c8`
- Complete deterministic source SHA-256:
  `a763cbaa45ad49e592b88c78d09c96907f7492d9bafab3f3b869209cafb9e02a`
- Downloaded valid JSON file SHA-256 (one trailing LF):
  `debb789365ca2b2eff334662e5325c00a5a9ea32cda9b5f3d6e433b83676803e`
- WASM / bridge SHA-256:
  `10c602517dbe8af5b3bc6824199f73930990f406494ab46d183897490341ce2e` /
  `c2b07a79fcdafa1f64d28da213ef48a4d41e984e797ca0fad816d102e1758549`

Two full 60-brief browser runs under the final builder were byte-identical in
their displayed audit, protocol identity, source identity, retained order, and
counts.

## Source gates

| Gate | Required | Observed | Result |
|---|---:|---:|---|
| Frozen bank size | 60 | 60 | PASS |
| Passing briefs | >=30 | 57 | PASS |
| Retained briefs | 30 | 30 | PASS |
| Minimum retained pool | >=24 | 24 | PASS |
| Five disjoint pairs per retained brief | 150 total | 150 | PASS |
| Pair member quality | >=75 | enforced | PASS |
| Pair quality difference | <=2 | enforced | PASS |
| Deterministic double generation | every brief | every brief | PASS |
| Two complete source runs identical | yes | yes | PASS |

The retained 30 sources contain 1,254 unique same-brief candidates. The minimum
retained quality-eligible count is 14; no reserve beyond the ten names consumed
by the five required pairs was declared.

Three bank briefs failed and were recorded before hash selection:

- `r005`: two disjoint near-quality pairs, five required.
- `r019`: 23 total names, 24 required.
- `r024`: 21 total names, 24 required.

## Frozen retained order

Train: `r052 r003 r009 r031 r057 r018 r021 r027 r050 r011 r017 r054 r040
r059 r039 r053 r055 r032 r004 r036`.

Validation: `r023 r022 r045 r035 r007`.

Sealed test: `r016 r014 r006 r044 r034`.

The broader pre-frozen bank solves Phase 281's source-coverage problem by
changing the recruitment frame before human outcomes exist. It does not rescue
failed briefs or relax candidate quality.
