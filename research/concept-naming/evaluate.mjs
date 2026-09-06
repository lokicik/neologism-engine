import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
export function evaluate(payload,key) {
  assert.equal(payload.schema,'concept-naming-human-v1');assert.equal(payload.study_sha256,key.studySha256)
  assert(['human','synthetic'].includes(payload.evidence_kind));assert.equal(payload.answers.length,key.pages.length,'all 16 answers required')
  const answers=new Map(payload.answers.map(a=>[a.id,a]));assert.equal(answers.size,key.pages.length,'duplicate page answer')
  for(const k of key.pages){const a=answers.get(k.id);assert(a,'missing page');assert(['left','right','neither'].includes(a.winner));assert(['yes','no'].includes(a.usable_left));assert(['yes','no'].includes(a.usable_right));if(a.winner==='neither')assert(a.usable_left==='no'&&a.usable_right==='no','neither contradicts usability')}
  const canonical=k=>{const a=answers.get(k.id),other=k.experimentalSide==='left'?'right':'left';return {winner:a.winner==='neither'?'neither':a.winner===k.experimentalSide?'concept':'auto',conceptUsable:a[`usable_${k.experimentalSide}`]==='yes',autoUsable:a[`usable_${other}`]==='yes'}}
  const primary=key.pages.filter(k=>k.kind==='primary').map(k=>({caseId:k.caseId,...canonical(k)}))
  const repeats=key.pages.filter(k=>k.kind==='repeat').map(k=>{const a=canonical(k),b=canonical(key.pages.find(p=>p.id===k.parentId));return {id:k.id,consistent:a.winner===b.winner,usabilityConsistent:a.conceptUsable===b.conceptUsable&&a.autoUsable===b.autoUsable}})
  const wins=primary.filter(a=>a.winner==='concept').length,usable=primary.filter(a=>a.conceptUsable).length,autoUsable=primary.filter(a=>a.autoUsable).length,consistent=repeats.filter(a=>a.consistent).length,g=key.humanGate
  const thresholdsMet=wins>=g.minimumWins&&usable>=g.minimumUsableBriefs&&usable-autoUsable>=g.minimumUsableBriefUplift&&consistent>=g.minimumConsistentRepeats
  return {evidenceKind:payload.evidence_kind,wins,usableBriefs:usable,autoUsableBriefs:autoUsable,usableBriefUplift:usable-autoUsable,consistentRepeats:consistent,thresholdsMet,
    productionConsiderationEligible:payload.evidence_kind==='human'&&thresholdsMet,primary,repeats}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  assert(process.argv[2],'usage: node research/concept-naming/evaluate.mjs answers.json')
  console.log(JSON.stringify(evaluate(JSON.parse(readFileSync(resolve(process.argv[2]))),JSON.parse(readFileSync(resolve(import.meta.dirname,'artifacts/blind-key.json')))),null,2))
}
