import { readFileSync,writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { withBrowser } from '../shared-pool/harness.mjs'
const file=resolve(import.meta.dirname,'artifacts/comparison.json'),rows=JSON.parse(readFileSync(file)).rows
await withBrowser(async page=>{
  const values=await page.evaluate(async rows=>{
    const e=await import('/src/lib/engine.ts'),s=await import('/src/lib/shortlist.ts')
    const out={}
    for(const row of rows)for(const r of row.auto.finalists)out[`${row.id}:${r.name}`]=s.advocacyFor(r,await e.explainName(r.name))
    return out
  },rows)
  writeFileSync(resolve(import.meta.dirname,'artifacts/auto-presentation.json'),JSON.stringify(values,null,2)+'\n')
})
