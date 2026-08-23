# Phase 300 implementation freeze

Date frozen: 2026-08-23

This file was written before any Phase 300 sample, candidate pool, selected
page, condition contrast, or gate outcome was generated or inspected.

- Protocol commit: `2743c18`.
- Protocol SHA-256:
  `1cb08bdfee7419d2503e04dee3ad74e9017159cccf0ca7adc49df3aa393fb137`.
- Rust probe SHA-256:
  `a9dd6f60fa8d28d5b55aa839f351004e37d6a560803f2afaba91128ec4ce02ab`.
- Clean runner SHA-256:
  `e490ce247c2ac2094ae3d029015c2792144f04fb0fa1532052b69686ff220ead`.
- Clean committed core:
  `ccdb67b49ae053f10ed7bdd4ee683d622d2c50b7`.
- Compressed / expanded anchor SHA-256:
  `ff207ad1570356b1a820726dc6c6dc980826425bd40e440ce4dac0d0f4788e55` /
  `1121464a02fdeab0bd85177a25917b6fefbc273588fc6e00bd1b0a5b4557efec`.
- Derived train / validation corpus SHA-256:
  `fe974bf069a620061ed60727154861b2373a4626f8d185a81e7b5aa4392b9c70` /
  `fc464b1b7486e3e6ab58f69cebfcb8cba89705177c9ff8bf77b91b685e5e51a4`.

Before this freeze, Python syntax, Rust formatting, exact input identities,
anchor inventory/order, and a clean offline release `cargo check` passed. The
sampler was not executed. The check used a temporary clean archive and did not
include uncommitted user core files.

The first real run must target development in an empty ignored directory. Any
failed development gate closes the route before sealed held-out. No stochastic
weight, temperature, attempt count, filter, selector, or threshold may change
after the report is inspected.
