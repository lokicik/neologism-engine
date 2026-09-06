import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { hash, root } from '../shared-pool/harness.mjs'
const out = resolve(import.meta.dirname, 'artifacts-v2')
const read = (f) => JSON.parse(readFileSync(resolve(out, f)))
const identity = read('identity.json')
for (const [f, sha] of Object.entries(identity.files)) assert.equal(hash(readFileSync(resolve(root, f))), sha, `changed after final capture: ${f}`)
assert.equal(hash(readFileSync(resolve(root, 'web/src/wasm/neologism_wasm_bg.wasm'))), identity.wasmSha256)
assert.equal(hash(readFileSync(resolve(import.meta.dirname, 'protocol.json'))), identity.protocolSha256)
const first = JSON.parse(readFileSync(resolve(import.meta.dirname, 'artifacts/identity.json')))
for (const f of ['core/data/concept_bridges.tsv', 'core/data/story_kb.tsv']) assert.equal(identity.files[f], first.files[f], `pre-existing user data changed: ${f}`)
const comparison = read('comparison.json')
for (const r of comparison.rows) assert.equal(hash(readFileSync(resolve(out, r.traceFile))), r.sha256)
const audits = JSON.parse(readFileSync(resolve(import.meta.dirname, 'artifacts/audits.json')))
assert(audits.length === 6 && audits.every((r) => r.exitCode === 0))
assert.match(readFileSync(resolve(import.meta.dirname, 'rust-tests.log'), 'utf8'), /221 passed; 0 failed/)
const legacy = readFileSync(resolve(import.meta.dirname, 'legacy-replay.log'), 'utf8')
for (const text of ['48 original Auto', '48 retained shared-pool', '33 retained brief-intent', '12 development conditions', '18 evaluation conditions']) assert(legacy.includes(`PASS ${text}`))
assert(read('ui-verification.json').passed && read('study-verification.json').passed)
assert.equal(read('study-verification.json').humanResponsesCollected, 0)
assert.equal(read('analysis.json').summary.qualityImprovementEstablished, false)
const files = ['comparison.json', 'analysis.json', 'examples.html', 'blind-evaluation.html', 'ui-verification.json', 'verification.json', 'study-verification.json', 'finalists.png', 'mobile-finalist.png']
const delivery = { passed: true, sourceFilesChecked: Object.keys(identity.files).length, wasmSha256: identity.wasmSha256,
  preExistingUserDataPreserved: true, rustTests: 221, legacyReplays: { auto: 48, shared: 48, intent: 33, operationObject: 30, meaningFirst: 54 },
  auditScope: 'six unchanged checks passed on revision 1; legacy replay, TypeScript/build and UI validated revision 2',
  summary: read('analysis.json').summary, artifacts: Object.fromEntries(files.map((f) => [f, hash(readFileSync(resolve(out, f)))])) }
writeFileSync(resolve(out, 'delivery.json'), JSON.stringify(delivery, null, 2))
console.log(JSON.stringify({ passed: true, sourceFilesChecked: delivery.sourceFilesChecked, wasmSha256: delivery.wasmSha256, preExistingUserDataPreserved: true }))
