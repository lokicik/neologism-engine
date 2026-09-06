import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { withBrowser, root, baseline } from '../shared-pool/harness.mjs'
const stable=x=>JSON.parse(JSON.stringify(x,(k,v)=>k==='durationMs'?undefined:v)), counts={}
await withBrowser(async page=>{
  const auto=JSON.parse(readFileSync(resolve(root,'research/shared-pool/artifacts/baseline.json'))).rows
  assert.deepEqual(stable(await baseline(page)),stable(auto));counts.auto=auto.length
  console.log(`PASS ${auto.length} Auto pages`)
  for(const [experiment,artifact] of [['shared-pool','artifacts'],['brief-intent','artifacts'],['operation-object','artifacts'],['meaning-first','artifacts'],['product-frame','artifacts-v2']]) {
    const dir=resolve(root,'research',experiment,artifact)
    const rows=JSON.parse(readFileSync(resolve(dir,'comparison.json'))).rows
    for(const row of rows) {
      const trace=JSON.parse(gunzipSync(readFileSync(resolve(dir,row.traceFile??row.filename))))
      const expected=experiment==='shared-pool'?trace:trace.current
      const actual=await page.evaluate(async cfg=>(await import('/src/lib/candidate-pool.ts')).generateCandidatePool(cfg),expected.config)
      assert.deepEqual(stable(actual),stable(expected),experiment)
    }
    counts[experiment]=rows.length;console.log(`PASS ${rows.length} ${experiment} pools, evidence and traces`)
  }
})
writeFileSync(resolve(import.meta.dirname,'artifacts/legacy-replay.json'),JSON.stringify({passed:true,counts},null,2))
