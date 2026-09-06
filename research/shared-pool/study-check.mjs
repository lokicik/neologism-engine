import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from '../../web/node_modules/playwright/index.mjs'
import { scoreStudy, validateAnswers } from './study-tools.mjs'
import { hash, protocol, dir } from './harness.mjs'

// Synthetic source: this tests gates, never manufactures human evidence.
const primary = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, brief: `Synthetic ${i}`, left: [`Alpha${i}`], right: [`Beta${i}`] }))
const repeats = primary.slice(0, 4).map((p, i) => ({ id: `r${i}`, brief: p.brief, left: p.right, right: p.left }))
const study = { schema: 'shared-pool-blind-study-v1', pages: [...primary, ...repeats] }
const key = { studySha256: hash(JSON.stringify(study)), protocolSha256: hash(JSON.stringify(protocol)), pages: [
  ...primary.map((p) => ({ id: p.id, experimentalSide: 'left' })),
  ...repeats.map((p, i) => ({ id: p.id, experimentalSide: 'right', repeatOf: primary[i].id })),
] }
const answers = { schema: 'shared-pool-choices-v1', studySha256: key.studySha256, answers: study.pages.map((p, i) => ({ id: p.id, preference: i < 12 ? 'left' : 'right', left: i < 12 ? p.left : [], right: i < 12 ? [] : p.right })) }
assert.equal(scoreStudy(study, key, answers).eligibleForPromotionReview, true)
const allNeither = structuredClone(answers)
allNeither.answers.forEach((a) => { a.preference = 'neither'; a.left = []; a.right = [] })
assert.equal(scoreStudy(study, key, allNeither).eligibleForPromotionReview, false)
assert.equal(scoreStudy(study, key, allNeither).consistentRepeats, 4)
for (const alter of [
  (a) => { a.answers.pop() },
  (a) => { a.studySha256 = 'wrong' },
  (a) => { a.answers[0].left = ['unlisted'] },
  (a) => { a.answers[1] = a.answers[0] },
  (a) => { a.answers[0].preference = 'tie' },
  (a) => { a.answers[0].right = null },
]) {
  const invalid = structuredClone(answers); alter(invalid)
  assert.throws(() => validateAnswers(study, invalid))
}
const inconsistent = structuredClone(answers)
inconsistent.answers.slice(12).forEach((a) => { a.preference = 'left' })
assert.equal(scoreStudy(study, key, inconsistent).gates.consistency, false)
const insufficientWins = structuredClone(answers)
insufficientWins.answers.slice(7, 12).forEach((a) => { a.preference = 'right' })
assert.equal(scoreStudy(study, key, insufficientWins).gates.wins, false)
const noUplift = structuredClone(answers)
noUplift.answers.forEach((a) => { const p = study.pages.find((p) => p.id === a.id); a.left = p.left; a.right = p.right })
assert.equal(scoreStudy(study, key, noUplift).gates.uplift, false)
console.log('PASS synthetic gates, repeat reversal, rejection-only outcomes and invalid exports')

const publicStudy = JSON.parse(readFileSync(resolve(dir, 'artifacts/blind-study.json'), 'utf8'))
const manifest = JSON.parse(readFileSync(resolve(dir, 'artifacts/study-manifest.json'), 'utf8'))
const collector = readFileSync(resolve(dir, 'artifacts/blind-evaluation.html'), 'utf8')
assert.equal(hash(collector), manifest.collectorSha256)
assert.equal(hash(JSON.stringify(publicStudy)), manifest.studySha256)
assert(!collector.includes('experimentalSide') && !collector.includes('repeatOf') && !collector.includes('study-key'))
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1160, height: 940 } })
  const errors = [], requests = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('request', (r) => { if (/^https?:/.test(r.url())) requests.push(r.url()) })
  await page.goto(pathToFileURL(resolve(dir, 'artifacts/blind-evaluation.html')).href)
  assert.equal(await page.locator('#form input[type=radio]:checked').count(), 0)
  await page.locator('#next').click()
  assert.match(await page.locator('#status').textContent(), /Her liste/)
  await page.screenshot({ path: resolve(dir, 'artifacts/evaluator-desktop.png'), fullPage: true })
  // Exercise the real collector using synthetic interactions; do not retain a choice file.
  for (let i = 0; i < 16; i++) {
    await page.locator('input[name=left-none]').check()
    await page.locator('input[name=right-none]').check()
    await page.locator('input[name=preference][value=neither]').check()
    await page.locator('#next').click()
  }
  const downloadPromise = page.waitForEvent('download')
  await page.locator('#export').click()
  const stream = await (await downloadPromise).createReadStream()
  const chunks = []; for await (const chunk of stream) chunks.push(chunk)
  const result = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  validateAnswers(publicStudy, result)
  assert(result.answers.every((a) => a.preference === 'neither' && a.left.length === 0 && a.right.length === 0))
  await page.reload()
  await page.locator('#resume').setInputFiles({ name: 'synthetic-browser-export.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...result, answers: result.answers.slice(0, 3) })) })
  await page.waitForFunction(() => document.querySelector('#progress').textContent.includes('3 yanıt'))
  assert.match(await page.locator('#progress').textContent(), /^4 \/ 16/)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: resolve(dir, 'artifacts/evaluator-mobile.png'), fullPage: true })
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  assert.deepEqual(requests, [])
  assert.deepEqual(errors, [])
  console.log('PASS offline collector completion, key-free export, partial resume, mobile and zero network requests')
} finally { await browser.close() }
writeFileSync(resolve(dir, 'artifacts/study-check.json'), JSON.stringify({ syntheticOnly: true, result: 'pass', collectorSha256: manifest.collectorSha256, humanResponsesCollected: 0 }, null, 2) + '\n')
