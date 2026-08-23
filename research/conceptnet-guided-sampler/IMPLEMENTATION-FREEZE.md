# Phase 303 Implementation Freeze

This implementation was frozen after a clean compile-only check and before the
first development result was produced.

## Frozen files and dependencies

- Protocol commit: `bb571ec`.
- `PROTOCOL.md`: `e4f8843700bd51e248436c32e74b1e0aecaf612288a40a6f55d8a31e8d999457`.
- `README.md`: `2e4beb07bdd6944cdae88ee8aec0b6654cacffd08bf6d98e94bc60280b076d55`.
- `materialize_probe.py`: `4f7d43c8684d038ebcb31721e5b09cad1f2dfedf5d67fac99de8fce0f476bf51`.
- `run_clean.py`: `c298ad8bc142c9e102b304bd550f3123a927985e050cd39160d7f42ebc99a925`.
- Materialized Rust probe: `2b061ddc3f032b9fdf1f2e16b1634c755ab5682077f51149079ead7b7deb68d8`.
- Immutable Phase 300 probe: `a9dd6f60fa8d28d5b55aa839f351004e37d6a560803f2afaba91128ec4ce02ab`.
- Immutable Phase 300 runner: `e490ce247c2ac2094ae3d029015c2792144f04fb0fa1532052b69686ff220ead`.
- Frozen clean core: `ccdb67b49ae053f10ed7bdd4ee683d622d2c50b7`.
- Phase 298 anchors: `ff207ad1570356b1a820726dc6c6dc980826425bd40e440ce4dac0d0f4788e55`.

## Pre-result verification

- Both Python files parse under Python 3.12.
- The materializer requires exactly one match for every declared source edit
  and fails closed on the Phase 300 probe hash.
- The generated Rust example compiles in release mode with the locked offline
  dependency graph against a clean archive of the frozen core.
- The generated probe contains 111-way strict source-class rejection inside
  the sampling loop and retains the 40,000-attempt bound.

No development or sealed report existed when these hashes were recorded.
