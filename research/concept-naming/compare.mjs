import assert from 'node:assert/strict'
import { readFileSync,writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { withBrowser,baseline,hash,root } from '../shared-pool/harness.mjs'
const dir=import.meta.dirname,out=resolve(dir,'artifacts')
const protocol=JSON.parse(readFileSync(resolve(dir,'protocol.json')))
const frozen=JSON.parse(readFileSync(resolve(out,'frozen.json')))
for(const [file,expected] of Object.entries(frozen.files))assert.equal(hash(readFileSync(resolve(root,file))),expected,`frozen source changed: ${file}`)
assert.equal(hash(readFileSync(resolve(root,'web/src/wasm/neologism_wasm_bg.wasm'))),frozen.wasmSha256)
assert.equal(hash(readFileSync(resolve(out,'frozen.json'))),protocol.catalogFreezeSha256)
const rows=[]
await withBrowser(async page=>{
  const auto=await baseline(page,protocol)
  for(const [index,c] of protocol.cases.entries()) {
    const concept=await page.evaluate(async brief=>(await import('/src/lib/concept-naming.ts')).generateConceptNames({target:'product_name',config:{style:'big_tech',variant:'product_names',description:brief,seed:13,count:10,min_len:4,max_len:12,roots:[],exclude:[]}}),c.brief)
    const diagnostic=await page.evaluate(async ({a,b})=>{const {composite}=await import('/src/lib/score.ts');const summarize=ns=>({count:ns.length,meanStructural:ns.length?ns.reduce((s,n)=>s+composite(n),0)/ns.length:null,uniqueOpenings:new Set(ns.map(n=>n.name.toLowerCase().slice(0,3))).size});return {auto:summarize(a),concept:summarize(b)}},
      {a:auto[index].finalists,b:concept.finalists.map(f=>concept.candidates.find(p=>p.id===f.id).result)})
    rows.push({...c,auto:auto[index],concept,diagnostic})
    console.log(`${c.id}: ${concept.meaning.status}; Auto ${auto[index].finalists.map(f=>f.name).join(', ')}; Product names ${concept.finalists.map(f=>f.id).join(', ')}`)
  }
})
const stable=x=>JSON.parse(JSON.stringify(x,(k,v)=>k==='durationMs'?undefined:v))
const result={schema:'concept-naming-comparison-v1',protocolSha256:hash(readFileSync(resolve(dir,'protocol.json'))),catalogIdentity:frozen.catalogIdentity,rows,qualityImprovementEstablished:false}
if(process.argv.includes('--replay'))assert.deepEqual(stable(result),stable(JSON.parse(readFileSync(resolve(out,'comparison.json')))))
else writeFileSync(resolve(out,'comparison.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'})
writeFileSync(resolve(out,'comparison-verification.json'),JSON.stringify({passed:true,replayed:process.argv.includes('--replay'),sha256:hash(readFileSync(resolve(out,'comparison.json'))),briefs:rows.length},null,2)+'\n')
