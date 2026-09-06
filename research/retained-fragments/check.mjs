import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { gzipSync, gunzipSync } from 'node:zlib'
import { withBrowser, identity, hash } from '../shared-pool/harness.mjs'
const dir = import.meta.dirname, out = resolve(dir,'artifacts'), previous = resolve(dir,'../product-brief/artifacts-v3')
mkdirSync(out,{recursive:true})
const replay = process.argv.includes('--replay')
const write = (f,v) => writeFileSync(resolve(out,f),Buffer.isBuffer(v)?v:JSON.stringify(v,null,2)+'\n',{flag:'wx'})
const stable = x => JSON.parse(JSON.stringify(x,(k,v)=>k==='durationMs'?undefined:v))
const oldRows = JSON.parse(readFileSync(resolve(previous,'comparison.json'))).rows
const reviews = JSON.parse(readFileSync(resolve(dir,'../pool-review/review.json'))).rows
if(!replay) {
  const currentIdentity={...identity(),retainedProtocolSha256:hash(readFileSync(resolve(dir,'protocol.json'))),reviewSha256:hash(readFileSync(resolve(dir,'../pool-review/review.json')))}
  if(existsSync(resolve(out,'identity.json'))) assert.deepEqual(currentIdentity,JSON.parse(readFileSync(resolve(out,'identity.json'))),'resume only identical code/data')
  else write('identity.json',currentIdentity)
}
const names = r => r.finalists.map(f=>f.result.name)
let cuts=0, unknown=0, attested=0, whole=0, constraints=0
function validate(r) {
  assert(r.finalists.length<=4)
  assert.equal(new Set(r.finalists.map(f=>f.proposalId.slice(0,3))).size,r.finalists.length)
  assert(r.families.every(f=>f.returned<=24))
  for(const f of r.finalists) {
    assert(r.finalists.filter(a=>a.selectedFrom===f.selectedFrom).length<=2)
    const s=r.proposals.find(p=>p.id===f.proposalId).sources.find(s=>s.family===f.selectedFrom)
    assert(!s.rejection && s.semantic.decision==='qualified')
    assert(!r.config.exclude?.some(n=>n.toLowerCase()===f.proposalId))
    assert(f.proposalId.length>=r.config.min_len && f.proposalId.length<=r.config.max_len)
    constraints++
  }
  for(const p of r.proposals) for(const s of p.sources) {
    const c=s.semantic?.retained_construction
    if(!c) continue
    cuts++
    assert.equal(c.parts.length,2)
    assert.equal(c.parts[0].start,0)
    assert.equal(c.parts[0].end,c.parts[1].start)
    assert.equal(c.parts[1].end,p.id.length)
    assert.equal(c.parts.map(p=>p.fragment).join(''),p.id)
    for(const part of c.parts) {
      assert.equal(part.parent.slice(part.source_start,part.source_end),part.fragment)
      assert.equal(p.id.slice(part.start,part.end),part.fragment)
      if(part.status==='unattested_fragment') unknown++
      else if(part.status==='attested_fragment') { attested++; assert(part.associations.length>0) }
      else { whole++; assert.equal(part.status,'whole_parent'); assert.equal(part.fragment,part.parent) }
    }
  }
}
await withBrowser(async page=>{
  const generate = cfg => page.evaluate(async cfg=>(await import('/src/lib/candidate-pool.ts')).generateCandidatePool(cfg),cfg)
  const rows=[]
  for(const [i,meta] of oldRows.entries()) {
    assert.equal(hash(readFileSync(resolve(previous,meta.traceFile))),meta.sha256)
    const old=JSON.parse(gunzipSync(readFileSync(resolve(previous,meta.traceFile)))).current
    assert.deepEqual(stable(await generate(old.config)),stable(old),'old product-brief replay')
    const current=await generate({...old.config,variant:'retained_pool'})
    assert.deepEqual(stable(current),stable(await generate(current.config)))
    // Only evidence/eligibility changed: candidate material and producer ranks stay fixed.
    const raw = r => r.proposals.map(p=>({id:p.id,sources:p.sources.map(s=>({family:s.family,rank:s.rank,result:s.result}))}))
    assert.deepEqual(stable(raw(current)),stable(raw(old)))
    const next=await generate({...current.config,exclude:names(current).map(n=>n.toUpperCase())})
    validate(current);validate(next)
    const traceFile=`trace-${i}.json.gz`, trace={current,next}
    if(replay) assert.deepEqual(stable(trace),stable(JSON.parse(gunzipSync(readFileSync(resolve(out,traceFile))))))
    else write(traceFile,gzipSync(JSON.stringify(trace)))
    const eligible=r=>r.proposals.filter(p=>p.sources.some(s=>!s.rejection)).map(p=>p.id)
    const review=meta.partition==='regression'?reviews[rows.filter(r=>r.partition==='regression').length]:null
    const lostChoices=review?.picks.filter(n=>!eligible(current).includes(n.toLowerCase()))??[]
    rows.push({partition:meta.partition,pair:meta.pair,side:meta.side,brief:meta.brief,seed:meta.seed,old:names(old),current:names(current),oldEligible:eligible(old).length,currentEligible:eligible(current).length,
      lostChoices,traceFile,sha256:hash(readFileSync(resolve(out,traceFile)))})
    console.log(`PASS ${i+1}/44: ${names(current).join(', ')}${lostChoices.length?' | lost assistant choices: '+lostChoices.join(', '):''}`)
  }
  let pairs=0
  for(const a of rows.filter(r=>r.partition==='paraphrase'&&r.side===0)) {
    const b=rows.find(r=>r.partition==='paraphrase'&&r.side===1&&r.pair===a.pair&&r.seed===a.seed)
    assert.deepEqual(a.current,b.current);pairs++
  }
  for(const description of ['', 'a tool that does not track users', 'a tool that recovers antique furniture']) {
    const r=await generate({style:'big_tech',variant:'retained_pool',seed:13,description})
    if(r.semantic.status!=='ready')assert.equal(r.finalists.length,0)
    assert(!r.semantic.product_frame)
  }
  const base={style:'big_tech',variant:'retained_pool',seed:13,description:'a tool that verifies archive signatures',min_len:12,max_len:12,starts_with:'zzzz'}
  assert.equal((await generate(base)).finalists.length,0)
  const regression=rows.filter(r=>r.partition==='regression')
  const summary={conditions:rows.length,legacyReplays:rows.length,repeats:rows.length,continuations:rows.length,paraphrasePairs:pairs,controls:4,recordedConstructions:cuts,partCounts:{unknown,attested,whole},finalistsChecked:constraints,
    regressionOldEligible:regression.reduce((n,r)=>n+r.oldEligible,0),regressionCurrentEligible:regression.reduce((n,r)=>n+r.currentEligible,0),
    lostAssistantChoices:regression.flatMap(r=>r.lostChoices.map(name=>({brief:r.brief,name}))),qualityImprovementEstablished:false,humanEvaluation:'pending'}
  if(!replay){write('comparison.json',{summary,rows});write('verification.json',summary)}
  console.log(JSON.stringify(summary,null,2))
})
