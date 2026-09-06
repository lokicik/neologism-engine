import assert from 'node:assert/strict'
import { readFileSync,writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { hash,root } from '../shared-pool/harness.mjs'
const dir=import.meta.dirname,out=resolve(dir,'artifacts')
const protocol=JSON.parse(readFileSync(resolve(dir,'protocol.json'))),comparison=JSON.parse(readFileSync(resolve(out,'comparison.json')))
const autoText=JSON.parse(readFileSync(resolve(out,'auto-presentation.json')))
const words=file=>new Set(readFileSync(resolve(root,file),'utf8').split(/\r?\n/).map(s=>s.trim().toLowerCase()))
const brands=words('core/data/bigtech.txt'),crates=words('research/collision/crate-names.txt')
const collision=name=>brands.has(name.toLowerCase())?'Known brand snapshot match.':crates.has(name.toLowerCase())?'Crate snapshot match; product-name availability unverified.':'No local snapshot match; availability unverified.'
const paired=comparison.rows.map(row=>({id:row.id,brief:row.brief,
  auto:row.auto.finalists.map(r=>({name:r.name,explanation:autoText[`${row.id}:${r.name}`],collision:collision(r.name)})),
  concept:row.concept.finalists.map(f=>{const p=row.concept.candidates.find(p=>p.id===f.id),s=p.sources.find(s=>s.concept_id===f.concept_id);return {name:p.result.name,explanation:`${s.sense}. ${s.benefit}.`,collision:collision(p.result.name)}})}))
const pages=[],keys=[],primaryIds={}
for(const [index,item] of protocol.pageOrder.entries()) {
  const repeat=typeof item==='string',source=repeat?Number(item.split(':')[1]):item,row=paired[source]
  const experimentLeft=repeat?source%2!==0:source%2===0
  const id=`p${String(index+1).padStart(2,'0')}`
  pages.push({id,brief:row.brief,left:experimentLeft?row.concept:row.auto,right:experimentLeft?row.auto:row.concept})
  keys.push({id,caseId:row.id,kind:repeat?'repeat':'primary',parentId:repeat?primaryIds[source]:null,experimentalSide:experimentLeft?'left':'right'})
  if(!repeat)primaryIds[source]=id
}
assert.equal(keys.filter(k=>k.kind==='primary').length,12);assert.equal(keys.filter(k=>k.kind==='repeat').length,4)
assert(keys.filter(k=>k.kind==='repeat').every(k=>k.parentId))
const study={schema:'concept-naming-blind-v1',pages},studyText=JSON.stringify(study,null,2)+'\n',studySha=hash(studyText)
writeFileSync(resolve(out,'blind-study.json'),studyText)
writeFileSync(resolve(out,'blind-key.json'),JSON.stringify({schema:'concept-naming-blind-key-v1',studySha256:studySha,protocolSha256:comparison.protocolSha256,comparisonSha256:hash(readFileSync(resolve(out,'comparison.json'))),humanGate:protocol.humanGate,pages:keys},null,2)+'\n')
const template=readFileSync(resolve(dir,'blind-template.html'),'utf8')
writeFileSync(resolve(out,'blind-evaluation.html'),template.replace('__STUDY__',JSON.stringify(study).replace(/</g,'\\u003c')).replace('__STUDY_SHA__',studySha))
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const cells=items=>items.map(n=>`<div class="name">${escape(n.name)}</div><p>${escape(n.explanation)}</p><small>${escape(n.collision)}</small>`).join('')||'<p>No finalists.</p>'
const style=template.match(/<style>([\s\S]*?)<\/style>/)[1]
writeFileSync(resolve(out,'examples.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Product names: old and new</title><style>${style}section{margin:42px 0}article p{font-size:14px}</style><body><h1>Product names: old and new</h1><p>12 new developer briefs after catalog freeze. These are examples, not human preference results. Auto keeps its current three-finalist behavior; Product names shows up to four. Repeated names across briefs expose the limits of the small catalog.</p><p><a href="blind-evaluation.html">Open the 16-page blind comparison</a> · <a href="../REPORT.md">Read the report</a></p>${paired.map(row=>`<section><h2>${escape(row.brief)}</h2><div class="sets"><article><h3>Current Auto</h3>${cells(row.auto)}</article><article><h3>Product names · Lab</h3>${cells(row.concept)}</article></div></section>`).join('')}</body></html>`)
console.log(`Rendered ${paired.length} example pairs and ${pages.length} blinded pages; no human answers generated.`)
