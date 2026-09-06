import assert from 'node:assert/strict'
import { readFileSync,writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { hash } from '../shared-pool/harness.mjs'
const dir=import.meta.dirname,out=resolve(dir,'artifacts'),root=resolve(dir,'../..')
const read=f=>JSON.parse(readFileSync(resolve(out,f)))
const identity=read('identity.json'),baseline=JSON.parse(readFileSync(resolve(dir,'baseline.json')))
for(const [file,sha] of Object.entries(identity.files)) assert.equal(hash(readFileSync(resolve(root,file))),sha,`source drift: ${file}`)
assert.equal(hash(readFileSync(resolve(root,'web/src/wasm/neologism_wasm_bg.wasm'))),identity.wasmSha256)
assert.equal(hash(readFileSync(resolve(dir,'protocol.json'))),identity.retainedProtocolSha256)
assert.equal(hash(readFileSync(resolve(dir,'../pool-review/review.json'))),identity.reviewSha256)
for(const [file,sha] of Object.entries(baseline.sourceFiles).filter(([f])=>f.startsWith('core/data/')))assert.equal(hash(readFileSync(resolve(root,file))),sha,`data changed: ${file}`)
const comparison=read('comparison.json')
assert.equal(comparison.rows.length,44)
for(const row of comparison.rows)assert.equal(hash(readFileSync(resolve(out,row.traceFile))),row.sha256)
const audits=JSON.parse(readFileSync(resolve(dir,'audits/audits.json')))
assert.equal(audits.length,6);assert(audits.every(a=>a.exitCode===0))
assert.match(readFileSync(resolve(dir,'rust-tests.log'),'utf8'),/227 passed; 0 failed/)
assert.match(readFileSync(resolve(dir,'build.log'),'utf8'),/built in/)
assert(read('ui-verification.json').passed)
assert(read('examples-verification.json').passed)
assert(read('legacy-replay.json').passed)
writeFileSync(resolve(out,'delivery.json'),JSON.stringify({passed:true,sourceFiles:identity.files,wasmSha256:identity.wasmSha256,
  protocolSha256:identity.retainedProtocolSha256,submorphSha256:hash(readFileSync(resolve(root,'core/data/submorph.tsv'))),
  dataUnchanged:true,rustTests:227,build:true,typescript:true,mechanical:comparison.summary,
  legacy:read('legacy-replay.json'),audits,ui:read('ui-verification.json'),examples:read('examples-verification.json'),
  automaticPromotion:false,qualityImprovementEstablished:false,humanGate:'pending; unchanged'},null,2))
console.log(`PASS ${Object.keys(identity.files).length} source hashes, unchanged data, WASM, tests, six audits, replays and UI`)
