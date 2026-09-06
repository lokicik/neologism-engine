import assert from 'node:assert/strict'
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { hash } from '../shared-pool/harness.mjs'
const root=resolve(import.meta.dirname,'../..'),out=resolve(import.meta.dirname,'artifacts')
mkdirSync(out,{recursive:true})
const frames=readFileSync(resolve(root,'core/data/product_frames.tsv'),'utf8').split(/\r?\n/).filter(l=>l&&!l.startsWith('#')).map(l=>{const c=l.split('\t');return {id:c[0],anchors:c[4].split(';').map(a=>a.split(':')[0])}})
const words=f=>new Set(readFileSync(resolve(root,f),'utf8').split(/\r?\n/).map(l=>l.trim().toLowerCase()))
const crates=words('research/collision/crate-names.txt'),brands=words('core/data/bigtech.txt')
const previous=resolve(root,'research/product-brief/artifacts-v3')
const comparison=JSON.parse(readFileSync(resolve(previous,'comparison.json'))).rows.filter(r=>r.partition==='regression')
const anchors=new Map(),traces={}
for(const r of comparison) {
  const file=resolve(previous,r.traceFile)
  assert.equal(hash(readFileSync(file)),r.sha256);traces[r.traceFile]=r.sha256
  const run=JSON.parse(gunzipSync(readFileSync(file))).current
  for(const a of run.semantic.product_frame.anchors) {
    const emitted=run.proposals.some(p=>p.id===a.word&&p.sources.some(s=>s.family==='guided_metaphor'))
    const events=run.trace.filter(t=>t.family==='guided_metaphor'&&t.name===a.word)
    const reasons=[...new Set(events.map(e=>e.detail??e.decision))]
    const outcome=emitted?'emitted':reasons.join(', ')
    if(anchors.has(a.word)) assert.equal(anchors.get(a.word).outcome,outcome)
    anchors.set(a.word,{word:a.word,frame:run.semantic.product_frame.id,inCrateSnapshot:crates.has(a.word),inBrandCorpus:brands.has(a.word),outcome})
  }
}
const rows=[...anchors.values()].sort((a,b)=>a.word.localeCompare(b.word))
const summary={wholeAnchors:rows.length,inCrateSnapshot:rows.filter(r=>r.inCrateSnapshot).length,inBrandCorpus:rows.filter(r=>r.inBrandCorpus).length,
  firstCollisionRejection:rows.filter(r=>r.outcome==='frame.filter:collision_snapshot').length,firstPhonotacticRejection:rows.filter(r=>r.outcome==='frame.filter:phonotactics').length,
  emitted:rows.filter(r=>r.outcome==='emitted').length,framesWithoutWholeAnchor:frames.filter(f=>!f.anchors.some(a=>anchors.get(a)?.outcome==='emitted')).length}
assert.deepEqual(summary,{wholeAnchors:24,inCrateSnapshot:23,inBrandCorpus:12,firstCollisionRejection:22,firstPhonotacticRejection:1,emitted:1,framesWithoutWholeAnchor:7})
writeFileSync(resolve(out,'anchors.json'),JSON.stringify({scope:'24 unique editorial anchors across 12 retained Product-brief first pages; not a quality or availability verdict',summary,rows,traces,
  dataHashes:Object.fromEntries(['core/data/product_frames.tsv','research/collision/crate-names.txt','core/data/bigtech.txt'].map(f=>[f,hash(readFileSync(resolve(root,f)))]))},null,2)+'\n')
console.log(JSON.stringify(summary,null,2))
