import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { hash, root } from '../shared-pool/harness.mjs'
const out = resolve(import.meta.dirname, 'artifacts-v3')
const read = (f) => JSON.parse(readFileSync(resolve(out, f)))
const identity = read('identity.json')
const currentFiles = Object.fromEntries(Object.keys(identity.files).map((f) => [f, hash(readFileSync(resolve(root, f)))]))
const changed = Object.keys(currentFiles).filter((f) => currentFiles[f] !== identity.files[f])
assert.deepEqual(changed, ['web/src/components/CandidateLab.tsx'], 'only the final explanation-label fix may follow the engine capture')
assert.equal(hash(readFileSync(resolve(root, 'web/src/wasm/neologism_wasm_bg.wasm'))), identity.wasmSha256)
assert.equal(hash(readFileSync(resolve(import.meta.dirname, 'protocol.json'))), identity.protocolSha256)
const initial = JSON.parse(readFileSync(resolve(import.meta.dirname, 'artifacts/identity.json')))
for (const f of ['core/data/concept_bridges.tsv', 'core/data/story_kb.tsv', 'core/data/product_frames.tsv']) assert.equal(initial.files[f], currentFiles[f], `existing material changed: ${f}`)
for (const r of read('comparison.json').rows) assert.equal(hash(readFileSync(resolve(out, r.traceFile))), r.sha256)
assert.match(readFileSync(resolve(import.meta.dirname, 'rust-tests-final.log'), 'utf8'), /225 passed; 0 failed/)
assert(read('audits.json').length === 6 && read('audits.json').every((r) => r.exitCode === 0))
assert(read('ui-verification.json').passed && read('legacy-replay.json').passed)
assert.equal(read('analysis.json').summary.identicalFinalists, 16)
assert.equal(read('analysis.json').summary.qualityImprovementEstablished, false)
const delivery = { passed: true, sourceFiles: currentFiles, engineCaptureWasmSha256: identity.wasmSha256,
  postCaptureUiOnlyChange: changed, preservedExistingData: true, rustTests: 225, summary: read('analysis.json').summary,
  legacyReplay: read('legacy-replay.json'), audits: read('audits.json'), ui: read('ui-verification.json'),
  examplesSha256: hash(readFileSync(resolve(out, 'examples.html'))), reportSha256: hash(readFileSync(resolve(import.meta.dirname, 'REPORT.md'))) }
writeFileSync(resolve(out, 'delivery.json'), JSON.stringify(delivery, null, 2))
console.log(JSON.stringify({ passed: true, sourceFiles: Object.keys(currentFiles).length, preservedExistingData: true, rustTests: 225, postCaptureUiOnlyChange: changed }))
