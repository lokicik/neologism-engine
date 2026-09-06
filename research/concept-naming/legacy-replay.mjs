import assert from 'node:assert/strict'
import { readFileSync,writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { withBrowser,baseline,root } from '../shared-pool/harness.mjs'
const stable=x=>JSON.parse(JSON.stringify(x,(k,v)=>k==='durationMs'?undefined:v)),counts={}
await withBrowser(async page=>{
  // Exercise the new lane before all legacy paths to catch shared-state pollution.
  await page.evaluate(async()=>(await import('/src/lib/concept-naming.ts')).generateConceptNames({target:'product_name',config:{style:'big_tech',description:'a log viewer',seed:13}}))
  const old=JSON.parse(readFileSync(resolve(import.meta.dirname,'artifacts/baseline-auto.json')))
  assert.deepEqual(stable(await baseline(page)),stable(old));counts.auto=old.length;console.log(`PASS ${old.length} Auto pages`)
  for(const [experiment,artifact] of [['shared-pool','artifacts'],['brief-intent','artifacts'],['operation-object','artifacts'],['meaning-first','artifacts'],['product-frame','artifacts-v2'],['product-brief','artifacts-v3'],['retained-fragments','artifacts']]) {
    const dir=resolve(root,'research',experiment,artifact)
    const rows=JSON.parse(readFileSync(resolve(dir,'comparison.json'))).rows
    for(const row of rows) {
      const trace=JSON.parse(gunzipSync(readFileSync(resolve(dir,row.traceFile??row.filename))))
      const expected=experiment==='shared-pool'?trace:trace.current
      const actual=await page.evaluate(async cfg=>(await import('/src/lib/candidate-pool.ts')).generateCandidatePool(cfg),expected.config)
      assert.deepEqual(stable(actual),stable(expected),experiment)
    }
    counts[experiment]=rows.length;console.log(`PASS ${rows.length} ${experiment} runs`)
  }
})
writeFileSync(resolve(import.meta.dirname,'artifacts/legacy-replay.json'),JSON.stringify({passed:true,counts},null,2)+'\n')
