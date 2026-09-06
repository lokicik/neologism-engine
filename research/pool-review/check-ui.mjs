import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { writeFileSync } from 'node:fs'
import { chromium } from '../../web/node_modules/playwright/index.mjs'
const out = resolve(import.meta.dirname,'artifacts')
const browser = await chromium.launch()
try {
  const page = await browser.newPage({viewport:{width:1200,height:1000}})
  const errors=[]
  page.on('pageerror',err=>errors.push(err.message))
  await page.goto(pathToFileURL(resolve(out,'index.html')).href)
  assert.equal(await page.locator('.brief').count(),12)
  assert.equal(await page.locator('.candidate').count(),170)
  await page.screenshot({path:resolve(out,'desktop.png')})
  await page.locator('#filter').selectOption('buried')
  assert.equal(await page.locator('.candidate:not([hidden])').count(),4)
  assert.equal(await page.locator('.brief:not([hidden])').count(),4)
  await page.locator('.candidate:not([hidden]) details summary').first().click()
  assert.match(await page.locator('.candidate:not([hidden])').first().innerText(), /mani \+ seal/)
  await page.screenshot({path:resolve(out,'buried.png')})
  await page.locator('#filter').selectOption('all')
  await page.locator('#search').fill('Totinel')
  assert.equal(await page.locator('.candidate:not([hidden])').count(),1)
  await page.locator('.candidate:not([hidden]) details summary').click()
  assert.match(await page.locator('.candidate:not([hidden])').innerText(), /to \+ tinel/)
  await page.locator('#search').fill('no_such_candidate')
  assert.equal(await page.locator('.brief:not([hidden])').count(),0)
  await page.locator('#search').fill('')
  await page.locator('#filter').selectOption('shortlist')
  assert.equal(await page.locator('.candidate:not([hidden])').count(),21)
  await page.setViewportSize({width:390,height:844})
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
  await page.screenshot({path:resolve(out,'mobile.png')})
  assert.deepEqual(errors,[])
  const result={passed:true,briefs:12,classifiedCandidates:170,shortlistChoices:21,buriedChoices:4,checks:['search','category filter','source details','inferred cuts','empty search','mobile overflow','page errors']}
  writeFileSync(resolve(out,'ui-verification.json'),JSON.stringify(result,null,2)+'\n')
  console.log(JSON.stringify(result))
} finally {await browser.close()}
