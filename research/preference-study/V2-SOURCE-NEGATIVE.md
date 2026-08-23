# Twenty-four-name source v2: negative checkpoint

Date: 2026-08-23

The v2 source preflight fixes only v1's impossible exact-30 capacity assumption.
The first brief now returns all 24 requested unique names, but at least one has
composite quality below the frozen 75 floor. Pair construction therefore stops
at 0/30 briefs with `Pool contains a sub-75 name.`

- Canonical resolved v2 protocol SHA-256:
  `fdfa6139d93e42a38c6e3986a89500d35ae4576026dcd07bfa100334f28572c6`
- Network/model/taste calls: 0
- Source cases recorded: 0

The quality floor is not weakened. A separate v3 may preserve and identify the
exact raw 24-name pool while declaring that only quality-eligible names can
enter pairs. It must require enough eligible capacity before pairing and must
not silently substitute or regenerate names after inspection.
