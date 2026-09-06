import assert from 'node:assert/strict'
import { readFileSync,writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from '../../web/node_modules/playwright/index.mjs'
import { evaluate } from './evaluate.mjs'
import { hash } from '../shared-pool/harness.mjs'
const out=resolve(import.meta.dirname,'artifacts'),key=JSON.parse(readFileSync(resolve(out,'blind-key.json'))),study=JSON.parse(readFileSync(resolve(out,'blind-study.json')))
assert.equal(key.studySha256,hash(readFileSync(resolve(out,'blind-study.json'))))
const payload=(wins=8,usable=6,autoUsable=3,consistent=3)=>{
  const primary=key.pages.filter(k=>k.kind==='primary'),states=new Map(primary.map((p,i)=>[p.id,{winner:i<wins?'concept':'auto',usable:i<usable,autoUsable:i<autoUsable}]))
  let repeat=0
  return {schema:'concept-naming-human-v1',evidence_kind:'synthetic',study_sha256:key.studySha256,answers:key.pages.map(k=>{
    const s={...states.get(k.parentId??k.id)}
    if(k.kind==='repeat'&&repeat++>=consistent)s.winner=s.winner==='concept'?'auto':'concept'
    const side=k.experimentalSide,other=side==='left'?'right':'left'
    return {id:k.id,winner:s.winner==='concept'?side:other,[`usable_${side}`]:s.usable?'yes':'no',[`usable_${other}`]:s.autoUsable?'yes':'no'}
  })}
}
const boundary=evaluate(payload(),key);assert(boundary.thresholdsMet);assert.equal(boundary.productionConsiderationEligible,false)
for(const args of [[7,6,3,3],[8,5,2,3],[8,6,4,3],[8,6,3,2]])assert.equal(evaluate(payload(...args),key).thresholdsMet,false)
assert.throws(()=>evaluate({...payload(),answers:[]},key));assert.throws(()=>evaluate({...payload(),study_sha256:'wrong'},key))
const duplicate=payload();duplicate.answers[1]=duplicate.answers[0];assert.throws(()=>evaluate(duplicate,key))
for(const k of key.pages.filter(k=>k.kind==='repeat')){
  const p=study.pages.find(p=>p.id===k.id),parent=study.pages.find(p=>p.id===k.parentId)
  assert.deepEqual(p.left,parent.right);assert.deepEqual(p.right,parent.left);assert.equal(p.brief,parent.brief)
}
const browser=await chromium.launch()
try {
  const page=await browser.newPage({viewport:{width:1200,height:1000}}),errors=[]
  page.on('pageerror',e=>errors.push(String(e)))
  await page.goto(pathToFileURL(resolve(out,'blind-evaluation.html')).href+'?fixture=1')
  assert.equal(await page.locator('input:checked').count(),0)
  assert.equal(await page.getByRole('button',{name:'Download answers'}).isDisabled(),true)
  await page.screenshot({path:resolve(out,'blind-desktop.png'),fullPage:true})
  for(let i=0;i<16;i++) {
    assert.match(await page.locator('#progress').innerText(),new RegExp(`Comparison ${i+1} of 16`))
    await page.locator('input[name="winner"][value="left"]').check()
    await page.locator('input[name="usable_left"][value="yes"]').check()
    await page.locator('input[name="usable_right"][value="no"]').check()
    await page.getByRole('button',{name:i===15?'Save last comparison':'Save and continue'}).click()
  }
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download answers'}).click()
  await(await download).saveAs(resolve(out,'collector-fixture.json'))
  const fixture=JSON.parse(readFileSync(resolve(out,'collector-fixture.json')))
  assert.equal(fixture.evidence_kind,'synthetic');assert.equal(fixture.answers.length,16);assert.equal(evaluate(fixture,key).productionConsiderationEligible,false)
  await page.reload();assert.equal(await page.getByRole('button',{name:'Download answers'}).isDisabled(),false)
  await page.goto(pathToFileURL(resolve(out,'examples.html')).href)
  assert.equal(await page.locator('section').count(),12)
  await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
  await page.screenshot({path:resolve(out,'examples-mobile.png'),fullPage:true})
  assert.deepEqual(errors,[])
}finally{await browser.close()}
writeFileSync(resolve(out,'study-verification.json'),JSON.stringify({passed:true,pages:16,primary:12,repeats:4,syntheticOnly:true,checks:['unselected answers','required fields','16-page navigation','resume','export identity','reversed repeats','all unchanged gate boundaries','incomplete/duplicate/wrong-study rejection','synthetic cannot qualify','examples/mobile']},null,2)+'\n')
console.log('PASS blind collector and frozen human gates (synthetic fixtures only).')
