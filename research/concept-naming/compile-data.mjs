import assert from 'node:assert/strict'
import { readFileSync,writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { domains,jobs,entries } from './catalog-source.mjs'
const root=resolve(import.meta.dirname,'../..')
const hash=s=>createHash('sha256').update(s).digest('hex')
const paths=['research/concept-naming/catalog-source.mjs','core/data/pron_lexicon.tsv','core/data/bigtech.txt','research/collision/crate-names.txt','research/cmudict/cmudict.dict']
const data=Object.fromEntries(paths.map(p=>[p,readFileSync(resolve(root,p),'utf8')]))
const sources=Object.fromEntries(paths.map(p=>[p,{sha256:hash(data[p]),snapshot_date:null}]))
const words=p=>new Set(data[p].split(/\r?\n/).map(s=>s.trim().toLowerCase()))
const brands=words(paths[2]),crates=words(paths[3])
const pron=new Map(data[paths[1]].trim().split(/\r?\n/).map(s=>s.split('\t')))
const fullPron=new Map()
for(const line of data[paths[4]].split(/\r?\n/)) {
  const [word,...phones]=line.split('#')[0].trim().split(/\s+/)
  if(/^[a-z]+$/.test(word)&&phones.length&&!fullPron.has(word))fullPron.set(word,phones.map(p=>p.replace(/\d/g,'')).join(' '))
}
const ids=new Set(),domainsById=new Map(domains.map(d=>[d.id,d]))
const compiled=entries.map(entry=>{
  assert(!ids.has(entry.id));ids.add(entry.id)
  assert(domainsById.get(entry.domain)?.directions.some(d=>d.id===entry.direction))
  assert(entry.sense&&entry.source&&entry.suitable.length&&entry.incompatible.length)
  assert(entry.forms.length>0&&entry.forms.length<=2)
  return {...entry,forms:entry.forms.map(form=>{
    assert(/^[A-Za-z]+$/.test(form.name))
    assert.equal(form.components.join(''),form.name.toLowerCase())
    const parts=form.components.map(word=>({word,phones:fullPron.get(word)??pron.get(word)??null,source_sha256:sources[fullPron.has(word)?paths[4]:paths[1]].sha256}))
    const phones=parts.flatMap(p=>p.phones?.split(' ')??[])
    const complete=parts.every(p=>p.phones)
    return {...form,pronunciation:{source:complete?(parts.length===1?'dictionary':'dictionary_components'):'missing',components:parts,
      syllables:complete?phones.filter(p=>/^(AA|AE|AH|AO|AW|AY|EH|ER|EY|IH|IY|OW|OY|UH|UW)$/.test(p)).length:null},
      collisions:[{source:'brand_corpus',sha256:sources[paths[2]].sha256,snapshot_date:null,match:brands.has(form.name.toLowerCase())},
        {source:'crate_snapshot',sha256:sources[paths[3]].sha256,snapshot_date:null,match:crates.has(form.name.toLowerCase())}]}
  })}
})
for(const d of domains)assert(compiled.filter(e=>e.domain===d.id).length<=24)
for(const j of jobs)assert(j.directions.every(id=>domainsById.get(j.domain)?.directions.some(d=>d.id===id)))
const payload={schema:'concept-catalog-v1',target:'product_name',sources,domains,jobs,entries:compiled}
const result=JSON.stringify({...payload,identity:hash(JSON.stringify(payload))},null,2)+'\n'
const file=resolve(root,'core/data/concept_naming.json')
if(process.argv.includes('--check'))assert.equal(readFileSync(file,'utf8'),result,'compiled catalog differs')
else writeFileSync(file,result)
console.log(JSON.stringify({entries:entries.length,forms:compiled.flatMap(e=>e.forms).length,bytes:Buffer.byteLength(result),missingPronunciation:compiled.flatMap(e=>e.forms).filter(f=>f.pronunciation.source==='missing').map(f=>f.name),mode:process.argv.includes('--check')?'verified':'compiled'}))
