import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { hash, root } from '../shared-pool/harness.mjs'

const dir=import.meta.dirname,out=resolve(dir,'artifacts')
const json=file=>JSON.parse(readFileSync(resolve(root,file)))
const digest=file=>hash(readFileSync(resolve(root,file)))
const delivered=json('research/retained-fragments/artifacts/delivery.json')
for(const [file,expected] of Object.entries(delivered.sourceFiles))assert.equal(digest(file),expected,`runtime drift: ${file}`)

const protocol=json('research/final-direction/artifacts/coverage-protocol.json')
const coverage=json('research/final-direction/artifacts/coverage.json')
const replay=json('research/final-direction/artifacts/coverage-replay.json')
assert.equal(digest(protocol.source),protocol.sourceSha256)
assert.equal(coverage.protocolSha256,digest('research/final-direction/artifacts/coverage-protocol.json'))
assert.equal(replay.protocolSha256,coverage.protocolSha256)
assert.equal(replay.resultSha256,digest('research/final-direction/artifacts/coverage.json'))
assert.equal(replay.matched,true)
assert.equal(coverage.wasmSha256,digest('web/src/wasm/neologism_wasm_bg.wasm'))
assert.deepEqual(coverage.rows.map(r=>r.brief),protocol.briefs)
assert.deepEqual(coverage.summary,{all:{briefs:35,ready:2,benefitFrame:0,nonempty:2},developer:{briefs:14,ready:0,benefitFrame:0,nonempty:0}})

const anchors=json('research/final-direction/artifacts/anchors.json')
for(const [file,expected] of Object.entries(anchors.dataHashes))assert.equal(digest(file),expected)
for(const [file,expected] of Object.entries(anchors.traces))assert.equal(digest(`research/product-brief/artifacts-v3/${file}`),expected)
assert.equal(anchors.rows.length,24)
assert.equal(anchors.summary.firstCollisionRejection,22)
assert.equal(anchors.summary.firstPhonotacticRejection,1)
assert.deepEqual(anchors.rows.filter(r=>r.outcome==='emitted').map(r=>r.word),['reprise'])

// These hashes are published in the historical negative checkpoints, not
// freshly generated expectations from today's parsed reports.
const humanFile='research/preference-learning/work/real-descriptive-a/report.json'
const labelsFile='research/personal-acceptability/work/run-a/labels.json'
const acceptabilityFile='research/personal-acceptability/work/run-a/report.json'
assert.equal(digest(humanFile),'7bb7d432f5d4ba1ef05c6043205dff4a2bae9d5b0cbc759940a3a1abaef041fa')
assert.equal(digest(labelsFile),'38b96bad9d84855c5b4affb6a6179eae282f485e421ec744a488494d3e3115b8')
assert.equal(digest(acceptabilityFile),'671ee91d03039cd5673edbecc469e9854674deae171303d369e314fa2dac57c9')
const human=json(humanFile),labels=json(labelsFile)
assert.deepEqual(human.choiceCounts.primary,{left:33,neither:77,right:40})
assert.equal(Object.values(human.choiceCounts.all).reduce((a,b)=>a+b,0),174)
assert.equal(human.repeatAudit.consistent,13)
assert.equal(human.repeatAudit.total,24)
assert.equal(labels.length,201)
assert.equal(labels.filter(r=>r.label===1).length,68)
assert.equal(labels.filter(r=>r.label===0).length,133)

const files=readdirSync(dir).filter(f=>/\.(md|mjs)$/.test(f)).map(f=>`research/final-direction/${f}`)
for(const file of files.filter(f=>f.endsWith('.md'))) {
  const source=readFileSync(resolve(root,file),'utf8')
  for(const [,target] of source.matchAll(/\]\(([^)]+)\)/g)) {
    if(/^[a-z]+:\/\//i.test(target)||target.startsWith('#')||target==='artifacts/verification.json')continue
    assert(existsSync(resolve(dir,target.split('#')[0])),`missing link in ${file}: ${target}`)
  }
}
const evidenceFiles=[...files,...readdirSync(out).filter(f=>f.endsWith('.json')&&f!=='verification.json').map(f=>`research/final-direction/artifacts/${f}`),humanFile,labelsFile,acceptabilityFile,
  'research/preference-learning/COLLECTION-NEGATIVE-CHECKPOINT.md','research/preference-learning/README.md','research/personal-acceptability/NEGATIVE-CHECKPOINT.md',
  'research/personal-prototype/anchors.json','research/shared-pool/harness.mjs','research/retained-fragments/artifacts/delivery.json']
writeFileSync(resolve(out,'verification.json'),JSON.stringify({passed:true,scope:'Research evidence verification; no new runtime release or human quality pass',runtimeSourceHashesMatched:Object.keys(delivered.sourceFiles).length,
  coverage:coverage.summary,coverageReplayMatched:true,anchors:anchors.summary,humanEvidence:{reportedDecisions:174,primaryNeither:77,decisive:73,repeatAgreement:'13/24',derivedLabels:201,rawCollectionReplayed:false},
  runtimeChanged:false,proposedArchitectureImplemented:false,qualityImprovementEstablished:false,sourceHashes:Object.fromEntries(evidenceFiles.map(f=>[f,digest(f)]))},null,2)+'\n')
console.log(`PASS: ${Object.keys(delivered.sourceFiles).length} unchanged runtime source hashes; 35-brief replay; 24 anchor outcomes; retained preference report/label identities; report links.`)
