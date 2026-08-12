// Phase 162 browser contract: Create's persistent Generate action keeps focus
// and rejects duplicate activation through both failed and successful work.
// Run after `npm run build`: node e2e/create-generation-focus.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = 4221
const APP_URL = `http://localhost:${PORT}`
const E2E_DIR = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = join(E2E_DIR, '..')
const viteCli = join(WEB_DIR, 'node_modules', 'vite', 'bin', 'vite.js')
const EXPECTED_CHECKS = 16

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
let wasmRequests = 0
let initialWasmBurst = 0
let releaseFirst
let reportFirstStarted
const firstStarted = new Promise((resolve) => { reportFirstStarted = resolve })
const firstGate = new Promise((resolve) => { releaseFirst = resolve })
const external = []
const pageErrors = []
const check = (ok, label) => {
  checks++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) failures++
}

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await context.addInitScript(() => {
    localStorage.setItem('neologism:visited', '1')
    localStorage.setItem('phase162:sentinel', 'unchanged')
  })
  await context.route('**/*.wasm', async (route) => {
    wasmRequests++
    if (wasmRequests === 1) {
      reportFirstStarted()
      await firstGate
      await route.abort('failed')
      return
    }
    await route.continue()
  })
  await context.route('https://**/*', async (route) => {
    external.push(route.request().url())
    await route.abort('blockedbyclient')
  })

  const page = await context.newPage()
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.goto(APP_URL)
  const generate = page.locator('.command-area .command-bar .command-go')
  const storageBefore = await page.evaluate(() => JSON.stringify(localStorage))

  await generate.focus()
  await page.keyboard.press('Enter')
  await firstStarted
  check(
    await generate.getAttribute('aria-disabled') === 'true'
      && await generate.getAttribute('aria-busy') === 'true'
      && await generate.evaluate((element) => element.disabled === false)
      && (await generate.textContent())?.trim() === 'Generating…',
    'pending Generate remains focusable with explicit busy and disabled semantics',
  )
  check(
    await generate.evaluate((element) => document.activeElement === element),
    'Generate retains focus while the first local request is pending',
  )
  check(
    await generate.evaluate((element) => {
      const style = getComputedStyle(element)
      return element.matches(':focus-visible')
        && style.outlineStyle === 'solid'
        && parseFloat(style.outlineWidth) >= 2
    }),
    'busy Generate keeps a measurable visible focus indicator',
  )
  await page.screenshot({ path: join(E2E_DIR, 'shots', 'create-generation-busy.png'), fullPage: true })
  await page.waitForTimeout(100)
  initialWasmBurst = wasmRequests
  await page.keyboard.press('Enter')
  await generate.evaluate((element) => element.click())
  await page.waitForTimeout(100)
  check(
    initialWasmBurst > 0 && wasmRequests === initialWasmBurst,
    `keyboard and pointer repeats add no work beyond the initial local load burst (${initialWasmBurst} → ${wasmRequests})`,
  )

  releaseFirst()
  await page.waitForFunction(() => (
    document.querySelector('.command-go')?.textContent?.trim() === 'Generate'
      && Boolean(document.querySelector('.error-banner'))
  ))
  check(
    await generate.getAttribute('aria-disabled') === 'false'
      && await generate.getAttribute('aria-busy') === 'false'
      && (await generate.textContent())?.trim() === 'Generate',
    'failed generation restores the persistent action to its idle semantics',
  )
  check(
    await generate.evaluate((element) => document.activeElement === element),
    'failed generation leaves focus on Generate instead of BODY',
  )
  check(
    ((await page.locator('.error-banner').textContent()) ?? '').trim().length > 0,
    'the existing Create error surface remains visible after failure',
  )
  check(
    await page.evaluate(() => JSON.stringify(localStorage)) === storageBefore,
    'failed generation leaves browser storage byte-identical',
  )

  await generate.focus()
  await page.keyboard.press('Enter')
  await page.waitForSelector('.results-grid .name-card:nth-child(10)', { timeout: 20000 })
  await page.waitForFunction(() => document.querySelector('.command-go')?.textContent?.trim() === 'Generate')
  const shownNames = await page.locator('.results-grid .name-text').allTextContents()
  const recent = await page.evaluate(() => JSON.parse(localStorage.getItem('neologism:recent') ?? '[]'))
  check(await page.locator('.results-grid .name-card').count() === 10, 'retry returns one full ten-card Create page')
  check(
    await generate.evaluate((element) => document.activeElement === element),
    'successful generation also leaves focus on the persistent Generate action',
  )
  check(
    await generate.getAttribute('aria-disabled') === 'false'
      && await generate.getAttribute('aria-busy') === 'false'
      && !(await page.locator('.error-banner').isVisible()),
    'successful retry clears both busy semantics and the prior error',
  )
  check(
    JSON.stringify(recent) === JSON.stringify(shownNames),
    'successful retry records exactly the ten names shown',
  )
  check(
    await page.evaluate(() => localStorage.getItem('phase162:sentinel')) === 'unchanged',
    'successful retry leaves unrelated browser storage unchanged',
  )
  check(
    wasmRequests >= initialWasmBurst && wasmRequests <= initialWasmBurst + 1,
    `one retry adds at most one local initialization request (${initialWasmBurst} → ${wasmRequests})`,
  )
  check(external.length === 0, `Create focus recovery produces zero external HTTPS requests (${external.join(' | ')})`)
  check(pageErrors.length === 0, `Create focus recovery produces zero page errors (${pageErrors.join(' | ')})`)
  await context.close()
} finally {
  releaseFirst()
  await browser.close()
  if (process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
  } else {
    server.kill()
  }
}

if (checks !== EXPECTED_CHECKS) {
  console.error(`FAIL  expected ${EXPECTED_CHECKS} checks, executed ${checks}`)
  process.exit(1)
}
if (failures > 0) process.exit(1)
console.log(`\nCreate generation focus: all checks passed (${checks}/${EXPECTED_CHECKS})`)
