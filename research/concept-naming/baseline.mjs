import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { identity, withBrowser, baseline, protocol } from '../shared-pool/harness.mjs'
const dir=import.meta.dirname
mkdirSync(resolve(dir,'artifacts'),{recursive:true})
writeFileSync(resolve(dir,'baseline.json'),JSON.stringify(identity(),null,2)+'\n',{flag:'wx'})
await withBrowser(async page=>{
  const rows=await baseline(page,protocol)
  writeFileSync(resolve(dir,'artifacts/baseline-auto.json'),JSON.stringify(rows,null,2)+'\n',{flag:'wx'})
  console.log(`Captured ${rows.length} unchanged Auto pages and finalists.`)
})
