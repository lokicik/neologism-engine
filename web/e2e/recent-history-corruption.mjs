// Phase 160 browser contract: corrupt recent-name history cannot block Create;
// a normal Generate repairs it while valid history remains intact and capped.
// Run after `npm run build`: node e2e/recent-history-corruption.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = 4219
const APP_URL = `http://localhost:${PORT}`
const E2E_DIR = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = join(E2E_DIR, '..')
const viteCli = join(WEB_DIR, 'node_modules', 'vite', 'bin', 'vite.js')
const EXPECTED_CHECKS = 24

const server = spawn(process.execPath, [viteCli, 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: WEB_DIR,
  stdio: 'pipe',
})
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('vite preview did not start')), 20000)
  server.stdout.on('data', (data) => {
    if (data.toString().includes(String(PORT))) {
      clearTimeout(timer)
      resolve()
    }
  })
  server.on('exit', () => reject(new Error('vite preview exited early')))
})

const browser = await chromium.launch()
let checks = 0
let failures = 0
const external = []
const check = (ok, label) => {
  checks++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) failures++
}

async function pageFor(rawRecent) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await context.addInitScript(({ raw }) => {
    localStorage.setItem('neologism:visited', '1')
    localStorage.setItem('neologism:recent', raw)
    localStorage.setItem('phase160:sentinel', 'unchanged')
  }, { raw: rawRecent })
  await context.route('https://**/*', async (route) => {
    external.push(route.request().url())
    await route.abort()
  })
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.goto(APP_URL)
  return { context, page, pageErrors }
}

async function generateAndSettle(page) {
  await page.getByRole('button', { name: 'Generate', exact: true }).click()
  await page.waitForFunction(() => (
    document.querySelectorAll('.results-grid .name-card').length >= 10
      || Boolean(document.querySelector('.error-banner'))
  ))
}

