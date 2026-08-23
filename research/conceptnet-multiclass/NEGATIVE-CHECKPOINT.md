# ConceptNet multiclass selector: Phase 302 negative checkpoint

Date: 2026-08-23

## Decision

Phase 302 stops on development. Requiring the generating keyword model to be
strict top-1 among all 111 keyword models produces strong measured semantic
discrimination, but leaves too few eligible candidates to fill the frozen
pages. No sealed source, production shadow, or human preference stage opened.

No eligibility rule, likelihood model, relevance blend, MMR setting, lane cap,
or threshold changed after the first result. In particular, the top-1 rule was
not weakened to top-k. Two clean executions reproduced report and manifest
byte-for-byte.

## Frozen identity and reproduction

- Protocol commit: `2f4fb28`.
- Implementation commit: `455318a`.
- Protocol SHA-256:
  `014a5b30273d9d35cc7ca7bea35335becb863683683252817942bdd8142eff17`.
- Evaluator SHA-256:
  `4a916a12fdef06078da8b28ebcbf80c2741951b5c11658cd9b5a986b0126ed61`.
- Frozen Phase 300 source report SHA-256:
  `8140a0b00f83e3cc3607fa7b4fe097ad61d790a46fe6c9d3ab14a05e97e4bde0`.
- Frozen Phase 298 anchor SHA-256:
  `ff207ad1570356b1a820726dc6c6dc980826425bd40e440ce4dac0d0f4788e55`.
- Reproduced Phase 302 report SHA-256:
  `d4f147127eb632c1a3f1a5fdd20fb2c0211b798a68d70c1a5271ac0c5ecad6fd`.
- Reproduced manifest SHA-256:
  `35e41bfc8ea58728a0c75f1844eb6f3345d510f6628130b54a65f79d13a52fce`.

## Development result

- Strict multiclass pool mean/minimum: `6.6528 / 2` from each fixed
  160-candidate source pool.
- Full pages/cards: only `6/72` pages at 10; `442` selected cards total.
- Own-vs-nine-wrong rate: **97.9638%**, above the required 70%.
- Minimum/average quality: `75 / 83.9276`; the average misses 84.0.
- Mean/minimum ILAD: `0.883127 / 0.75`.
- Per-brief unique minimum: `8`, below 27; mean/max overlap and duplicate page
  sets are zero.
- Template-tail rate: `6.1086%`.
- Failed gates: full pages, average quality, and per-brief unique minimum.

## Interpretation and boundary

The result separates two questions that earlier probes conflated. ConceptNet
anchor spelling can identify its generating keyword very reliably once a
candidate survives a strict 111-way comparison, so the semantic signal is not
absent. The generator does not preserve that signal often enough: roughly 96%
of each fixed candidate pool is rejected, making viable product pages
impossible under the declared capacity and diversity requirements.

This closes the current automatic semantic-generator route. Do not rescue it
with post-result top-k relaxation, selection on the nine-wrong diagnostic, or
another unsupervised scoring variant. The next evidence-bearing non-LLM step is
the already prepared blind same-brief preference collection and grouped
held-out preference learning. Production remains unchanged until retained
human evidence and shadow gates pass.
