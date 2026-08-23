# ConceptNet semantic preflight: source unavailable checkpoint

Date: 2026-08-23

## Decision

Phase 297 pauses before data inspection. The frozen official ConceptNet 5.7
`/related` endpoint returned HTTP `502 Bad Gateway` on the first lexically
ordered keyword in two separate explicit refresh attempts. No API response was
retained, no snapshot or source manifest exists, and offline validation did not
run.

This is not a failed semantic-coverage result and makes no claim about
ConceptNet's suitability. It is an external source-availability result. The
protocol forbids silently switching endpoints after the first refresh attempt,
so the old bulk dump, another mirror, per-edge queries, or manually assembled
responses were not substituted.

## Frozen identity and evidence

- Protocol commit: `6b4582d`.
- Implementation commit: `21ee700`.
- Protocol SHA-256:
  `0bcf85a453a61216fb26fa3f850de77a0687e13cf015451963eb8fee5c3f8d95`.
- Refresh implementation SHA-256:
  `164a21569c05d25d146ef5104c1da88dd3ccfef00c606299bbc3a693c2495c69`.
- Offline validator SHA-256:
  `41d4a646afd74f4a6cbd7a43bc2b831cdf355e6e3d790080ed241a214f304485`.
- Attempt 1: `HTTP Error 502: Bad Gateway` before response 1/111.
- Attempt 2: `HTTP Error 502: Bad Gateway` before response 1/111.
- `conceptnet-related.jsonl.gz`: absent.
- `source-manifest.json`: absent.
- validation report: absent.

## Consequence

Do not report Phase 297 as passing or failing its seven data gates. A future
retry may use the exact frozen endpoint and implementation when the official
service is available. A bulk-dump or alternate-source route would need a new
protocol because it changes acquisition, version identity, and reproducibility
conditions.

No generator work is justified by this checkpoint. The currently executable,
license-independent non-LLM route remains the prospectively frozen same-brief
human preference learner, whose model stage must wait for 174 genuine blind
choices.
