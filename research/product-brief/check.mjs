import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { gzipSync, gunzipSync } from 'node:zlib'
import { withBrowser, root, identity, hash } from '../shared-pool/harness.mjs'
const dir = import.meta.dirname, out = resolve(dir, 'artifacts-v3')
mkdirSync(out, { recursive: true })
const protocolBytes = readFileSync(resolve(dir, 'protocol.json')), protocol = JSON.parse(protocolBytes)
const stable = (x) => JSON.parse(JSON.stringify(x, (k, v) => k === 'durationMs' ? undefined : v))
const write = (f, v) => writeFileSync(resolve(out, f), Buffer.isBuffer(v) ? v : JSON.stringify(v, null, 2) + '\n', { flag: 'wx' })
const replay = process.argv.includes('--replay')
if (!replay) write('identity.json', { ...identity(), protocolSha256: hash(protocolBytes) })
await withBrowser(async (page) => {
  const generate = (cfg) => page.evaluate(async (cfg) => (await import('/src/lib/candidate-pool.ts')).generateCandidatePool(cfg), cfg)
  const names = (r) => r.finalists.map((f) => f.result.name)
  const previousDir = resolve(root, 'research/product-frame/artifacts-v2')
  const retained = JSON.parse(readFileSync(resolve(previousDir, 'comparison.json'))).rows
  for (const row of retained) {
    const expected = JSON.parse(gunzipSync(readFileSync(resolve(previousDir, row.traceFile)))).current
    assert.deepEqual(stable(await generate(expected.config)), stable(expected), `previous frame replay: ${row.brief}`)
  }
  console.log(`PASS ${retained.length} frozen product-frame pools, evidence, traces and finalists`)
  const rows = []
  const capture = async (config, meta) => {
    const old = await generate({ ...config, variant: 'frame_pool' })
    const current = await generate({ ...config, variant: 'brief_pool' })
    assert.deepEqual(stable(current), stable(await generate(current.config)))
    const next = await generate({ ...current.config, exclude: names(current).map((n) => n.toUpperCase()) })
    assert(next.finalists.every((f) => !current.finalists.some((a) => a.proposalId === f.proposalId)))
    assert(current.finalists.length <= 4 && current.families.every((f) => f.returned <= 24))
    assert.equal(current.trace.filter((t) => t.stage === 'selection').length, current.proposals.length)
    for (const term of current.intent.terms) assert.equal(config.description.slice(term.start, term.end), term.surface)
    for (const f of current.finalists) {
      const s = current.proposals.find((p) => p.id === f.proposalId).sources.find((s) => s.family === f.selectedFrom)
      assert(!s.rejection && s.semantic.decision === 'qualified')
      assert.equal(s.semantic.pronunciation.count, s.result.syllables)
      assert.equal(s.explanation.syllables, s.result.syllables)
    }
    const traceFile = `trace-${rows.length}.json.gz`, trace = { old, current, next }
    if (replay) assert.deepEqual(stable(trace), stable(JSON.parse(gunzipSync(readFileSync(resolve(out, traceFile))))))
    else write(traceFile, gzipSync(JSON.stringify(trace)))
    const contributed = current.proposals.filter((p) => p.sources.some((s) => s.semantic?.links.some((l) => l.method === 'benefit_construction')))
    const row = { ...meta, brief: config.description, seed: config.seed, old: names(old), current: names(current), status: current.semantic.status, frame: current.semantic.product_frame?.id ?? null,
      relation: current.semantic.object_relation ?? null, generationTerms: current.intent.generation_terms, benefitBlends: contributed.map((p) => p.name),
      selectedBenefitBlends: current.finalists.filter((f) => contributed.some((p) => p.id === f.proposalId)).map((f) => f.result.name),
      durationMs: current.durationMs, traceFile, sha256: hash(readFileSync(resolve(out, traceFile))) }
    rows.push(row)
    return current
  }
  let pairs = 0, identicalFinalists = 0
  for (const [index, pair] of protocol.paraphrases.entries()) for (const seed of protocol.seeds) {
    const cfg = { style: 'big_tech', seed, count: 10, min_len: 4, max_len: 12, roots: [], exclude: [], temperature: 0.85, variety: 0.3 }
    const a = await capture({ ...cfg, description: pair[0] }, { partition: 'paraphrase', pair: index, side: 0 })
    const b = await capture({ ...cfg, description: pair[1] }, { partition: 'paraphrase', pair: index, side: 1 })
    assert.equal(a.semantic.status, 'ready'); assert.equal(b.semantic.status, 'ready')
    assert.deepEqual(a.intent.generation_terms, b.intent.generation_terms)
    assert.deepEqual(a.semantic.material, b.semantic.material)
    assert.deepEqual(a.semantic.product_frame.matched_objects, b.semantic.product_frame.matched_objects)
    const frameNames = (r) => r.proposals.filter((p) => p.sources.some((s) => s.family === 'guided_metaphor')).map((p) => p.id).sort()
    assert.deepEqual(frameNames(a), frameNames(b), 'same frame candidates across equivalent descriptions')
    pairs++; if (JSON.stringify(names(a)) === JSON.stringify(names(b))) identicalFinalists++
    console.log(`PASS pair ${index + 1}, seed ${seed}: ${names(a).join(', ')} / ${names(b).join(', ')}`)
  }
  for (const row of retained.filter((r) => r.partition === 'evaluation' && r.seed === 13)) {
    const previous = JSON.parse(gunzipSync(readFileSync(resolve(previousDir, row.traceFile))))
    await capture(previous.current.config, { partition: 'regression', auto: previous.auto.finalists.map((f) => f.name) })
    console.log(JSON.stringify(rows.at(-1)))
  }
  for (const description of protocol.negative) {
    const r = await generate({ style: 'big_tech', variant: 'brief_pool', seed: 13, description })
    assert(!r.semantic.product_frame)
    if (r.semantic.status !== 'ready') assert.equal(r.finalists.length, 0)
  }
  const impossible = await generate({ style: 'big_tech', variant: 'brief_pool', seed: 13, description: protocol.paraphrases[0][0], min_len: 12, max_len: 12, starts_with: 'zzzzzz' })
  assert.equal(impossible.finalists.length, 0)
  if (!replay) {
    write('comparison.json', { protocolSha256: hash(protocolBytes), humanEvaluation: 'pending', rows })
    write('verification.json', { previousFrameReplays: retained.length, conditions: rows.length, repeats: rows.length, continuations: rows.length, controls: protocol.negative.length + 1, paraphrasePairs: pairs, identicalFrameMaterial: pairs, identicalFinalists })
  }
  console.log(`PASS ${rows.length} conditions; ${pairs} equivalent material pairs; ${identicalFinalists} identical finalist pairs`)
})
