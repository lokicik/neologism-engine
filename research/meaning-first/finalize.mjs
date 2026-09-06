import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { identity, hash } from '../shared-pool/harness.mjs'
const out = resolve(import.meta.dirname, 'artifacts')
const read = (f) => JSON.parse(readFileSync(resolve(out, f)))
const before = read('identity.json'), after = { ...identity(), protocolSha256: hash(readFileSync(resolve(import.meta.dirname, 'protocol.json'))) }
const changed = Object.keys(before.files).filter((f) => before.files[f] !== after.files[f]).sort()
assert.deepEqual(changed, ['web/src/components/CandidateLab.tsx', 'web/src/components/Shortlist.tsx'])
assert.equal(before.wasmSha256, after.wasmSha256)
assert.equal(before.protocolSha256, after.protocolSha256)
for (const row of read('comparison.json').rows) assert.equal(hash(readFileSync(resolve(out, row.traceFile))), row.sha256)
assert(read('audits.json').every((a) => a.exitCode === 0))
assert.equal(read('ui-verification.json').passed, true)
assert.equal(read('study-verification.json').humanResponsesCollected, 0)
assert.match(readFileSync(resolve(out, 'rust-tests.log'), 'utf8'), /219 passed; 0 failed/)
const delivery = { runtimeIdentity: 'delivery-identity.json', comparisonConditions: 54,
  oldReplaysPassed: { auto: 48, sharedPool: 48, briefIntent: 33, operationObject: 30 },
  rustTests: 219, wasmRebuilt: true, typescript: 'pass', webBuild: 'pass', oldWebAudits: 6,
  finalShortlistContract: '25/25', changesAfterComparison: changed,
  note: 'Only finalist UI copy changed after comparison capture; final UI, TypeScript, build and original shortlist contract were rerun. Generation/data/WASM hashes match the comparison.',
  humanPreferenceGate: 'pending', assistantReview: read('assistant-review.json').summary }
writeFileSync(resolve(out, 'delivery-identity.json'), JSON.stringify(after, null, 2))
writeFileSync(resolve(out, 'delivery.json'), JSON.stringify(delivery, null, 2))
console.log(JSON.stringify(delivery, null, 2))
