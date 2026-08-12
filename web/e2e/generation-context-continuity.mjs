// Phase 206 browser contract: infinite scroll continues the project that owns
// the visible page even when the next explicit brief is being edited.
// Run after `npm run build`: node e2e/generation-context-continuity.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = 4227
const APP_URL = `http://localhost:${PORT}`
const E2E_DIR = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = join(E2E_DIR, '..')
const viteCli = join(WEB_DIR, 'node_modules', 'vite', 'bin', 'vite.js')
const EXPECTED_CHECKS = 7
const FIRST_BRIEF = 'a comet calendar for astronomers'
const NEXT_BRIEF = 'a bakery inventory manager'

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
const pageErrors = []
const check = (ok, label) => {
  checks++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) failures++
}

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await context.addInitScript(() => localStorage.setItem('neologism:visited', '1'))
  await context.route('https://**/*', async (route) => {
    external.push(route.request().url())
    await route.abort('blockedbyclient')
  })
  const page = await context.newPage()
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.goto(APP_URL)

  const brief = page.locator('.command-input')
  const generate = page.locator('.command-go')
  const cards = page.locator('.results-grid .name-card')
  await brief.fill(FIRST_BRIEF)
  await generate.click()
  await page.waitForFunction(() => document.querySelectorAll('.results-grid .name-card').length === 10)
  await page.waitForFunction(() => document.querySelector('.command-go')?.getAttribute('aria-busy') === 'false')
  const firstNames = await page.locator('.results-grid .name-text').allTextContents()
  check(firstNames.length === 10, 'the first explicit brief owns one full ten-card page')

  await cards.first().locator('.star-btn').click()
  const firstFavorite = await page.evaluate(() => JSON.parse(localStorage.getItem('neologism:favorites') ?? '[]')[0])
  check(
    firstFavorite?.tasteContext?.description === FIRST_BRIEF,
    'the initial visible card keeps the first brief provenance',
  )

  await brief.fill(NEXT_BRIEF)
  await page.waitForTimeout(100)
  check(
    JSON.stringify(await page.locator('.results-grid .name-text').allTextContents()) === JSON.stringify(firstNames),
    'editing the next brief does not reinterpret or replace the visible page',
  )

  await page.locator('.scroll-sentinel').scrollIntoViewIfNeeded()
  await page.waitForFunction(() => document.querySelectorAll('.results-grid .name-card').length > 10, null, { timeout: 20000 })
  await page.waitForFunction(() => document.querySelector('.command-go')?.getAttribute('aria-busy') === 'false')
  check(await cards.count() > 10, 'infinite scroll appends another visible batch')

  await cards.nth(10).locator('.star-btn').click()
  const appendedFavorite = await page.evaluate(() => JSON.parse(localStorage.getItem('neologism:favorites') ?? '[]')[1])
  check(
    appendedFavorite?.tasteContext?.description === FIRST_BRIEF,
    'the appended batch continues the visible page brief instead of the edited next brief',
  )
  check(
    appendedFavorite?.tasteContext?.id === firstFavorite?.tasteContext?.id,
    'initial and appended feedback remain in one project evidence context',
  )

  check(
    external.length === 0 && pageErrors.length === 0,
    `context continuity adds no external HTTPS requests or page errors (${JSON.stringify({ external, pageErrors })})`,
  )
} finally {
  await browser.close()
  server.kill()
}

if (checks !== EXPECTED_CHECKS || failures > 0) {
  console.error(`generation context continuity: ${failures} failure(s), ${checks}/${EXPECTED_CHECKS} checks executed`)
  process.exitCode = 1
} else {
  console.log(`generation context continuity: ${checks}/${EXPECTED_CHECKS} checks passed`)
}
