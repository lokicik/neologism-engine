import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { resolve } from 'node:path'
import { root, hash, identity, withBrowser } from '../shared-pool/harness.mjs'

const out = resolve(root, 'research/quality-cause/artifacts')
const read = (name) => JSON.parse(readFileSync(resolve(out, name)))
const write = (name, data) => writeFileSync(resolve(out, name), JSON.stringify(data, null, 2) + '\n')
const configs = read('configs.json')
const native = read('interventions-v2.json')
const names = (row) => row.results.map((r) => r.name)
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const original = read('interventions.json')
assert.deepEqual(native.rows, original.rows, 'Adding Reason diagnostics must not change prior interventions')
assert.equal(native.rows.length, 162)
assert.equal(native.reasonRows.length, 72)
const interventionSummary = ['legacy', 'intent', 'relation'].map((scope) => {
  const baseline = native.rows.filter((r) => r.scope === scope && r.arm === 'baseline')
  const arms = ['syllable_gate_disabled', 'appeal_bonuses_disabled'].map((arm) => {
    const pairs = baseline.map((a) => {
      const b = native.rows.find((r) => r.scope === scope && r.arm === arm && eq(r.config, a.config))
      return { brief: a.config.description, seed: a.config.seed, before: names(a), after: names(b), linkedBefore: a.linked, linkedAfter: b.linked }
    })
    return { arm, pages: pairs.length, identicalPages: pairs.filter((p) => eq(p.before, p.after)).length,
      sameLeader: pairs.filter((p) => p.before[0] === p.after[0]).length,
      newLinkedNames: pairs.reduce((n, p) => n + p.linkedAfter.filter((x) => !p.linkedBefore.includes(x)).length, 0), pairs }
  })
  return { scope, arms }
})
const pronunciation = [...new Map(native.rows.filter((r) => r.scope === 'relation' && r.arm === 'baseline')
  .flatMap((r) => r.pronunciation).map((p) => [p.name, p])).values()]
const reasonComparisons = native.reasonRows.filter((r) => r.arm === 'intent').map((a) => ({
  brief: a.config.description, seed: a.config.seed, before: names(a),
  arms: native.reasonRows.filter((r) => r.arm !== 'intent' && eq(r.config, a.config)).map((b) => ({
    arm: b.arm, terms: b.terms, after: names(b), identicalNames: eq(names(a), names(b)), evidence: b.evidence,
  })), beforeEvidence: a.evidence,
}))

const comparison = JSON.parse(readFileSync(resolve(root, 'research/operation-object/artifacts/comparison.json')))
const pools = configs.filter((c) => c.seed === 13).map((c) => {
  const row = comparison.rows.find((r) => r.brief === c.description && r.seed === 13)
  const bytes = readFileSync(resolve(root, 'research/operation-object/artifacts', row.filename))
  return { brief: c.description, source: row.filename, sourceSha256: hash(bytes), run: JSON.parse(gunzipSync(bytes)).old }
})
const selection = await withBrowser(async (page) => page.evaluate(async (pools) => {
  const { selectCandidates } = await import('/src/lib/candidate-pool.ts')
  return pools.map(({ brief, source, sourceSha256, run }) => {
    const baseline = selectCandidates(run.proposals, 13)
    const rotations = Array.from({ length: 256 }, (_, seed) => ({ seed, ...selectCandidates(run.proposals, seed) }))
    // Counterfactual: change ONLY Reason's internal rank, using structured
    // direct operation provenance. No handcrafted name/score/description rules.
    // This is a diagnosis; it does not establish aesthetic quality.
    const altered = structuredClone(run.proposals)
    const operation = run.intent.terms.filter((t) => t.role === 'operation').flatMap((t) => [t.term, t.surface.toLowerCase()])
    const reasonSources = altered.flatMap((p) => p.sources.filter((s) => s.family === 'reason'))
    const direct = (s) => operation.includes(s.meaning.reason?.chain[0]?.toLowerCase())
    reasonSources.sort((a, b) => Number(direct(b)) - Number(direct(a)) || a.rank - b.rank)
    reasonSources.forEach((s, i) => { s.rank = i + 1 })
    const operationFirst = selectCandidates(altered, 13)
    const candidateReach = run.proposals.filter((p) => p.sources.some((s) => !s.rejection)).map((p) => ({
      name: p.name, collision: p.collision, sources: p.sources.map((s) => ({ family: s.family, rank: s.rank, rejection: s.rejection, meaning: s.meaning })),
      baselineDecision: baseline.trace.find((t) => t.name === p.name)?.decision,
      selectionSeeds: rotations.filter((r) => r.finalists.some((f) => f.proposalId === p.id)).map((r) => r.seed),
    }))
    return { brief, source, sourceSha256, originalFinalists: run.finalists, baseline, operationFirst, candidateReach,
      rotationCount: rotations.length, rotations: rotations.map((r) => ({ seed: r.seed, familyOrder: r.familyOrder, finalists: r.finalists.map((f) => f.result.name) })) }
  })
}, pools))
for (const row of selection) assert.deepEqual(row.baseline.finalists, row.originalFinalists, 'Live selector reproduces frozen pool')
const result = { schema: 'quality-cause-analysis-v1',
  limitation: 'Six previously observed briefs, three seeds. Native interventions and fixed WASM pool selection are separate experiments. These are not new held-out or human preference results.',
  inputs: { nativeSha256: hash(readFileSync(resolve(out, 'interventions-v2.json'))), configsSha256: hash(readFileSync(resolve(out, 'configs.json'))) },
  interventionSummary, pronunciation, reasonComparisons, selection }
write('analysis.json', result)
write('analysis-identity.json', identity())
console.log(JSON.stringify({ verified: '162 prior native rows unchanged; 72 Reason controls; 6 frozen pools replayed; 1536 fixed-pool selection interventions',
  interventions: interventionSummary.map((x) => ({ scope: x.scope, arms: x.arms.map(({ pairs, ...rest }) => rest) })),
  reasonOrderUnchanged: reasonComparisons.filter((r) => r.arms.find((a) => a.arm === 'reverse_term_order').identicalNames).length,
  selection: selection.map((s) => ({ brief: s.brief, before: s.baseline.finalists.map((f) => f.result.name), operationFirst: s.operationFirst.finalists.map((f) => f.result.name),
    examples: s.candidateReach.filter((c) => ['Kiyas', 'Terazi', 'Metrack', 'Izci', 'Plumbline'].includes(c.name)).map((c) => ({ name: c.name, selectedIn: c.selectionSeeds.length, of: 256 })) })) }, null, 2))
