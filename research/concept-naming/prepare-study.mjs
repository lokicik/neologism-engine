import assert from 'node:assert/strict'
import { readFileSync,writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { hash } from '../shared-pool/harness.mjs'
const dir=import.meta.dirname
const frozen=JSON.parse(readFileSync(resolve(dir,'artifacts/frozen.json')))
const domainBriefs=[
  ['migration',[
    'Rehearse database upgrades against scrubbed production copies.',
    'A recovery utility for restoring configuration snapshots after a failed release.',
    'Move customer data between PostgreSQL stores while retaining an audit trail.',
  ]],
  ['jobs',[
    'A worker pool for scheduled image conversion tasks.',
    'Replay undelivered webhook messages after a remote endpoint returns.',
    'Coordinate queue workers with deadlines and backpressure.',
  ]],
  ['observation',[
    'A trace viewer that groups exceptions from command line tools.',
    'Compare CPU throughput across two versions of a service.',
    'Inspect connection counts during an overnight soak test.',
  ]],
  ['verification',[
    'A command line utility to check signed release manifests before installation.',
    'Validate settings files against rules shared by several services.',
    'A signature verifier for archived build outputs from remote runners.',
  ]],
]
const cases=domainBriefs.flatMap(([domain,briefs])=>briefs.map((brief,index)=>({id:`${domain}-${index+1}`,domain,brief})))
const old=JSON.parse(readFileSync(resolve(dir,'artifacts/mechanical.json')))
const previous=JSON.parse(readFileSync(resolve(dir,'../shared-pool/protocol.json')))
assert(cases.every(c=>![...old.coverage.map(r=>r.brief),...old.rows.map(r=>r.request.config.description),...previous.development,...previous.evaluation].includes(c.brief)))
const protocol={schema:'concept-naming-study-v1',target:'product_name',catalogFreezeSha256:hash(readFileSync(resolve(dir,'artifacts/frozen.json'))),
  scope:'12 new briefs authored after code/catalog freeze, three in each supported domain. These are a bounded prospective comparison, not evidence of general naming quality.',
  seeds:[13],development:[],evaluation:cases.map(c=>c.brief),cases,humanGate:frozen.humanGate,
  pageOrder:[0,1,2,3,4,'repeat:0',5,6,7,'repeat:2',8,9,10,'repeat:4',11,'repeat:6'],
  evaluationRules:'Names are shown before optional explanations. Choose A, B or neither; record absolute usability for both sets. Four concealed repeats reverse the sides. Only complete human answers may establish the gate.'}
writeFileSync(resolve(dir,'protocol.json'),JSON.stringify(protocol,null,2)+'\n',{flag:'wx'})
console.log('Prepared 12 new briefs and a 16-page blinded comparison protocol after catalog freeze.')
