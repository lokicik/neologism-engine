import assert from 'node:assert/strict'
import { readFileSync,writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { identity,hash,root } from '../shared-pool/harness.mjs'
const dir=import.meta.dirname
for(const file of ['mechanical-verification.json','ui-verification.json','legacy-replay.json'])assert(JSON.parse(readFileSync(resolve(dir,'artifacts',file))).passed)
assert(JSON.parse(readFileSync(resolve(dir,'audits/audits.json'))).every(r=>r.exitCode===0))
const current=identity()
const extra=['research/concept-naming/catalog-source.mjs','research/concept-naming/compile-data.mjs','web/public/third-party-notices.txt']
const frozen={schema:'concept-naming-freeze-v1',scope:'Four developer domains; product display names; no human quality pass',head:current.head,
  files:{...current.files,...Object.fromEntries(extra.map(f=>[f,hash(readFileSync(resolve(root,f)))]))},wasmSha256:current.wasmSha256,
  catalogIdentity:JSON.parse(readFileSync(resolve(root,'core/data/concept_naming.json'))).identity,
  humanGate:{primaryPages:12,repeatPages:4,minimumWins:8,minimumUsableBriefs:6,minimumUsableBriefUplift:3,minimumConsistentRepeats:3}}
writeFileSync(resolve(dir,'artifacts/frozen.json'),JSON.stringify(frozen,null,2)+'\n',{flag:'wx'})
console.log(`Frozen ${Object.keys(frozen.files).length} code/data identities before new evaluation briefs.`)
