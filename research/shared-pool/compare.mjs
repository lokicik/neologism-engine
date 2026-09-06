import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { withBrowser, baseline, identity, writeNew, dir, root, hash } from './harness.mjs'

const before = JSON.parse(readFileSync(resolve(dir, 'artifacts/baseline.json'), 'utf8'))
const frozen = identity()
if (existsSync(resolve(dir, 'artifacts/experiment-identity.json'))) {
  const original = JSON.parse(readFileSync(resolve(dir, 'artifacts/experiment-identity.json'), 'utf8'))
  for (const [path, sha] of Object.entries(original.files)) {
    if (/^(core\/|wasm\/|web\/src\/lib\/)/.test(path)) assert.equal(frozen.files[path], sha, `generation source changed after freeze: ${path}`)
  }
  assert.equal(original.protocolSha256, frozen.protocolSha256)
} else writeNew('experiment-identity.json', frozen)
const rows = await withBrowser(async (page) => {
  const after = await baseline(page)
  assert.equal(after.length, before.rows.length)
  after.forEach((row, i) => {
    assert.deepEqual(JSON.parse(JSON.stringify(row.batch)), before.rows[i].batch, `Auto page changed: ${row.brief}, ${row.seed}`)
    assert.deepEqual(JSON.parse(JSON.stringify(row.finalists)), before.rows[i].finalists, `Auto finalists changed: ${row.brief}, ${row.seed}`)
    assert.equal(row.poolCount, before.rows[i].poolCount)
  })
  console.log(`PASS ${after.length} Auto pages and finalist sets unchanged`)
  const output = []
  for (const [index, old] of after.entries()) {
    const run = await page.evaluate(async (config) => {
      const { generateCandidatePool } = await import('/src/lib/candidate-pool.ts')
      return generateCandidatePool(config)
    }, old.config)
    const traceFile = `trace-${String(index + 1).padStart(2, '0')}.json.gz`
    const bytes = gzipSync(JSON.stringify(run), { mtime: 0 })
    writeFileSync(resolve(dir, 'artifacts', traceFile), bytes, { flag: 'wx' })
    output.push({ partition: old.partition, brief: old.brief, seed: old.seed, config: old.config,
      baseline: { batch: old.batch, finalists: old.finalists, poolCount: old.poolCount, originalDurationMs: before.rows[index].durationMs, currentDurationMs: old.durationMs },
      experiment: { finalists: run.finalists, distinctPool: run.proposals.length, eligiblePool: run.proposals.filter((p) => p.sources.some((s) => !s.rejection)).length,
        mergedSpellings: run.proposals.filter((p) => p.sources.length > 1).length,
        missingMeaning: run.proposals.filter((p) => p.sources.every((s) => s.meaning.status === 'missing')).length,
        familyOrder: run.familyOrder, families: run.families.map(({ events, ...f }) => ({ ...f, eventCount: events.length })), durationMs: run.durationMs },
      traceFile, traceSha256: hash(bytes),
    })
    console.log(`${index + 1}/${after.length}: ${run.proposals.length} distinct / ${run.finalists.length} finalists (${Math.round(run.durationMs)} ms)`)
  }
  return output
})
const comparison = { schema: 'shared-pool-comparison-v1', protocolSha256: frozen.protocolSha256, identitySha256: hash(JSON.stringify(frozen)), baselineParity: true, rows }
writeNew('comparison.json', comparison)
const median = (values) => { const sorted = [...values].sort((a,b) => a-b); return sorted[Math.floor(sorted.length/2)] }
const evaluation = rows.filter((r) => r.partition === 'evaluation')
const examples = evaluation.filter((r, i) => i % 3 === 0)
const report = `# Shared-pool experiment\n\nStatus: mechanically evaluated; human preference result pending. Auto is unchanged.\n\n## Reproducibility\n\n- ${rows.length} baseline Auto pages and finalist sets reproduced exactly after instrumentation.\n- ${evaluation.length} evaluation pages: 12 prospectively frozen briefs, three seeds each.\n- Code/data identities and the original user-owned dirty diff are retained in artifacts. Full per-page traces are gzip JSON with SHA-256 hashes in comparison.json.\n- Deterministic results exclude wall-clock timings. Durations include diagnostic collection and serialization work; this is not a production-speed benchmark.\n\n## Descriptive results\n\n- Median distinct candidate pool: ${median(evaluation.map((r) => r.experiment.distinctPool))}.\n- Median eligible candidate pool: ${median(evaluation.map((r) => r.experiment.eligiblePool))}.\n- Pages with four finalists: ${evaluation.filter((r) => r.experiment.finalists.length === 4).length}/${evaluation.length}.\n- Median experimental duration: ${Math.round(median(evaluation.map((r) => r.experiment.durationMs)))} ms.\n- Median warmed Auto duration in the same harness: ${Math.round(median(evaluation.map((r) => r.baseline.currentDurationMs)))} ms. Auto and Lab perform different amounts of work.\n\n## Concrete outputs (seed 13)\n\n| Brief | Existing Auto finalists | Shared-pool finalists |\n|---|---|---|\n${examples.map((r) => `| ${r.brief} | ${r.baseline.finalists.map((f) => f.name).join(', ')} | ${r.experiment.finalists.map((f) => f.result.name).join(', ')} |`).join('\n')}\n\n## Interpretation boundary\n\nThe experiment exposes candidates outside Auto's preselected page. More candidates, different families and richer explanations do not establish better names. Missing per-name semantic evidence is recorded explicitly, not guessed from an explanation.\n\nThe collector contains 12 primary page comparisons and four concealed side-reversed repeats. Promotion requires at least 8 experimental wins, at least 6 usable experimental briefs, at least 3 more usable briefs than Auto, and at least 3 consistent repeats. No weights or gates may be tuned using these outcomes. No model is fitted.\n\nInternal traces cover materialized spellings and retrieved inventory entries. Failed construction attempts without a spelling are outside the trace vocabulary. Intermediate nested Submorph events inside Reason are marked by their original stage. A producer's unreturned spelling is not necessarily bad: it may be filtered, ranked below its page budget, or excluded by a diversity cap. The experiment does not bypass those producer decisions.\n`
writeFileSync(resolve(dir, 'REPORT.md'), report, { flag: 'wx' })
assert.equal(hash(readFileSync(resolve(root, 'web/src/lib/candidate-pool.ts'))), frozen.files['web/src/lib/candidate-pool.ts'])
console.log('Comparison and report retained; human gate remains pending.')
