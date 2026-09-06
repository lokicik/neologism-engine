import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { writeFileSync } from 'node:fs'
import { chromium } from '../../web/node_modules/playwright/index.mjs'
const out=resolve(import.meta.dirname,'artifacts'),browser=await chromium.launch()
try {
  const page=await browser.newPage({viewport:{width:1200,height:1000}})
  const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto(pathToFileURL(resolve(out,'examples.html')).href)
  assert.equal(await page.locator('.case').count(),12)
  assert.equal(await page.locator('.cut-cases article').count(),5)
  assert.equal(await page.locator('.lost').count(),5)
  assert.match(await page.locator('.cut-cases article').nth(1).innerText(),/sig ← signature · mevcut anlam kaydı var/)
  await page.screenshot({path:resolve(out,'examples-desktop.png')})
  await page.locator('#search').fill('Macheck')
  assert.equal(await page.locator('.candidate:not([hidden])').count(),1)
  assert.match(await page.locator('.candidate:not([hidden])').innerText(),/Kaynak aralığı \[0, 2\)/)
  await page.locator('#search').fill('no_such_name')
  assert.equal(await page.locator('.case:not([hidden])').count(),0)
  await page.locator('#search').fill('')
  await page.setViewportSize({width:390,height:844})
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
  await page.screenshot({path:resolve(out,'examples-mobile.png')})
  assert.deepEqual(errors,[])
  writeFileSync(resolve(out,'examples-verification.json'),JSON.stringify({passed:true,comparisons:12,cutExamples:5,disclosedLostChoices:5,search:true,mobile:true},null,2))
  console.log('PASS 12 comparisons, 5 cut examples, lost-choice disclosure, search and mobile')
}finally{await browser.close()}
