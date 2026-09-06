import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { scoreStudy } from '../shared-pool/study-tools.mjs'
import { hash } from '../shared-pool/harness.mjs'
const out = resolve(import.meta.dirname, 'artifacts')
const read = (f) => JSON.parse(readFileSync(resolve(out, f)))
const protocol = JSON.parse(readFileSync(resolve(import.meta.dirname, 'protocol.json')))
const key = read('study-key.private.json'), study = read('blind-study.json'), manifest = read('study-manifest.json')
assert.equal(hash(JSON.stringify(key)), manifest.keySha256)
assert.equal(hash(readFileSync(resolve(out, 'comparison.json'))), key.comparisonSha256)
if (!process.argv[2]) throw Error('Pass the genuine completed human response export path')
console.log(JSON.stringify(scoreStudy(study, key, JSON.parse(readFileSync(resolve(process.argv[2]))), protocol), null, 2))
