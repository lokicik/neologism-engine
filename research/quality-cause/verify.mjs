import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
const root = resolve(import.meta.dirname, '../..')
const out = resolve(import.meta.dirname, 'artifacts')
const bytes = (name) => readFileSync(resolve(out, name))
const read = (name) => JSON.parse(bytes(name))
const hash = (data) => createHash('sha256').update(data).digest('hex')
assert.equal(hash(bytes('interventions-v2.json')), hash(bytes('interventions-repeat.json')), '234 native diagnostic runs repeat byte-for-byte')
const start = read('identity.json')
const end = read('analysis-identity.json')
assert.equal(start.head, end.head)
assert.equal(start.wasmSha256, end.wasmSha256)
const changed = Object.keys(start.files).filter((f) => start.files[f] !== end.files[f])
assert.deepEqual(changed, ['core/examples/quality_cause_probe.rs'], 'Only research example changed during investigation')
const currentRuntimeFiles = Object.keys(end.files).filter((f) => !f.startsWith('core/examples/'))
for (const f of currentRuntimeFiles) assert.equal(hash(readFileSync(resolve(root, f))), end.files[f], `Unchanged: ${f}`)
const a = read('analysis.json')
assert.equal(a.selection.length, 6)
assert.equal(a.selection.reduce((n, s) => n + s.rotations.length, 0), 1536)
assert.equal(a.reasonComparisons.length, 18)
assert.equal(a.reasonComparisons.filter((r) => r.arms.find((a) => a.arm === 'reverse_term_order').identicalNames).length, 18)
const result = {
  nativeRuns: 234, byteIdenticalRepeat: true, originalInterventionsReplayed: 162,
  frozenPoolsReplayed: 6, fixedPoolSelections: 1536, reasonTermOrderUnchanged: '18/18',
  runtimeAndDataFilesUnchanged: currentRuntimeFiles.length, wasmUnchanged: true,
  scope: 'Research diagnostics only. Prior full-product verification is recorded separately in operation-object; not re-claimed as a fresh test run here.',
  hashes: Object.fromEntries(['configs.json', 'interventions-v2.json', 'interventions-repeat.json', 'analysis.json'].map((f) => [f, hash(bytes(f))])),
}
writeFileSync(resolve(out, 'verification.json'), JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result, null, 2))
