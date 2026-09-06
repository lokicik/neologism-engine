import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { runInNewContext } from 'node:vm'
import ts from '../../web/node_modules/typescript/lib/typescript.js'

const dir = import.meta.dirname, root = resolve(dir, '../..'), out = resolve(dir, 'artifacts')
const source = resolve(dir, '../product-brief/artifacts-v3')
const read = p => JSON.parse(readFileSync(p, 'utf8'))
const hash = p => createHash('sha256').update(readFileSync(p)).digest('hex')
const review = read(resolve(dir, 'review.json')), protocol = read(resolve(dir, 'protocol.json'))
const comparison = read(resolve(source, 'comparison.json')), delivery = read(resolve(source, 'delivery.json'))
// Read and execute the real selector; do not copy its ranking implementation.
// Its generator and Auto filter dependencies must never run in a frozen-pool experiment.
const selectorPath = resolve(root, 'web/src/lib/candidate-pool.ts')
const exports = {}
runInNewContext(ts.transpileModule(readFileSync(selectorPath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, { exports, require: name => {
  assert.equal(name, './auto')
  return { isReadableAutoRespell() { throw new Error('Generation is forbidden in this frozen-pool experiment') } }
}})
const select = (proposals, seed) => JSON.parse(JSON.stringify(exports.selectSemanticCandidates(proposals, seed, false)))
const names = result => result.finalists.map(f => f.result.name)
const eligible = p => p.sources.some(s => !s.rejection)

// This enumerates possible spelling cuts, NOT the original phonetic splice.
// No evidence is manufactured when two recorded parent words are unavailable.
function cuts(name, s) {
  const parents = [...new Set((s.semantic?.links ?? []).filter(l => ['generator_material', 'benefit_construction'].includes(l.method)).map(l => l.material))]
  if (parents.length !== 2) return []
  const lower = name.toLowerCase(), result = []
  for (const [left, right] of [parents, [...parents].reverse()]) {
    for (let i = 1; i <= left.length; i++) for (let j = 0; j < right.length; j++) {
      if (left.slice(0, i) + right.slice(j) === lower) result.push({ left, right, prefix: left.slice(0, i), suffix: right.slice(j), whole: i === left.length || j === 0 })
    }
  }
  return result
}
function experiment(proposals, seed, id) {
  const copied = structuredClone(proposals)
  const removed = []
  for (const p of copied) for (const s of p.sources) {
    if (s.rejection) continue
    const forms = cuts(p.name, s)
    if (!forms.length) continue // abstain, not an inferred rejection
    if (!forms.some(f => f.prefix.length >= 3 && f.suffix.length >= 3 && (id !== 'one_whole_parent' || f.whole))) {
      s.rejection = `prototype_${id}`
      removed.push({ name: p.name, family: s.family, rank: s.rank, inferredCuts: forms })
    }
  }
  return { ...select(copied, seed), removed, eligible: copied.filter(eligible).map(p => p.id) }
}
// General-rule sanity cases; deliberate false negative documents the boundary.
const fake = words => ({ semantic: { links: words.map(material => ({ method: 'generator_material', material })) } })
assert(cuts('Macheck', fake(['manifest', 'check'])).some(f => f.prefix === 'ma' && f.suffix === 'check'))
assert(cuts('Entryprise', fake(['entry', 'reprise'])).some(f => f.prefix === 'entry' && f.suffix === 'prise'))
assert(cuts('Acticord', fake(['activity', 'record'])).every(f => !f.whole))
assert(cuts('Metrack', fake(['memory', 'track'])).every(f => f.prefix.length < 3))
assert.deepEqual(cuts('arbitrary', fake(['manifest', 'check'])), [])

for (const [file, expected] of Object.entries(delivery.sourceFiles)) assert.equal(hash(resolve(root, file)), expected, `runtime/data drift: ${file}`)
const cases = [], rows = []
let reviewedIndex = 0
for (const row of comparison.rows) {
  assert.equal(hash(resolve(source, row.traceFile)), row.sha256)
  const trace = readFileSync(resolve(source, row.traceFile))
  const run = JSON.parse(gunzipSync(trace)).current
  const original = select(run.proposals, run.config.seed)
  assert.deepEqual(original.finalists, run.finalists, 'real selector must reproduce frozen finalists')
  const variants = Object.fromEntries(protocol.experiments.map(({id}) => {
    const a = experiment(run.proposals, run.config.seed, id)
    assert.deepEqual(a, experiment(run.proposals, run.config.seed, id), 'deterministic counterfactual')
    assert(a.finalists.length <= 4)
    assert.equal(new Set(a.finalists.map(f => f.proposalId.slice(0,3))).size, a.finalists.length)
    for (const f of a.finalists) {
      assert(a.eligible.includes(f.proposalId))
      assert(a.finalists.filter(other => other.selectedFrom === f.selectedFrom).length <= 2)
    }
    return [id, { finalists: names(a), removed: a.removed, eligible: a.eligible }]
  }))
  cases.push({ brief: row.brief, seed: row.seed, partition: row.partition, pair: row.pair, side: row.side, traceFile: row.traceFile, sha256: row.sha256, original: names(original), variants })
  if (row.partition !== 'regression') continue
  const r = review.rows[reviewedIndex++], labels = new Map()
  for (const [category, list] of Object.entries({ shortlist: r.picks, ...r.categories })) for (const name of list) {
    assert(review.categories[category])
    assert(!labels.has(name.toLowerCase()), `duplicate review: ${name}`)
    labels.set(name.toLowerCase(), category)
  }
  assert(r.picks.length <= 2)
  const pool = run.proposals.filter(eligible)
  assert.deepEqual([...labels.keys()].sort(), pool.map(p => p.id).sort(), `incomplete editorial review: ${row.brief}`)
  const proposals = pool.map(p => ({
    name: p.name, category: labels.get(p.id), collision: p.collision,
    selected: run.finalists.some(f => f.proposalId === p.id),
    decision: run.trace.find(t => t.stage === 'selection' && t.name === p.name)?.decision,
    sources: p.sources.map(s => ({ family: s.family, rank: s.rank, rejection: s.rejection ?? null, meaning: s.semantic?.links ?? [], reason: s.meaning.reason, inferredCuts: cuts(p.name, s) }))
  }))
  const excludedSources = run.proposals.flatMap(p => p.sources.filter(s => s.rejection).map(s => ({ name: p.name, family: s.family, reason: s.rejection })))
  const generatorRejections = run.trace.filter(t => t.stage === 'generator')
  rows.push({ brief: row.brief, traceFile: row.traceFile, auto: row.auto, current: names(original), picks: r.picks, rationale: r.reason,
    buried: r.picks.filter(n => !run.finalists.some(f => f.proposalId === n.toLowerCase())), proposals,
    excludedSources, generatorRejections, variants })
}
assert.equal(rows.length, 12)
assert.equal(rows.reduce((n,r) => n + r.proposals.length, 0), 170)
const experiments = protocol.experiments.map(({id}) => {
  const lostPicks = rows.flatMap(r => r.picks.filter(n => !r.variants[id].eligible.includes(n.toLowerCase())).map(name => ({brief:r.brief, name})))
  const surfacedPicks = rows.flatMap(r => r.buried.filter(n => r.variants[id].finalists.some(f => f.toLowerCase() === n.toLowerCase())).map(name => ({brief:r.brief,name})))
  const paraphrases = cases.filter(c => c.partition === 'paraphrase')
  let equivalentPairs = 0
  for (const a of paraphrases.filter(c => c.side === 0)) {
    const b = paraphrases.find(c => c.pair === a.pair && c.seed === a.seed && c.side === 1)
    assert.deepEqual(a.variants[id].finalists, b.variants[id].finalists)
    equivalentPairs++
  }
  return { id, lostPicks, surfacedPicks, changedRegressionLists: rows.filter(r => JSON.stringify(r.current) !== JSON.stringify(r.variants[id].finalists)).length,
    changedConditions: cases.filter(r => JSON.stringify(r.original) !== JSON.stringify(r.variants[id].finalists)).length,
    equivalentPairs, retentionGate: lostPicks.length === 0 && surfacedPicks.length > 0 ? 'necessary check passed; human quality unproven' : 'failed; do not adopt' }
})
const summary = { reviewedBriefs: rows.length, reviewedEligibleSpellings:170, chosen:rows.reduce((n,r)=>n+r.picks.length,0),
  briefsWithAssistantChoice:rows.filter(r=>r.picks.length).length, buriedChoices:rows.reduce((n,r)=>n+r.buried.length,0),
  briefsWithBuriedChoices: rows.filter(r=>r.buried.length).length, frozenConditions:cases.length,
  experiments, runtimeSourceFilesUnchanged:Object.keys(delivery.sourceFiles).length, humanQualityGate:'pending; unchanged', qualityImprovementEstablished:false }
mkdirSync(out, { recursive:true })
writeFileSync(resolve(out, 'analysis.json'), JSON.stringify({summary,method:review.method,rows,cases},null,2)+'\n')
writeFileSync(resolve(out, 'identity.json'), JSON.stringify({protocolSha256:hash(resolve(dir,'protocol.json')),reviewSha256:hash(resolve(dir,'review.json')),
  scriptSha256:hash(resolve(dir,'analyze.mjs')), selectorSha256:hash(selectorPath), sourceDeliverySha256:hash(resolve(source,'delivery.json')),
  comparisonSha256:hash(resolve(source,'comparison.json')), traces:Object.fromEntries(comparison.rows.map(r=>[r.traceFile,r.sha256]))},null,2)+'\n')
console.log(JSON.stringify(summary,null,2))
