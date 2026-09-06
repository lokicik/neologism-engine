import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { gzipSync, gunzipSync } from 'node:zlib'
import { withBrowser, root, baseline, identity, hash } from '../shared-pool/harness.mjs'
const dir = import.meta.dirname, out = resolve(dir, 'artifacts-v2')
mkdirSync(out, { recursive: true })
const protocolBytes = readFileSync(resolve(dir, 'protocol.json')), protocol = JSON.parse(protocolBytes)
const stable = (x) => JSON.parse(JSON.stringify(x, (k, v) => k === 'durationMs' ? undefined : v))
const write = (f, v) => writeFileSync(resolve(out, f), Buffer.isBuffer(v) ? v : JSON.stringify(v, null, 2) + '\n', { flag: 'wx' })
const replay = process.argv.includes('--replay')
if (!replay) write('identity.json', { ...identity(), protocolSha256: hash(protocolBytes) })
await withBrowser(async (page) => {
  const generate = (cfg) => page.evaluate(async (cfg) => (await import('/src/lib/candidate-pool.ts')).generateCandidatePool(cfg), cfg)
  const select = (run, prioritize) => page.evaluate(async ({ run, prioritize }) => (await import('/src/lib/candidate-pool.ts')).selectSemanticCandidates(run.proposals, run.config.seed, prioritize), { run, prioritize })
  const names = (r) => r.finalists.map((f) => f.result.name)
  const contracts = await page.evaluate(async () => {
    const { selectSemanticCandidates: select } = await import('/src/lib/candidate-pool.ts')
    const make = (name, family, rank, tier) => ({ id: name.toLowerCase(), name, sources: [{ family, rank, semantic: { decision: 'qualified', tier }, result: { name } }] })
    const pool = [make('Bravo', 'compound', 9, 0), make('Cedar', 'reason', 1, 2), make('Delta', 'seamblend', 1, 1)]
    const pick = (p) => select(p, 13, false).finalists.map((f) => f.result.name)
    if (pick(pool)[0] === 'Bravo') throw Error('literal coverage still overrides rank')
    const changed = structuredClone(pool)
    changed.forEach((p) => p.sources.forEach((s) => { s.semantic.tier = 0; s.result.reasonChain = 'persuasive explanation'; s.result.score_pronounce = 100 }))
    if (JSON.stringify(pick(pool)) !== JSON.stringify(pick(changed))) throw Error('coverage or prose changes ranking')
    pool[0].sources[0].rejection = 'excluded'
    if (pick(pool).includes('Bravo') || pick([]).length) throw Error('rejection/empty handling')
    pool.push(make('Cedar', 'morpheme', 1, 0), make('Cedric', 'reason', 2, 0), make('Elmwood', 'reason', 3, 2), make('Firwood', 'reason', 4, 2))
    const r = select(pool, 13, false)
    if (r.finalists.length > 4 || new Set(r.finalists.map((f) => f.proposalId.slice(0, 3))).size !== r.finalists.length || r.finalists.filter((f) => f.selectedFrom === 'reason').length > 2) throw Error('diversity caps')
    if (r.trace.length !== pool.length) throw Error('missing traces')
    const a = make('MeshAlert', 'guided_metaphor', 1, 1), b = make('AlertMesh', 'guided_metaphor', 2, 1)
    a.sources[0].semantic.product_frame = b.sources[0].semantic.product_frame = { frame_id: 'selection', anchor: { word: 'mesh' }, object_term: 'alert' }
    const mirrored = select([a, b], 13, false)
    if (mirrored.finalists.length !== 1 || !mirrored.trace.some((t) => t.decision === 'construction_duplicate')) throw Error('mirrored construction wastes a slot')
    return ['coverage priority removed', 'coverage and prose invariant', 'rejection and empty', 'duplicate and prefix cap', 'family and finalist cap', 'trace completeness', 'mirrored composition deduplicated']
  })
  console.log(`PASS ${contracts.length} selector contracts`)
  const previousDir = resolve(root, 'research/meaning-first/artifacts')
  const retained = JSON.parse(readFileSync(resolve(previousDir, 'comparison.json'))).rows
  for (const row of retained) {
    const expected = JSON.parse(gunzipSync(readFileSync(resolve(previousDir, row.traceFile)))).current
    assert.deepEqual(stable(await generate(expected.config)), stable(expected), `old semantic replay: ${row.brief}`)
  }
  console.log(`PASS ${retained.length} unchanged meaning-first pools, evidence, traces and finalists`)
  const autos = await baseline(page, protocol), rows = []
  for (const auto of autos) {
    const old = await generate({ ...auto.config, variant: 'semantic_pool' })
    const current = await generate({ ...auto.config, variant: 'frame_pool' })
    const selectionOnly = await select(old, false), inventoryOnly = await select(current, true)
    assert.deepEqual(stable(current), stable(await generate(current.config)))
    const next = await generate({ ...current.config, exclude: names(current).map((n) => n.toUpperCase()) })
    assert(next.finalists.every((f) => !current.finalists.some((a) => a.proposalId === f.proposalId)))
    assert.equal(current.families.length, 9); assert(current.families.every((f) => f.returned <= 24))
    assert(current.finalists.length <= 4)
    assert.equal(current.trace.filter((t) => t.stage === 'selection').length, current.proposals.length)
    for (const f of current.finalists) {
      const s = current.proposals.find((p) => p.id === f.proposalId).sources.find((s) => s.family === f.selectedFrom)
      assert(!s.rejection && s.semantic.decision === 'qualified')
      assert.equal(s.semantic.pronunciation.count, s.result.syllables)
      assert.equal(s.explanation.syllables, s.result.syllables)
      if (s.family === 'guided_metaphor') assert(s.semantic.product_frame, 'new metaphor family requires frame provenance')
    }
    const trace = { auto, old, selectionOnly, inventoryOnly, current, next }
    const traceFile = `trace-${rows.length}.json.gz`
    if (replay) assert.deepEqual(stable(trace), stable(JSON.parse(gunzipSync(readFileSync(resolve(out, traceFile))))))
    else write(traceFile, gzipSync(JSON.stringify(trace)))
    const row = { partition: auto.partition, brief: auto.brief, seed: auto.seed, auto: auto.finalists.map((f) => f.name), old: names(old), selectionOnly: names(selectionOnly), inventoryOnly: names(inventoryOnly), current: names(current), frame: current.semantic.product_frame?.id ?? null, status: current.semantic.status, reason: current.semantic.reason, count: current.proposals.length, qualified: current.proposals.filter((p) => p.sources.some((s) => !s.rejection)).length, durationMs: current.durationMs, traceFile, sha256: hash(readFileSync(resolve(out, traceFile))) }
    rows.push(row)
    if (auto.seed === 13) console.log(JSON.stringify(row))
  }
  for (const description of protocol.controls) {
    const r = await generate({ style: 'big_tech', variant: 'frame_pool', seed: 13, description })
    assert(!r.semantic.product_frame)
    if (r.semantic.status !== 'ready') assert.equal(r.finalists.length, 0)
    assert.equal(r.families.find((f) => f.family === 'guided_metaphor').returned, 0)
  }
  const impossible = await generate({ style: 'big_tech', variant: 'frame_pool', seed: 13, description: protocol.evaluation[0], min_len: 12, max_len: 12, starts_with: 'zzzzzz' })
  assert.equal(impossible.finalists.length, 0)
  if (!replay) {
    write('comparison.json', { protocolSha256: hash(protocolBytes), humanEvaluation: 'pending', rows })
    write('verification.json', { selectorContracts: contracts, legacyMeaningReplays: retained.length, conditions: rows.length, repeats: rows.length, continuations: rows.length, controls: protocol.controls.length + 1 })
  }
  console.log(`PASS ${rows.length} comparisons with separate inventory/selection ablations, repeats and continuations`)
})
