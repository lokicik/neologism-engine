# Phase 305 collector pre-open correction

Date: 2026-08-24

Browser verification before user handoff found that the author-level
`.done-view { display: flex }` rule overrode the browser's default rendering of
the `hidden` attribute. The completion screen appeared below the first rating
card.

The collector now declares `[hidden] { display: none !important; }`. No study
source, task, name, order, choice schema, storage behavior, audit key, gate, or
auditor changed. No user decision existed before this correction.

- Previous collector CSS SHA-256:
  `79f8e7e27b924c95ed4e59fff691a8a30da61446cfdbafa1f164255c85f7e23b`.
- Corrected collector CSS SHA-256:
  `30d4bf2e1a2f1d261b46dec62096ebd8c9ab32c25de4652b91cdb76b0fbc6ada`.
