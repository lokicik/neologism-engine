# ConceptNet-conditioned stochastic sampler: Phase 300 negative checkpoint

Date: 2026-08-23

## Decision

Phase 300 stops on development before sealed held-out, production shadowing, or
human preference work. Stochastic inference repairs Phase 299's zero-capacity
beam collapse and passes every frozen form, quality, diversity, collision,
surface, lane, and deterministic gate. It nevertheless fails the decisive
brief-conditioning gate by a wide margin.

No sampling weight, temperature, attempt count, anchor set, selector, wrong-
brief diagnostic, or threshold changed after the first report. A second fresh
clean run reproduced report and manifest byte-for-byte. Sealed held-out was not
run.

## Frozen identity and reproduction

- Protocol commit: `2743c18`.
- Implementation commit: `36e155a`.
- Protocol SHA-256:
  `1cb08bdfee7419d2503e04dee3ad74e9017159cccf0ca7adc49df3aa393fb137`.
- Probe SHA-256:
  `a9dd6f60fa8d28d5b55aa839f351004e37d6a560803f2afaba91128ec4ce02ab`.
- Runner SHA-256:
  `e490ce247c2ac2094ae3d029015c2792144f04fb0fa1532052b69686ff220ead`.
- Phase 298 anchors SHA-256:
  `ff207ad1570356b1a820726dc6c6dc980826425bd40e440ce4dac0d0f4788e55`.
- Reproduced development report SHA-256:
  `8140a0b00f83e3cc3607fa7b4fe097ad61d790a46fe6c9d3ab14a05e97e4bde0`.
- Reproduced manifest SHA-256:
  `aaa727b252088bd7b13d63b26afd0a59072cde38abb0bccebb6e79859f3e5edc`.

## Development result

- Pools / pages / selected cards: 72/72 at 160 / 72/72 at 10 / 720.
- Minimum / average quality: `76 / 88.5819`.
- Mean / minimum page ILAD: `0.909834 / 0.874471`.
- Minimum per-brief unique names: 30/30.
- Mean / maximum cross-seed overlap: `0 / 0`; duplicate page sets: zero.
- Template tails: 44/720 = `6.111%`.
- Complete anchor copies, lexical hazards, and review collisions among selected
  cards: zero; lane coverage and caps pass.
- Same-process and two-fresh-process reproduction: byte-identical.
- Own brief semantic model beats all nine wrong briefs: **29.444%**, below the
  frozen 70% gate.

Example mechanically selected pages contain plausible-looking but weakly
grounded forms such as `Connater`, `Neling`, `Fitort`, `Predify`, `Webotor`,
`Catart`, and `Bashiki`. High automatic form scores do not make their intended
brief evident.

## Interpretation and next boundary

Phase 298 proved graph coverage; Phase 300 shows that raw anchor character
likelihood is dominated by common English spelling patterns. Adding it directly
to the product prior creates abundant novel forms but does not preserve
discriminative semantics. Increasing the semantic weight after seeing this
result would be an outcome-driven retune and risks moving back toward Phase
299's known-word modes.

A distinct follow-up may test a contrastive density-ratio energy:
`own-anchor logp - all-anchor background logp`. This subtracts ubiquitous
English-anchor spelling and can be evaluated prospectively as a selector over
the already frozen development pools without regenerating them or consulting
wrong-brief scores during selection. It must keep the same 70% own-vs-wrong,
quality, diversity, lane, collision, and sealed gates. Until such a declared
test passes, the non-LLM production path remains the prospective human
preference learner.
