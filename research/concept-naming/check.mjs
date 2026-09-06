import assert from 'node:assert/strict'
import { readFileSync,writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { withBrowser,hash,root } from '../shared-pool/harness.mjs'
const out=resolve(import.meta.dirname,'artifacts')
const stable=x=>JSON.parse(JSON.stringify(x,(k,v)=>k==='durationMs'?undefined:v))
const canonical=readFileSync(resolve(root,'web/e2e/heldout-cold-quality-audit.mjs'),'utf8')
const briefs=JSON.parse(JSON.stringify(runInNewContext(canonical.match(/const BASE_PROMPTS = (\[[\s\S]*?\n\])/)[1])))
const cases=[['a CLI for database migrations','migrate_data'],['a tool that restores archive entries','recover_state'],['a background job scheduler','schedule_jobs'],['a tool that retries webhook deliveries','retry_delivery'],['a terminal log viewer','inspect_signals'],['a tool that measures memory allocations','measure_behavior'],['a tool that verifies archive signatures','verify_artifacts'],['a configuration validator','validate_config']]
const run=(page,request)=>page.evaluate(async r=>(await import('/src/lib/concept-naming.ts')).generateConceptNames(r),request)
const request=(description,seed=13)=>({target:'product_name',config:{style:'big_tech',variant:'product_names',description,seed,count:10,min_len:4,max_len:12,roots:[],exclude:[]}})
const rows=[],coverage=[],pages=[]
await withBrowser(async page=>{
  const cold=await run(page,request(cases[0][0]))
  assert.equal(await page.evaluate(async()=>(await import('/src/lib/engine.ts')).cratesTaken('tokio')),undefined,'new lane must not load old collision table')
  await page.evaluate(async()=>(await import('/src/lib/engine.ts')).generateNames({style:'big_tech',variant:'reason',seed:13,count:1}))
  assert.deepEqual(stable(await run(page,request(cases[0][0]))),stable(cold),'legacy data loading changes catalog output')
  for(const [brief,job] of cases)for(const seed of [13,67,313]) {
    let req=request(brief,seed),first=await run(page,req)
    assert.equal(first.meaning.status,'ready');assert.equal(first.meaning.job.id,job);assert(first.finalists.length)
    assert.deepEqual(stable(first),stable(await run(page,req)))
    const seen=new Set()
    for(let n=0;n<30;n++) {
      const current=n?await run(page,req):first
      assert(current.finalists.length<=4)
      assert.equal(new Set(current.finalists.map(f=>f.id.slice(0,3))).size,current.finalists.length)
      assert.equal(new Set(current.finalists.map(f=>f.concept_id)).size,current.finalists.length)
      for(const f of current.finalists){assert(!seen.has(f.id));seen.add(f.id);const p=current.candidates.find(p=>p.id===f.id);assert.equal(p.rejection,null);assert(!p.collisions.some(c=>c.source==='brand_corpus'&&c.match));assert(p.pronunciation.syllables>0)}
      pages.push({brief,seed,page:n,finalists:current.finalists.map(f=>f.id),exhausted:current.exhausted})
      if(!current.finalists.length){assert(current.exhausted);break}
      req={...req,data_identity:first.data_identity,config:{...req.config,exclude:[...seen].map(s=>s.toUpperCase())}}
      assert(n<29,'bounded pool did not exhaust')
    }
    rows.push(first)
  }
  for(const brief of briefs) {const r=await run(page,request(brief));coverage.push({brief,status:r.meaning.status,reason:r.meaning.reason,job:r.meaning.job?.id??null,finalists:r.finalists.map(f=>f.id)})}
  for(const brief of ['a log viewer and configuration validator','a tool that does not restore files','a tool that deletes logs']) {
    const r=await run(page,request(brief));assert.equal(r.meaning.status,'ambiguous');assert.equal(r.candidates.length,0)
  }
  const corrected=await run(page,{...request('a log viewer and configuration validator'),interpretation_override:'inspect_signals'})
  assert(corrected.finalists.length);assert.equal(corrected.meaning.interpretation_rule,'user_override')
  const focus=await run(page,{...request('a terminal log viewer'),direction:'evidence'})
  assert(focus.finalists.every(f=>f.direction==='evidence'))
  const tight=await run(page,{...request('a terminal log viewer'),config:{...request('').config,description:'a terminal log viewer',starts_with:'zz'}})
  assert(tight.exhausted);assert(!tight.finalists.length)
})
const data={passed:true,scope:'Development and mechanical checks only',repeatedCases:rows.length,continuationPages:pages.length,
  canonicalSummary:{total:coverage.length,ready:coverage.filter(r=>r.status==='ready').length,nonempty:coverage.filter(r=>r.finalists.length).length},rows,pages,coverage,qualityImprovementEstablished:false}
if(process.argv.includes('--replay'))assert.deepEqual(stable(data),stable(JSON.parse(readFileSync(resolve(out,'mechanical.json')))))
else writeFileSync(resolve(out,'mechanical.json'),JSON.stringify(data,null,2)+'\n')
writeFileSync(resolve(out,'mechanical-verification.json'),JSON.stringify({passed:true,replayed:process.argv.includes('--replay'),sha256:hash(readFileSync(resolve(out,'mechanical.json')))},null,2)+'\n')
console.log(JSON.stringify({repeatedCases:data.repeatedCases,continuationPages:data.continuationPages,canonical:data.canonicalSummary,examples:rows.filter(r=>r.request.config.seed===13).map(r=>({job:r.meaning.job.id,names:r.finalists.map(f=>f.id)}))},null,2))
