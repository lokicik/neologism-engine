import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { gzipSync, gunzipSync } from 'node:zlib'
import { withBrowser, identity, baseline, hash, root } from '../shared-pool/harness.mjs'

const dir = resolve(root, 'research/brief-intent')
const out = resolve(dir, 'artifacts')
mkdirSync(out, { recursive: true })
const protocolBytes = readFileSync(resolve(dir, 'protocol.json'))
const protocol = JSON.parse(protocolBytes)
const replay = process.argv.includes('--replay')
const stable = (value) => JSON.parse(JSON.stringify(value, (key, v) => key === 'durationMs' ? undefined : v))
const write = (name, value) => writeFileSync(resolve(out, name), Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2) + '\n', { flag: 'wx' })
const originalComparison = JSON.parse(readFileSync(resolve(root, 'research/shared-pool/artifacts/comparison.json')))
const source = identity()
source.protocolSha256 = hash(protocolBytes)
if (!replay) write('identity.json', source)
await withBrowser(async (page) => {
  const oldAuto = JSON.parse(readFileSync(resolve(root, 'research/shared-pool/artifacts/baseline.json'))).rows
  assert.deepEqual(stable(await baseline(page)), stable(oldAuto))
  console.log('PASS 48 original Auto pages and finalists unchanged')
  for (const row of originalComparison.rows) {
    const retained = JSON.parse(gunzipSync(readFileSync(resolve(root, 'research/shared-pool/artifacts', row.traceFile))))
    const current = await page.evaluate(async (config) => (await import('/src/lib/candidate-pool.ts')).generateCandidatePool(config), row.config)
    assert.deepEqual(stable(current), stable(retained))
  }
  console.log('PASS 48 original shared pools, finalists and internal traces unchanged')
  const rows = []
  for (const [partition, briefs] of [['development', protocol.development], ['evaluation', protocol.evaluation]]) {
    for (const brief of briefs) for (const seed of protocol.seeds) {
      const run = await page.evaluate(async ({ brief, seed }) => {
        const { generateCandidatePool } = await import('/src/lib/candidate-pool.ts')
        const e = await import('/src/lib/engine.ts')
        const p = await import('/src/lib/preferences.ts')
        const { pickShortlist } = await import('/src/lib/shortlist.ts')
        const config = { style: 'big_tech', variant: 'auto', description: brief, seed, count: 10, min_len: 4, max_len: 12, temperature: 0.85, variety: 0.3, roots: [], exclude: [] }
        const primary = await e.generateBatch(config)
        let pool = primary, batch
        if (p.needsQualityRepair(primary, 10)) {
          const fallback = await e.generateNames({ ...config, variant: undefined, compound: false, count: p.coldQualityPoolCount(10), exclude: primary.map((x) => x.name) })
          pool = [...primary, ...fallback]; batch = p.repairWeakShortlist(primary, fallback, 10)
        } else batch = p.shortlistByPreference(pool, null, 10, seed)
        batch = p.prioritizeColdStrongLead(batch)
        if (p.needsColdLeadRetry(batch)) batch = p.fillColdLeadRetry(batch, await e.generateColdLeadRetry(config), pool)
        const auto = pickShortlist(batch, e.cratesTaken)
        const old = await generateCandidatePool({ ...config, variant: 'shared_pool' })
        const current = await generateCandidatePool({ ...config, variant: 'intent_pool' })
        const repeat = await generateCandidatePool({ ...config, variant: 'intent_pool' })
        const next = await generateCandidatePool({ ...config, variant: 'intent_pool', exclude: current.finalists.map((f) => f.result.name.toUpperCase()) })
        return { auto, old, current, repeat, next }
      }, { brief, seed })
      assert.deepEqual(stable(run.current), stable(run.repeat), `repeat: ${brief}/${seed}`)
      assert(run.next.finalists.every((f) => !run.current.finalists.some((a) => a.proposalId === f.proposalId)))
      assert(run.current.families.length === 9 && run.current.families.every((f) => f.returned <= 24))
      assert(run.current.finalists.length <= 4)
      const intent = run.current.intent
      assert.equal(intent.status, 'parsed')
      for (const term of intent.terms) assert.equal(brief.slice(term.start, term.end), term.surface)
      const traceFile = `trace-${rows.length}.json.gz`
      const trace = { old: run.old, current: run.current, next: run.next }
      if (replay) assert.deepEqual(stable(trace), stable(JSON.parse(gunzipSync(readFileSync(resolve(out, traceFile))))))
      else write(traceFile, gzipSync(JSON.stringify(trace)))
      rows.push({ partition, brief, seed, intent, auto: run.auto.map((r) => r.name), old: run.old.finalists.map((f) => f.result.name), current: run.current.finalists.map((f) => f.result.name), poolCount: run.current.proposals.length, traceFile, traceSha256: hash(readFileSync(resolve(out, traceFile))) })
    }
    console.log(`PASS ${briefs.length * protocol.seeds.length} ${partition} runs: determinism, continuation, role spans and family limits`)
  }
  if (!replay) write('comparison.json', { protocolSha256: hash(protocolBytes), humanEvaluation: 'pending', rows })
  else assert.deepEqual(rows, JSON.parse(readFileSync(resolve(out, 'comparison.json'))).rows)
  const constraints = await page.evaluate(async () => {
    const { generateCandidatePool } = await import('/src/lib/candidate-pool.ts')
    const cfg = { style: 'big_tech', seed: 13, variant: 'intent_pool', description: 'a tool that verifies checksums before release' }
    const empty = await generateCandidatePool({ ...cfg, min_len: 12, max_len: 12, starts_with: 'zzzzzz' })
    const fallback = await generateCandidatePool({ ...cfg, description: 'a tool that does not track users' })
    const old = await generateCandidatePool({ ...cfg, variant: 'shared_pool', description: 'a tool that does not track users' })
    const clean = (r) => { delete r.intent; delete r.config.variant; return JSON.parse(JSON.stringify(r, (k, v) => k === 'durationMs' ? undefined : v)) }
    return { empty: empty.finalists.length, fallback: fallback.intent.status, identical: JSON.stringify(clean(fallback)) === JSON.stringify(clean(old)) }
  })
  assert.deepEqual(constraints, { empty: 0, fallback: 'fallback', identical: true })
  console.log('PASS impossible constraints and exact legacy fallback')
})
console.log(replay ? 'PASS retained intent experiment reproduced' : 'PASS intent experiment retained; no human preference claim')
