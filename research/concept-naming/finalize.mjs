import assert from 'node:assert/strict'
import { readFileSync,writeFileSync,existsSync,readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { hash,root } from '../shared-pool/harness.mjs'
const dir=import.meta.dirname,out=resolve(dir,'artifacts'),json=p=>JSON.parse(readFileSync(resolve(dir,p)))
const frozen=json('artifacts/frozen.json'),before=json('baseline.json'),mechanical=json('artifacts/mechanical.json'),comparison=json('artifacts/comparison.json'),protocol=json('protocol.json')
for(const [file,expected] of Object.entries(frozen.files))assert.equal(hash(readFileSync(resolve(root,file))),expected,`frozen file changed: ${file}`)
assert.equal(hash(readFileSync(resolve(root,'web/src/wasm/neologism_wasm_bg.wasm'))),frozen.wasmSha256)
const allowed=['core/src/lib.rs','wasm/src/lib.rs','web/src/App.tsx','web/src/lib/engine.ts','web/src/components/CommandBar.tsx','web/src/components/Shortlist.tsx','web/src/index.css']
const changed=Object.keys(before.files).filter(f=>before.files[f]!==hash(readFileSync(resolve(root,f))))
assert(changed.every(f=>allowed.includes(f)),`unexpected baseline change: ${changed.filter(f=>!allowed.includes(f))}`)
for(const file of ['mechanical-verification.json','comparison-verification.json','ui-verification.json','study-verification.json','legacy-replay.json','production-verification.json'])assert(json('artifacts/'+file).passed,file)
assert(json('artifacts/mechanical-verification.json').replayed);assert(json('artifacts/comparison-verification.json').replayed)
const audits=json('audits/audits.json');assert.equal(audits.length,6);assert(audits.every(r=>r.exitCode===0))
assert.match(readFileSync(resolve(dir,'rust-tests.log'),'utf8'),/232 passed; 0 failed/)
assert.match(readFileSync(resolve(dir,'build.log'),'utf8'),/built in/)
assert(existsSync(resolve(root,'web/dist/third-party-notices.txt')))
assert.equal(hash(readFileSync(resolve(out,'comparison.json'))),json('artifacts/blind-key.json').comparisonSha256)
assert.equal(hash(readFileSync(resolve(out,'blind-study.json'))),json('artifacts/blind-key.json').studySha256)
assert.equal(json('artifacts/collector-fixture.json').evidence_kind,'synthetic')
const median=ns=>{const s=[...ns].sort((a,b)=>a-b);return (s[Math.floor((s.length-1)/2)]+s[Math.floor(s.length/2)])/2}
const summarize=(type)=>{
  const rows=comparison.rows,lists=rows.map(r=>type==='auto'?r.auto.finalists:r.concept.finalists.map(f=>r.concept.candidates.find(p=>p.id===f.id).result)),all=lists.flat()
  return {briefs:rows.length,nonempty:lists.filter(a=>a.length).length,finalistCards:all.length,distinctFinalistNames:new Set(all.map(n=>n.name.toLowerCase())).size,
    meanStructural:rows.reduce((s,r)=>s+r.diagnostic[type].meanStructural,0)/rows.length,medianWarmGenerationMs:median(rows.map(r=>r[type].durationMs)),
    eligibleMean:type==='concept'?rows.reduce((s,r)=>s+r.concept.candidates.filter(p=>!p.rejection&&p.sources.some(s=>!s.rejection)).length,0)/rows.length:null}
}
const summary={scope:'Mechanics and bounded output comparison; not human naming quality',auto:summarize('auto'),concept:summarize('concept'),canonical:mechanical.canonicalSummary,
  canonicalDeveloper:{briefs:14,nonempty:mechanical.coverage.slice(20,34).filter(r=>r.finalists.length).length},humanEvaluation:{status:'pending',actualResponses:0,qualityImprovementEstablished:false,gates:protocol.humanGate}}
writeFileSync(resolve(out,'summary.json'),JSON.stringify(summary,null,2)+'\n')
const files=[...readdirSync(dir).filter(f=>/\.(mjs|html|json|md|log)$/.test(f)).map(f=>'research/concept-naming/'+f),
  ...readdirSync(out).filter(f=>/\.(json|html|png)$/.test(f)&&f!=='delivery.json').map(f=>'research/concept-naming/artifacts/'+f)]
writeFileSync(resolve(out,'delivery.json'),JSON.stringify({passed:true,rustTests:232,audits:6,legacyReplay:json('artifacts/legacy-replay.json').counts,
  mechanicalReplay:true,comparisonReplay:true,uiVerified:true,studyVerified:true,productionBundleVerified:true,offlineGenerationAfterLoad:true,frozenSourceFiles:Object.keys(frozen.files).length,changedExistingRuntimeFiles:changed,
  otherBaselineFilesPreserved:Object.keys(before.files).length-changed.length,defaultAutoUnchanged:true,qualityImprovementEstablished:false,humanEvaluation:'pending',
  artifactHashes:Object.fromEntries(files.map(f=>[f,hash(readFileSync(resolve(root,f)))]))},null,2)+'\n')
console.log(JSON.stringify({passed:true,...summary,runtimeFilesVerified:Object.keys(frozen.files).length},null,2))
