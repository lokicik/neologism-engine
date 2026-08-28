// Frozen classification fixture for lib/construction-shapes.mjs (Phase 141).
// Proves the classifier extraction (and any later edit) does not change how
// the primary held-out gate classifies existing output. Every branch and the
// order-sensitivity traps are pinned. Run: node e2e/construction-shapes-fixture.mjs
import { constructionShape } from './lib/construction-shapes.mjs'

const FIXTURE = [
  // sourceMode short-circuits, in declaration order.
  [{ name: 'Browsr', sourceMode: 'respell' }, 'respell'],
  [{ name: 'Meridian', sourceMode: 'realword' }, 'realword'],
  [{ name: 'SwiftForge', sourceMode: 'compound' }, 'compound'],
  [{ name: 'Shipulse', sourceMode: 'seamblend' }, 'seamblend'],
  // sourceMode wins over construction/coverage.
  [{ name: 'Keyflow', sourceMode: 'respell', construction: 'guided_metaphor' }, 'respell'],
  [{ name: 'Pinlens', sourceMode: 'seamblend', concept_coverage: 2 }, 'seamblend'],
  // Guided metaphor beats the direct-suffix check.
  [{ name: 'Lexify', sourceMode: 'brandable', construction: 'guided_metaphor', concept_coverage: 1 }, 'root_metaphor'],
  // Direct suffix requires coverage exactly 1.
  [{ name: 'Lexify', sourceMode: 'brandable', concept_coverage: 1 }, 'direct_suffix'],
  [{ name: 'Lexify', sourceMode: 'brandable', concept_coverage: 2 }, 'multi_concept'],
  [{ name: 'Lexify', sourceMode: 'brandable', concept_coverage: 0 }, 'other_brandable'],
  [{ name: 'Lexify', sourceMode: 'brandable' }, 'other_brandable'],
  // guided_pair has no dedicated branch: coverage decides.
  [{ name: 'Inklens', sourceMode: 'brandable', construction: 'guided_pair', concept_coverage: 2 }, 'multi_concept'],
  // Root+metaphor tail with coverage.
  [{ name: 'Tasknest', sourceMode: 'brandable', concept_coverage: 1 }, 'root_metaphor'],
  [{ name: 'Gridvault', sourceMode: 'brandable', concept_coverage: 1 }, 'root_metaphor'],
  // Tail too dominant (name barely longer than the tail) → not root_metaphor.
  [{ name: 'Anest', sourceMode: 'brandable', concept_coverage: 1 }, 'other_brandable'],
  // Tail without coverage → other_brandable.
  [{ name: 'Zornest', sourceMode: 'brandable', concept_coverage: 0 }, 'other_brandable'],
  [{ name: 'Zorvex', sourceMode: 'brandable', concept_coverage: 0 }, 'other_brandable'],
  // Non-letters are stripped before suffix checks.
  [{ name: 'Lex-ify', sourceMode: 'brandable', concept_coverage: 1 }, 'direct_suffix'],
  // Unknown sourceMode falls through to name/coverage logic.
  [{ name: 'Tasknest', concept_coverage: 1 }, 'other_brandable'],
  [{ name: 'Notion' }, 'other_brandable'],
]

let failures = 0
for (const [item, expected] of FIXTURE) {
  const actual = constructionShape(item)
  if (actual !== expected) {
    failures++
    console.log(`FAIL  ${JSON.stringify(item)} → ${actual} (expected ${expected})`)
  }
}
if (failures === 0) {
  console.log(`PASS  construction-shape fixture: ${FIXTURE.length}/${FIXTURE.length} pinned classifications hold`)
}
process.exit(failures === 0 ? 0 : 1)
