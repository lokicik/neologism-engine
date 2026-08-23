# Thirty-name source preflight: negative checkpoint

Date: 2026-08-23

The first frozen preference-study source protocol stops before creating any
pair. On the first brief (`p01`, seed 271001), the production Auto candidate
generator returns 28 names for a requested 30. The protocol requires exactly
30 unique names, so progress remains 0/30 and no study or key is prepared.

- Canonical resolved protocol SHA-256:
  `8a7fe00f2a239a443091d919445dc542c056e03ffe7c0e588ee65d396d9b3fe2`
- Protocol document SHA-256:
  `8b1bf37b887cec3fe05049f9fdbbd9da5c02f3a79edf33da75ee9f3a1255fc59`
- Failure: `Expected 30 names, received 28.`
- Network/model/taste calls: 0
- Source cases recorded: 0

The 30-name threshold is not changed after inspection. A separate collection
protocol may declare a 24-name pool up front. Twenty-four is already the frozen
pool size in the earlier Phase-270 study and still leaves fourteen unused names
after forming five disjoint pairs.
