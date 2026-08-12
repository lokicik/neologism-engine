// Phase 209 browser contract: a share URL opened in an already-mounted tab is
// imported through hashchange with the same share-only semantics as first load.
// Run after `npm run build`: node e2e/runtime-share-import.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = 4228
const APP_URL = `http://localhost:${PORT}`
const E2E_DIR = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = join(E2E_DIR, '..')
const viteCli = join(WEB_DIR, 'node_modules', 'vite', 'bin', 'vite.js')
const EXPECTED_CHECKS = 8
const payload = Buffer.from(JSON.stringify([
  { n: 'RuntimeNova', s: 'big_tech' },
  { n: 'RuntimeVale', s: 'fantasy' },
])).toString('base64')

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
  check(await page.getByRole('heading', { name: 'Create names' }).isVisible(), 'the mounted tab starts on Create')

  await page.evaluate((hash) => { location.hash = hash }, `#names=${payload}`)
  await page.waitForTimeout(250)
  const imported = await page.evaluate(() => JSON.parse(localStorage.getItem('neologism:imported-saved') ?? '[]'))
  check(await page.getByRole('heading', { name: 'Saved names' }).isVisible(), 'runtime share navigation opens Saved')
  check(
    imported.map((item) => item.name).join(',') === 'RuntimeNova,RuntimeVale',
    'runtime share navigation persists both exact imported names',
  )
  check(
    await page.evaluate(() => JSON.parse(localStorage.getItem('neologism:favorites') ?? '[]').length) === 0,
    'runtime imports remain share-only rather than explicit likes',
  )
  check(await page.evaluate(() => location.hash === ''), 'successful runtime import clears the consumed recovery hash')

  await page.goBack()
  await page.waitForFunction(() => Boolean(document.querySelector('.create-page-title')))
  check(
    await page.getByRole('heading', { name: 'Create names' }).isVisible()
      && await page.evaluate(() => location.hash === ''),
    'Back returns to the pre-share Create entry without replaying the hash',
  )

  await page.evaluate((hash) => { location.hash = hash }, `#names=${payload}`)
  await page.waitForTimeout(250)
  check(
    await page.evaluate(() => JSON.parse(localStorage.getItem('neologism:imported-saved') ?? '[]').length) === 2,
    'reopening the same runtime share is idempotent',
  )
  check(
    external.length === 0 && pageErrors.length === 0,
    `runtime share import adds no external HTTPS request or page error (${JSON.stringify({ external, pageErrors })})`,
  )
} finally {
  await browser.close()
  server.kill()
}

if (checks !== EXPECTED_CHECKS || failures > 0) {
  console.error(`runtime share import: ${failures} failure(s), ${checks}/${EXPECTED_CHECKS} checks executed`)
  process.exitCode = 1
} else {
  console.log(`runtime share import: ${checks}/${EXPECTED_CHECKS} checks passed`)
}
