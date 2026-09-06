import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { withBrowser, hash, root } from '../shared-pool/harness.mjs'
const dir=import.meta.dirname,out=resolve(dir,'artifacts')
const replay=process.argv.includes('--replay')
assert(process.argv.slice(2).every(arg=>arg==='--replay'),'only --replay is supported')
mkdirSync(out,{recursive:true})
const sourcePath=resolve(root,'web/e2e/heldout-cold-quality-audit.mjs')
const source=readFileSync(sourcePath,'utf8')
const match=source.match(/const BASE_PROMPTS = (\[[\s\S]*?\n\])/)
assert(match,'canonical brief list')
const briefs=JSON.parse(JSON.stringify(runInNewContext(match[1])))
assert.equal(briefs.length,35)
const protocol={purpose:'Scope diagnosis only; existing canonical prompts, not held-out quality evidence. No prompt rewriting or source edits.',source:'web/e2e/heldout-cold-quality-audit.mjs',sourceSha256:hash(source),seed:13,briefs}
if(replay)assert.deepEqual(JSON.parse(readFileSync(resolve(out,'coverage-protocol.json'))),protocol,'frozen protocol drift')
else writeFileSync(resolve(out,'coverage-protocol.json'),JSON.stringify(protocol,null,2)+'\n',{flag:'wx'})
const delivered=JSON.parse(readFileSync(resolve(root,'research/retained-fragments/artifacts/delivery.json')))
const verifyRuntime=()=>{for(const [file,expected] of Object.entries(delivered.sourceFiles))assert.equal(hash(readFileSync(resolve(root,file))),expected,`runtime drift: ${file}`)}
verifyRuntime()
const rows=[]
await withBrowser(async page=>{
  for(const [i,brief] of briefs.entries()) {
    const row=await page.evaluate(async brief=>{
      const pool=await import('/src/lib/candidate-pool.ts')
      const cfg={style:'big_tech',variant:'brief_pool',seed:13,description:brief,count:10,min_len:4,max_len:12,roots:[],exclude:[]}
      const run=await pool.generateCandidatePool(cfg)
      return {brief,status:run.semantic.status,reason:run.semantic.reason,terms:run.intent.generation_terms,frame:run.semantic.product_frame?.id??null,proposals:run.proposals.length,eligible:run.proposals.filter(p=>p.sources.some(s=>!s.rejection)).length,finalists:run.finalists.map(f=>f.result.name)}
    },brief)
    rows.push({...row,developerSubset:i>=20&&i<=33})
    console.log(`${i+1}/35 ${row.status}; ${row.frame??'no frame'}; ${row.finalists.join(', ')}`)
  }
})
const tally=rs=>({briefs:rs.length,ready:rs.filter(r=>r.status==='ready').length,benefitFrame:rs.filter(r=>r.frame).length,nonempty:rs.filter(r=>r.finalists.length).length})
const result={protocolSha256:hash(readFileSync(resolve(out,'coverage-protocol.json'))),runtimeUnchanged:Object.keys(delivered.sourceFiles).length,wasmSha256:hash(readFileSync(resolve(root,'web/src/wasm/neologism_wasm_bg.wasm'))),summary:{all:tally(rows),developer:tally(rows.filter(r=>r.developerSubset))},rows,qualityImprovementEstablished:false}
verifyRuntime()
if(replay){
  assert.deepEqual(result,JSON.parse(readFileSync(resolve(out,'coverage.json'))),'coverage replay differs')
  writeFileSync(resolve(out,'coverage-replay.json'),JSON.stringify({matched:true,briefs:rows.length,runtimeUnchanged:result.runtimeUnchanged,protocolSha256:result.protocolSha256,resultSha256:hash(readFileSync(resolve(out,'coverage.json')))},null,2)+'\n')
}else writeFileSync(resolve(out,'coverage.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify(result.summary,null,2))
