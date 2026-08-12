// Phase 163 browser contract: every page shares one in-flight WASM init, and
// a rejected init clears that shared attempt so one explicit retry can recover.
// Run after `npm run build`: node e2e/wasm-init-coalescing.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = 4222
const APP_URL = `http://localhost:${PORT}`
const E2E_DIR = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = join(E2E_DIR, '..')
const viteCli = join(WEB_DIR, 'node_modules', 'vite', 'bin', 'vite.js')
const EXPECTED_CHECKS = 12

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

async function newPage() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await context.addInitScript(() => localStorage.setItem('neologism:visited', '1'))
  await context.route('https://**/*', async (route) => {
    external.push(route.request().url())
    await route.abort('blockedbyclient')
  })
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  return { context, page, pageErrors }
}

try {
  const success = await newPage()
  let successRequests = 0
  let releaseSuccess
  let reportSuccessStarted
  const successStarted = new Promise((resolve) => { reportSuccessStarted = resolve })
  const successGate = new Promise((resolve) => { releaseSuccess = resolve })
  await success.context.route('**/*.wasm', async (route) => {
    successRequests++
    reportSuccessStarted()
    await successGate
    await route.continue()
  })
  await success.page.goto(APP_URL)
  const successGenerate = success.page.locator('.command-area .command-go')
  await successGenerate.click()
  await successStarted
  await success.page.waitForTimeout(200)
  check(successRequests === 1, `one cold Create operation starts one shared WASM request (${successRequests})`)
  releaseSuccess()
  await success.page.waitForSelector('.results-grid .name-card:nth-child(10)', { timeout: 20000 })
  check(await success.page.locator('.results-grid .name-card').count() === 10, 'shared cold initialization returns a full Create page')

  const firstCard = success.page.locator('.results-grid .name-card').first()
  const firstName = ((await firstCard.locator('.name-text').textContent()) ?? '').trim()
  await firstCard.getByRole('button', { name: `Why ${firstName} was generated` }).click()
  await success.page.waitForFunction((name) => (
    document.querySelector(`[aria-label="Explanation for ${name}"]`)?.getAttribute('aria-busy') === 'false'
  ), firstName)
  check(successRequests === 1, 'a later Why explanation reuses the completed page initialization')

  await successGenerate.click()
  await success.page.waitForFunction(() => (
    JSON.parse(localStorage.getItem('neologism:recent') ?? '[]').length === 20
      && document.querySelector('.command-area .command-go')?.getAttribute('aria-busy') === 'false'
  ))
  check(successRequests === 1, 'a later Create page also reuses the completed initialization')
  check(success.pageErrors.length === 0, `successful shared initialization produces zero page errors (${success.pageErrors.join(' | ')})`)
  await success.context.close()

  const recovery = await newPage()
  let recoveryRequests = 0
  await recovery.context.route('**/*.wasm', async (route) => {
    recoveryRequests++
    if (recoveryRequests === 1) await route.abort('failed')
    else await route.continue()
  })
  await recovery.page.goto(APP_URL)
  const recoveryGenerate = recovery.page.locator('.command-area .command-go')
  await recoveryGenerate.click()
  await recovery.page.waitForSelector('.error-banner')
  check(
    recoveryRequests === 1
      && await recoveryGenerate.getAttribute('aria-busy') === 'false',
    `all cold callers share the one rejected initialization (${recoveryRequests})`,
  )
  check(await recovery.page.locator('.results-grid .name-card').count() === 0, 'failed shared initialization presents no partial Create page')

  await recoveryGenerate.click()
  await recovery.page.waitForSelector('.results-grid .name-card:nth-child(10)', { timeout: 20000 })
  check(recoveryRequests === 2, `one explicit retry starts exactly one fresh initialization (${recoveryRequests})`)
  check(
    await recovery.page.locator('.results-grid .name-card').count() === 10
      && !(await recovery.page.locator('.error-banner').isVisible()),
    'the fresh shared initialization recovers the full page and clears the error',
  )
  check(
    await recoveryGenerate.evaluate((element) => document.activeElement === element),
    'failed-init retry retains the Phase 162 Generate focus contract',
  )
  check(recovery.pageErrors.length === 0, `failed-init recovery produces zero page errors (${recovery.pageErrors.join(' | ')})`)
  await recovery.context.close()

  check(external.length === 0, `WASM initialization remains local with zero external HTTPS requests (${external.join(' | ')})`)
} finally {
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
console.log(`\nWASM init coalescing: all checks passed (${checks}/${EXPECTED_CHECKS})`)