try {
  const objectRaw = JSON.stringify({ stale: ['Noma'] })
  const objectRun = await pageFor(objectRaw)
  check(
    await objectRun.page.evaluate(() => localStorage.getItem('neologism:recent')) === objectRaw,
    'corrupt object history is not destructively rewritten on read',
  )
  await generateAndSettle(objectRun.page)
  const objectCards = objectRun.page.locator('.results-grid .name-card')
  const objectRecent = await objectRun.page.evaluate(() => JSON.parse(localStorage.getItem('neologism:recent')))
  check(await objectCards.count() === 10, 'corrupt object history cannot block a full Create page')
  check(
    Array.isArray(objectRecent)
      && objectRecent.length === 10
      && objectRecent.every((name) => typeof name === 'string' && name.length > 0),
    'normal generation repairs corrupt object history with the ten shown names',
  )
  check(!(await objectRun.page.locator('.error-banner').isVisible()), 'object recovery exposes no generation error')
  check(objectRun.pageErrors.length === 0, `object recovery produces no page error (${objectRun.pageErrors.join(' | ')})`)
  await objectRun.context.close()

  const mixedRaw = JSON.stringify(['Noma', 17, null])
  const mixedRun = await pageFor(mixedRaw)
  check(
    await mixedRun.page.evaluate(() => localStorage.getItem('neologism:recent')) === mixedRaw,
    'mixed history is not destructively rewritten on read',
  )
  await generateAndSettle(mixedRun.page)
  const mixedRecent = await mixedRun.page.evaluate(() => JSON.parse(localStorage.getItem('neologism:recent')))
  check(await mixedRun.page.locator('.results-grid .name-card').count() === 10, 'mixed history cannot block a full Create page')
  check(
    Array.isArray(mixedRecent)
      && mixedRecent.length === 10
      && mixedRecent.every((name) => typeof name === 'string'),
    'normal generation replaces mixed history with valid shown names',
  )
  check(mixedRun.pageErrors.length === 0, `mixed-history recovery produces no page error (${mixedRun.pageErrors.join(' | ')})`)
  await mixedRun.context.close()

  const validNames = ['AlphaLegacy', 'BetaLegacy']
  const validRaw = JSON.stringify(validNames)
  const validRun = await pageFor(validRaw)
  await generateAndSettle(validRun.page)
  const validRecent = await validRun.page.evaluate(() => JSON.parse(localStorage.getItem('neologism:recent')))
  check(await validRun.page.locator('.results-grid .name-card').count() === 10, 'valid history still allows a full Create page')
  check(
    validRecent.length === 12
      && validRecent[0] === validNames[0]
      && validRecent[1] === validNames[1]
      && validRecent.every((name) => typeof name === 'string'),
    'valid existing history is preserved before the ten newly shown names',
  )
  check(
    await validRun.page.evaluate(() => localStorage.getItem('phase160:sentinel')) === 'unchanged',
    'recent-history recovery leaves unrelated local storage unchanged',
  )
  check(validRun.pageErrors.length === 0, `valid history produces no page error (${validRun.pageErrors.join(' | ')})`)
  await validRun.context.close()

  const longNames = Array.from(
    { length: 20_005 },
    (_, index) => `Seen${String(index).padStart(5, '0')}`,
  )
  const longRun = await pageFor(JSON.stringify(longNames))
  await generateAndSettle(longRun.page)
  const longRecent = await longRun.page.evaluate(() => JSON.parse(localStorage.getItem('neologism:recent')))
  const shownNames = await longRun.page.locator('.results-grid .name-text').allTextContents()
  check(await longRun.page.locator('.results-grid .name-card').count() === 10, 'oversized valid history still allows a full Create page')
  check(longRecent.length === 20_000, 'recent history remains capped at twenty thousand names after generation')
  check(longRecent[0] === longNames[15], 'history cap retains the newest pre-existing tail before appending shown names')
  check(
    JSON.stringify(longRecent.slice(-10)) === JSON.stringify(shownNames),
    'the capped history ends with the ten names shown on the current page',
  )
  await longRun.context.close()

  const failedWriteContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await failedWriteContext.addInitScript(() => {
    localStorage.setItem('neologism:visited', '1')
    localStorage.setItem('neologism:recent', JSON.stringify(['DurableLegacy']))
    window.__phase208RejectRecent = true
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function setItem(key, value) {
      if (key === 'neologism:recent' && window.__phase208RejectRecent) {
        throw new DOMException('quota', 'QuotaExceededError')
      }
      return original.call(this, key, value)
    }
  })
  await failedWriteContext.route('https://**/*', async (route) => {
    external.push(route.request().url())
    await route.abort()
  })
  const failedWritePage = await failedWriteContext.newPage()
  const failedWriteErrors = []
  failedWritePage.on('pageerror', (error) => failedWriteErrors.push(error.message))
  await failedWritePage.goto(APP_URL)
  await generateAndSettle(failedWritePage)
  const firstFailedNames = await failedWritePage.locator('.results-grid .name-text').allTextContents()
  check(firstFailedNames.length === 10, 'a rejected recent-history write does not hide the generated page')
  check(
    await failedWritePage.evaluate(() => localStorage.getItem('neologism:recent')) === JSON.stringify(['DurableLegacy']),
    'a rejected write cannot be mistaken for durable recent-history persistence',
  )
  check(
    await failedWritePage.locator('.error-banner').getAttribute('role') === 'alert'
      && ((await failedWritePage.locator('.error-banner').textContent()) ?? '').includes('seen-name history'),
    'the persistence failure is visible and names its reload consequence',
  )

  await failedWritePage.evaluate(() => { window.__phase208RejectRecent = false })
  await generateAndSettle(failedWritePage)
  const recoveredNames = await failedWritePage.locator('.results-grid .name-text').allTextContents()
  const recoveredRecent = await failedWritePage.evaluate(() => JSON.parse(localStorage.getItem('neologism:recent')))
  check(
    recoveredRecent.length === 21
      && recoveredRecent[0] === 'DurableLegacy'
      && JSON.stringify(recoveredRecent.slice(1, 11)) === JSON.stringify(firstFailedNames)
      && JSON.stringify(recoveredRecent.slice(-10)) === JSON.stringify(recoveredNames),
    'the next accepted write durably recovers both the failed and current visible batches',
  )
  check(!(await failedWritePage.locator('.error-banner').isVisible()), 'successful persistence clears the stale warning')
  check(failedWriteErrors.length === 0, `recent-write recovery produces no page error (${failedWriteErrors.join(' | ')})`)
  await failedWriteContext.close()

  check(external.length === 0, `recent-history recovery produces zero external HTTPS requests (${external.join(' | ')})`)
} finally {
  await browser.close()
  server.kill()
}

if (checks !== EXPECTED_CHECKS) {
  console.error(`FAIL  expected ${EXPECTED_CHECKS} checks, executed ${checks}`)
  process.exit(1)
}
if (failures > 0) process.exit(1)
console.log(`\nrecent history corruption: all checks passed (${checks}/${EXPECTED_CHECKS})`)
