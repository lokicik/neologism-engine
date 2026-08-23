# Phase 303 sealed negative checkpoint

Date: 2026-08-23

## Decision

The multiclass-guided rejection sampler stops on sealed capacity. It passed all
development gates, but two of 33 sealed pages exhausted the frozen 40,000
attempts before reaching the required 160-candidate pool. No production shadow,
integration, or better-name claim opens.

The attempt budget, target pool, strict top-1 condition, model weights,
selection settings, and gates were not changed after either development or
sealed inspection. Two fresh sealed executions reproduced report and manifest
byte-for-byte.

## Frozen identity and reproduction

- Protocol / implementation / sealed-protocol commits:
  `bb571ec` / `53a2cdd` / `0db0758`.
- Development report / manifest SHA-256:
  `fb0e2d53a05210ed314323e31adf2f81fa9d3ab84077eeb059d9eddb46b247a5` /
  `ae66f2ea1160271758c99268e86e2169e9db58b75117b0e017c8d01367f0c69d`.
- Reproduced sealed report SHA-256:
  `7457f1439be84dfb5f7d3a4891961a5fa81686baf8517671f890fa218243f525`.
- Reproduced sealed manifest SHA-256:
  `786baad52f38ac2396a1db983b4f76acb0c4b364859927b147bc28e4fa2d65b4`.

## Sealed result

- Full pages/cards: `33/33` at 10 / `330` selected cards.
- Full 160-name pools: `31/33`; this fails the frozen capacity gate.
- `a fast performance monitor`, seed 13: `137/160` at 40,000 attempts.
- `a fast performance monitor`, seed 67: `150/160` at 40,000 attempts.
- Attempt mean/maximum: `22,920.85 / 40,000`.
- Strict multiclass rejections: `164,954`.
- Own-vs-nine-wrong rate: **100%**.
- Minimum/average quality: `75 / 87.8636`.
- Mean/minimum ILAD: `0.908680 / 0.875220`.
- Minimum per-brief unique names: `29/30`.
- Mean/maximum cross-seed overlap: `0.0606 / 1`; duplicate page sets: zero.
- Template tails: `10/330 = 3.0303%`.
- Every other frozen gate passes.

## Interpretation and boundary

Phase 303 establishes a useful but insufficient architectural fact: strict
111-way source conditioning can coexist with full, diverse visible pages and
very high technical brief discrimination. Its tail acceptance rate is not
reliable enough to guarantee the declared research pool across unseen briefs,
and the sample names still lack human aesthetic evidence.

Do not rescue the sealed failure by raising the attempt budget, shrinking the
pool, weakening top-1 to top-k, or tuning specifically for performance-monitor
briefs. Production remains byte-identical. The next admissible evidence path is
the already frozen blind 174-choice same-brief preference study and grouped
held-out learner; it is LLM-free and directly measures the aesthetic outcome
that automatic structural and semantic metrics cannot establish.
