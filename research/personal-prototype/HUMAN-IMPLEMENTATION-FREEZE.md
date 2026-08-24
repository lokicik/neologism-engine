# Phase 305 human-study implementation freeze

Date frozen: 2026-08-24

The study builder, collector, and auditor are frozen before source generation
and before the user sees or rates a recruited candidate. No collection or human
outcome exists.

- Human protocol SHA-256:
  `b12fc9de0873072f023c736f5fe5e933e998343883afd978290d4cd9d873cf02`.
- Source builder SHA-256:
  `94df2f80a3b9622b5f896f04ffdff300ebe92cedf0bf191be3f3aa406c2157d0`.
- Auditor SHA-256:
  `48f6db40c6afb0905e4e2ee2704452f3a55c6c6fc19a6a49f0946c601e1d1ddf`.
- Collector HTML/CSS/JavaScript SHA-256:
  `ca33b1779288225c3193eeea4145a85669c1e2f18ff0c043bb09f73087206f2b` /
  `79f8e7e27b924c95ed4e59fff691a8a30da61446cfdbafa1f164255c85f7e23b` /
  `e34746248ac35ad24e864f3f2e19a90627600bb67d7f7170ac9e9b765390fd06`.

Both Python files passed syntax parsing and the collector JavaScript passed
Node syntax checking. These checks produce no study source and are not human
evidence. The next action is one deterministic source build, followed by a
second byte-identical build and a frozen source/key hash checkpoint before the
collector is opened.
