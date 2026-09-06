import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { resolve } from 'node:path'
import { withBrowser, dir, hash } from './harness.mjs'
const comparison = JSON.parse(readFileSync(resolve(dir, 'artifacts/comparison.json'), 'utf8'))
const stable = (run) => {
  const result = JSON.parse(JSON.stringify(run))
  delete result.durationMs
  result.families.forEach((family) => { delete family.durationMs })
  return result
}
await withBrowser(async (page) => {
  for (const [index, row] of comparison.rows.entries()) {
    const bytes = readFileSync(resolve(dir, 'artifacts', row.traceFile))
    assert.equal(hash(bytes), row.traceSha256)
    const retained = JSON.parse(gunzipSync(bytes).toString('utf8'))
    const actual = await page.evaluate(async (config) => {
      const { generateCandidatePool } = await import('/src/lib/candidate-pool.ts')
      return generateCandidatePool(config)
    }, row.config)
    assert.deepEqual(stable(actual), stable(retained), `nondeterministic run: ${row.brief} / ${row.seed}`)
    if ((index + 1) % 12 === 0) console.log(`PASS ${index + 1}/${comparison.rows.length} complete pools, finalists and traces reproduced`)
  }
})
writeFileSync(resolve(dir, 'artifacts/reproduction.json'), JSON.stringify({ result: 'pass', reproducedRuns: comparison.rows.length, comparisonSha256: hash(readFileSync(resolve(dir, 'artifacts/comparison.json'))), ignoredFields: ['durationMs', 'families[].durationMs'] }, null, 2) + '\n')
