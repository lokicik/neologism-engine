import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { withBrowser, root, baseline } from '../shared-pool/harness.mjs'
const stable = (x) => JSON.parse(JSON.stringify(x, (k, v) => k === 'durationMs' ? undefined : v))
const counts = {}
await withBrowser(async (page) => {
  const auto = JSON.parse(readFileSync(resolve(root, 'research/shared-pool/artifacts/baseline.json'))).rows
  assert.deepEqual(stable(await baseline(page)), stable(auto))
  counts.auto = auto.length
  console.log(`PASS ${auto.length} frozen Auto pages`)
  for (const experiment of ['shared-pool', 'brief-intent', 'operation-object', 'meaning-first']) {
    const dir = resolve(root, 'research', experiment, 'artifacts')
    const rows = JSON.parse(readFileSync(resolve(dir, 'comparison.json'))).rows
    for (const row of rows) {
      const trace = JSON.parse(gunzipSync(readFileSync(resolve(dir, row.traceFile ?? row.filename))))
      const expected = experiment === 'shared-pool' ? trace : trace.current
      const current = await page.evaluate(async (cfg) => (await import('/src/lib/candidate-pool.ts')).generateCandidatePool(cfg), expected.config)
      assert.deepEqual(stable(current), stable(expected), experiment)
    }
    counts[experiment] = rows.length
    console.log(`PASS ${rows.length} frozen ${experiment} pools, traces, evidence and finalists`)
  }
})
writeFileSync(resolve(import.meta.dirname, 'artifacts-v3/legacy-replay.json'), JSON.stringify({ passed: true, counts }, null, 2))
