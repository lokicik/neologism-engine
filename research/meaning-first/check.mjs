import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { withBrowser, root, baseline, identity, hash } from '../shared-pool/harness.mjs'
const dir = resolve(root, 'research/meaning-first')
const out = resolve(dir, 'artifacts')
mkdirSync(out, { recursive: true })
const protocolBytes = readFileSync(resolve(dir, 'protocol.json'))
const protocol = JSON.parse(protocolBytes)
const stable = (x) => JSON.parse(JSON.stringify(x, (k, v) => k === 'durationMs' ? undefined : v))
const write = (f, v) => writeFileSync(resolve(out, f), Buffer.isBuffer(v) ? v : JSON.stringify(v, null, 2) + '\n', { flag: 'wx' })
write('identity.json', { ...identity(), protocolSha256: hash(protocolBytes) })
await withBrowser(async (page) => {
  const checks = await page.evaluate(async () => {
    const { selectSemanticCandidates } = await import('/src/lib/candidate-pool.ts')
    const make = (name, family, rank, tier) => ({ id: name.toLowerCase(), name, collision: 'snapshot_absent', sources: [{ family, rank, result: { name }, semantic: { tier, decision: tier === null ? 'missing_operation_evidence' : 'qualified' } }] })
    const checks = []
    const check = (x, label) => { if (!x) throw Error(label); checks.push(label) }
    const pick = (p) => selectSemanticCandidates(p, 13).finalists.map((f) => f.result.name)
    check(!pick([]).length, 'empty pool')
    const weak = make('Alpha', 'morpheme', 1, null)
    const full = make('Bravo', 'seamblend', 24, 0)
    const metaphor = make('Cedar', 'reason', 1, 2)
    check(JSON.stringify(pick([weak, metaphor, full])) === JSON.stringify(['Bravo', 'Cedar']), 'meaning before family order and internal rank; no weak padding')
    full.sources.push({ ...full.sources[0], family: 'brandable', rank: 1 })
    check(pick([full, metaphor]).filter((n) => n === 'Bravo').length === 1, 'merged sources cannot duplicate spelling')
    const sources = [make('Alpha', 'reason', 1, 2), make('Bravo', 'reason', 2, 2), make('Cedar', 'reason', 3, 2), make('Alpine', 'compound', 1, 0), make('Delta', 'seamblend', 1, 1), make('Epsilon', 'morpheme', 1, 0)]
    const result = selectSemanticCandidates(sources, 13)
    check(result.finalists.length <= 4, 'four maximum')
    check(new Set(result.finalists.map((f) => f.proposalId.slice(0, 3))).size === result.finalists.length, 'opening cap')
    check(result.finalists.filter((f) => f.selectedFrom === 'reason').length <= 2, 'family cap')
    check(result.trace.length === sources.length, 'trace covers every proposal')
    const changed = structuredClone(sources)
    changed.forEach((p) => p.sources.forEach((s) => { s.result.reasonChain = 'invented explanation'; s.result.score_pronounce = 100; s.explanation = { text: 'unrelated' } }))
    check(JSON.stringify(pick(sources)) === JSON.stringify(pick(changed)), 'explanation and structural scores ignored')
    return checks
  })
  console.log(`PASS ${checks.length} meaning selector contracts`)
  const autos = await baseline(page, protocol)
  console.log(`Captured ${autos.length} Auto comparisons`)
  const generate = (cfg) => page.evaluate(async (cfg) => (await import('/src/lib/candidate-pool.ts')).generateCandidatePool(cfg), cfg)
  const rows = []
  for (const auto of autos) {
    const cfg = { ...auto.config, variant: 'semantic_pool' }
    const current = await generate(cfg)
    assert.deepEqual(stable(current), stable(await generate(cfg)))
    const previous = await generate({ ...cfg, variant: 'intent_pool' })
    const next = await generate({ ...cfg, exclude: current.finalists.map((f) => f.result.name.toUpperCase()) })
    assert(current.finalists.length <= 4)
    assert(current.families.length === 9 && current.families.every((f) => f.returned <= 24))
    assert.equal(current.semantic.status, 'ready', auto.brief)
    const phrase = current.semantic.object_phrase
    assert.equal(auto.brief.slice(phrase.start, phrase.end), phrase.surface)
    assert(phrase.terms.every((t) => current.intent.generation_terms.includes(t.term)), 'no dropped object modifier')
    assert(next.finalists.every((f) => !current.finalists.some((a) => a.proposalId === f.proposalId)))
    assert.equal(current.trace.filter((t) => t.stage === 'selection').length, current.proposals.length)
    for (const f of current.finalists) {
      const s = current.proposals.find((p) => p.id === f.proposalId).sources.find((s) => s.family === f.selectedFrom)
      assert(!s.rejection && s.semantic.decision === 'qualified' && s.semantic.tier !== null)
      assert.equal(s.semantic.pronunciation.count, s.result.syllables)
      assert.equal(s.explanation.syllables, s.result.syllables)
      assert(s.result.name.length >= cfg.min_len && s.result.name.length <= cfg.max_len)
    }
    const traceFile = `trace-${rows.length}.json.gz`
    write(traceFile, gzipSync(JSON.stringify({ auto, previous, current, next })))
    const row = { partition: auto.partition, brief: auto.brief, seed: auto.seed,
      auto: auto.finalists.map((f) => f.name), previous: previous.finalists.map((f) => f.result.name),
      current: current.finalists.map((f) => f.result.name), count: current.proposals.length,
      qualified: current.proposals.filter((p) => p.sources.some((s) => !s.rejection)).length,
      durationMs: current.durationMs, autoDurationMs: auto.durationMs, traceFile, sha256: hash(readFileSync(resolve(out, traceFile))) }
    rows.push(row)
    if (auto.seed === 13) console.log(JSON.stringify(row))
  }
  for (const description of protocol.controls) {
    const r = await generate({ style: 'big_tech', variant: 'semantic_pool', seed: 13, description })
    assert.equal(r.semantic.status, 'unresolved'); assert.equal(r.finalists.length, 0)
  }
  const impossible = await generate({ style: 'big_tech', variant: 'semantic_pool', seed: 13, description: protocol.development[0], starts_with: 'zzzzzz', min_len: 12, max_len: 12 })
  assert.equal(impossible.finalists.length, 0)
  write('comparison.json', { protocolSha256: hash(protocolBytes), humanEvaluation: 'pending', rows })
  write('verification.json', { selectorContracts: checks, conditions: rows.length, repeats: rows.length, continuations: rows.length, controls: protocol.controls.length + 1 })
  console.log('PASS all comparisons, exact repeats, continuation, object phrase, evidence, pronunciation, constraints and unresolved cases')
})
