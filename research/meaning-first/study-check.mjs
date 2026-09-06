import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from '../../web/node_modules/playwright/index.mjs'
import { scoreStudy, validateAnswers } from '../shared-pool/study-tools.mjs'
import { hash } from '../shared-pool/harness.mjs'
const out = resolve(import.meta.dirname, 'artifacts')
const read = (f) => JSON.parse(readFileSync(resolve(out, f)))
const study = read('blind-study.json'), key = read('study-key.private.json'), manifest = read('study-manifest.json')
const protocol = JSON.parse(readFileSync(resolve(import.meta.dirname, 'protocol.json')))
const html = readFileSync(resolve(out, 'blind-evaluation.html'), 'utf8')
assert.equal(hash(html), manifest.collectorSha256)
assert(!html.includes('experimentalSide') && !html.includes('repeatOf'))
const positive = { schema: 'shared-pool-choices-v1', studySha256: key.studySha256, answers: study.pages.map((p) => {
  const side = key.pages.find((k) => k.id === p.id).experimentalSide
  return { id: p.id, preference: side, left: side === 'left' ? p.left : [], right: side === 'right' ? p.right : [] }
}) }
assert.equal(scoreStudy(study, key, positive, protocol).eligibleForPromotionReview, true)
const none = structuredClone(positive)
none.answers.forEach((a) => { a.preference = 'neither'; a.left = []; a.right = [] })
assert.equal(scoreStudy(study, key, none, protocol).eligibleForPromotionReview, false)
for (const mutate of [(a) => a.answers.pop(), (a) => { a.studySha256 = 'wrong' }, (a) => { a.answers[0].left = ['not-a-candidate'] }]) {
  const invalid = structuredClone(none); mutate(invalid); assert.throws(() => validateAnswers(study, invalid))
}
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1160, height: 940 } })
  const errors = [], requests = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('request', (r) => { if (/^https?:/.test(r.url())) requests.push(r.url()) })
  await page.goto(pathToFileURL(resolve(out, 'blind-evaluation.html')).href)
  assert.equal(await page.locator('#form input[type=radio]:checked').count(), 0)
  await page.locator('#next').click()
  assert.match(await page.locator('#status').textContent(), /Her liste/)
  await page.screenshot({ path: resolve(out, 'blind-desktop.png'), fullPage: true })
  for (let i = 0; i < 16; i++) {
    await page.locator('input[name=left-none]').check()
    await page.locator('input[name=right-none]').check()
    await page.locator('input[name=preference][value=neither]').check()
    await page.locator('#next').click()
  }
  const download = page.waitForEvent('download'); await page.locator('#export').click()
  const stream = await (await download).createReadStream()
  const chunks = []; for await (const chunk of stream) chunks.push(chunk)
  const result = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  validateAnswers(study, result)
  assert(result.answers.every((a) => a.preference === 'neither'))
  await page.reload()
  await page.locator('#resume').setInputFiles({ name: 'synthetic.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...result, answers: result.answers.slice(0, 3) })) })
  await page.waitForFunction(() => document.querySelector('#progress').textContent.includes('3 yanıt'))
  assert.match(await page.locator('#progress').textContent(), /^4 \/ 16/)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: resolve(out, 'blind-mobile.png'), fullPage: true })
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  assert.deepEqual(requests, []); assert.deepEqual(errors, [])
} finally { await browser.close() }
writeFileSync(resolve(out, 'study-verification.json'), JSON.stringify({ passed: true, syntheticOnly: true, humanResponsesCollected: 0, collectorSha256: manifest.collectorSha256 }, null, 2))
console.log('PASS frozen gates, offline collector, export/resume, mobile, no preselection or network; no human answers collected')
