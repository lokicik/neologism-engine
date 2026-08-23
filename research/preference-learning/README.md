# Prospective preference-learning research

This isolated lane learns transparent same-brief preferences from human choices
between actual engine candidates. It uses no LLM at generation, training, or
runtime.

The frozen 60-brief recruitment bank passed its source gate and deterministically
selected 30 briefs with 150 primary pairs. The blind 174-decision collector is
implemented and verified. A pre-outcome power audit found the original 25-pair
sealed evaluation underpowered, so a six-fold nested grouped-CV successor now
uses the same collection more efficiently. No human collection or real model
fitting has happened.

- [Frozen protocol](PROTOCOL.md)
- [Passing source preflight](SOURCE-PREFLIGHT-PASS.md)
- [Collector-ready checkpoint](COLLECTOR-READY.md)
- [Frozen model protocol](MODEL-PROTOCOL.md)
- [Fitter-ready checkpoint](FITTER-READY.md)
- [Design audit protocol](DESIGN-AUDIT-PROTOCOL.md)
- [Design audit result](DESIGN-AUDIT-RESULT.md)
- [Grouped-CV model protocol](CV-MODEL-PROTOCOL.md)
- [Grouped-CV fitter-ready checkpoint](CV-FITTER-READY.md)
