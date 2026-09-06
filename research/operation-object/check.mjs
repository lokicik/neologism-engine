import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { gzipSync, gunzipSync } from 'node:zlib'
import { withBrowser, root, baseline, identity, hash } from '../shared-pool/harness.mjs'
const dir = resolve(root, 'research/operation-object')
const out = resolve(dir, 'artifacts')
mkdirSync(out, { recursive: true })
const protocolBytes = readFileSync(resolve(dir, 'protocol.json'))
const protocol = JSON.parse(protocolBytes)
const replay = process.argv.includes('--replay')
const stable = (value) => JSON.parse(JSON.stringify(value, (k, v) => k === 'durationMs' ? undefined : v))
const write = (name, value) => writeFileSync(resolve(out, name), Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2) + '\n', { flag: 'wx' })
if (!replay) write('identity.json', { ...identity(), protocolSha256: hash(protocolBytes) })
await withBrowser(async (page) => {
  const generate = (config) => page.evaluate(async (config) => (await import('/src/lib/candidate-pool.ts')).generateCandidatePool(config), config)
  const auto = JSON.parse(readFileSync(resolve(root, 'research/shared-pool/artifacts/baseline.json'))).rows
  assert.deepEqual(stable(await baseline(page)), stable(auto))
  console.log('PASS 48 original Auto pages')
  for (const experiment of ['shared-pool', 'brief-intent']) {
    const previous = resolve(root, 'research', experiment, 'artifacts')
    const rows = JSON.parse(readFileSync(resolve(previous, 'comparison.json'))).rows
    for (const row of rows) {
      const retained = JSON.parse(gunzipSync(readFileSync(resolve(previous, row.traceFile))))
      const expected = experiment === 'brief-intent' ? retained.current : retained
      assert.deepEqual(stable(await generate(expected.config)), stable(expected))
    }
    console.log(`PASS ${rows.length} retained ${experiment} pools, traces and finalists`)
  }
  const rows = []
  for (const [partition, briefs] of [['development', protocol.development], ['evaluation', protocol.evaluation]]) {
    for (const brief of briefs) for (const seed of protocol.seeds) {
      const cfg = { style: 'big_tech', variant: 'intent_pool', description: brief, seed, count: 10, min_len: 4, max_len: 12, temperature: 0.85, variety: 0.3, roots: [], exclude: [] }
      const old = await generate(cfg)
      const current = await generate({ ...cfg, variant: 'relation_pool' })
      assert.deepEqual(stable(current), stable(await generate(current.config)))
      const next = await generate({ ...current.config, exclude: current.finalists.map((f) => f.result.name.toUpperCase()) })
      assert(next.finalists.every((f) => !current.finalists.some((a) => a.proposalId === f.proposalId)))
      assert(current.families.length === 9 && current.families.every((f) => f.returned <= 24))
      assert(current.finalists.length <= 4)
      assert.equal(current.relation.status, 'ready', brief)
      for (const t of current.intent.terms) assert.equal(brief.slice(t.start, t.end), t.surface)
      for (const f of current.finalists) {
        const source = current.proposals.find((p) => p.id === f.proposalId).sources.find((s) => s.family === f.selectedFrom)
        assert(!source.rejection && source.relation.decision === 'linked')
        for (const match of [...source.relation.operation, ...source.relation.object]) assert.equal(f.result.name.toLowerCase().slice(match.start, match.end), match.material.root)
        assert(source.relation.operation.some((a) => source.relation.object.some((b) => a.end <= b.start || b.end <= a.start)))
      }
      const filename = `trace-${rows.length}.json.gz`
      const trace = { old, current, next }
      if (replay) assert.deepEqual(stable(trace), stable(JSON.parse(gunzipSync(readFileSync(resolve(out, filename))))))
      else write(filename, gzipSync(JSON.stringify(trace)))
      const rejectionCounts = {}
      for (const p of current.proposals) for (const s of p.sources) if (s.rejection) rejectionCounts[s.rejection] = (rejectionCounts[s.rejection] ?? 0) + 1
      rows.push({ partition, brief, seed, relation: current.relation, old: old.finalists.map((f) => f.result.name), current: current.finalists.map((f) => f.result.name), poolCount: current.proposals.length, linkedCount: current.proposals.filter((p) => p.sources.some((s) => s.relation?.decision === 'linked')).length, rejectionCounts, filename, sha256: hash(readFileSync(resolve(out, filename))) })
    }
    console.log(`PASS ${briefs.length * protocol.seeds.length} ${partition} conditions: repeatability, continuation, independent role evidence`)
  }
  for (const description of protocol.controls) {
    const run = await generate({ style: 'big_tech', variant: 'relation_pool', description, seed: 13 })
    assert.equal(run.relation.status, 'unresolved')
    assert.equal(run.finalists.length, 0)
  }
  const empty = await generate({ style: 'big_tech', variant: 'relation_pool', description: protocol.evaluation[0], seed: 13, starts_with: 'zzzzzz', min_len: 12, max_len: 12 })
  assert.equal(empty.finalists.length, 0)
  const result = { protocolSha256: hash(protocolBytes), humanEvaluation: 'pending', rows }
  if (replay) assert.deepEqual(result, JSON.parse(readFileSync(resolve(out, 'comparison.json'))))
  else write('comparison.json', result)
  console.log('PASS unresolved and impossible constraints stay empty; no fallback promotion')
})
