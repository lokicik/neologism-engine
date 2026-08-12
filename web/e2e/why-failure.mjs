// Phase 161 browser contract: a failed local Why explanation becomes an
// honest terminal state, and closing/reopening the disclosure retries it.
// Run after `npm run build`: node e2e/why-failure.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = 4220
const APP_URL = `http://localhost:${PORT}`
const E2E_DIR = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = join(E2E_DIR, '..')
const viteCli = join(WEB_DIR, 'node_modules', 'vite', 'bin', 'vite.js')
const EXPECTED_CHECKS = 13
const SAVED = {
  name: 'Retrymark',
  style: 'big_tech',
  score_pronounce: 0,
  score_novelty: 0,
  score_memorability: 0,
  connotations: [],
  syllables: 0,
}

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
const external = []
const pageErrors = []
const check = (ok, label) => {
  checks++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) failures++
}

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await context.addInitScript(({ saved }) => {
    localStorage.setItem('neologism:visited', '1')
    localStorage.setItem('neologism:imported-saved', JSON.stringify([saved]))
    localStorage.setItem('phase161:sentinel', 'unchanged')
  }, { saved: SAVED })
  await context.route('**/*.wasm', async (route) => {
    wasmRequests++
    if (wasmRequests === 1) await route.abort('failed')
    else await route.continue()
  })
  await context.route('https://**/*', async (route) => {
    external.push(route.request().url())
    await route.abort('blockedbyclient')
  })

  const page = await context.newPage()
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.goto(APP_URL)
  await page.getByRole('button', { name: /Saved/ }).click()

  const card = page.locator('.name-card').filter({ hasText: SAVED.name })
  const trigger = card.getByRole('button', { name: `Why ${SAVED.name} was generated` })
  const region = page.getByRole('region', { name: `Explanation for ${SAVED.name}` })
  const storageBefore = await page.evaluate(() => JSON.stringify(localStorage))

  await trigger.focus()
  await page.keyboard.press('Enter')
  check(
    await trigger.getAttribute('aria-expanded') === 'true'
      && await region.getAttribute('aria-busy') === 'true',
    'Why opens in an explicit busy state while the local explanation starts',
  )
  await page.waitForTimeout(400)
  check(await region.getAttribute('aria-busy') === 'false', 'local explanation failure clears the busy state')
  check(
    (await region.textContent())?.includes('Explanation unavailable')
      && (await region.textContent())?.includes('reopen Why to retry'),
    'the failed explanation gives an honest retry instruction',
  )
  check(
    await region.evaluate((element) => {
      const card = element.closest('.name-card')?.getBoundingClientRect()
      const box = element.getBoundingClientRect()
      return Boolean(card)
        && box.left >= card.left - 1
        && box.right <= card.right + 1
        && box.left >= -1
        && box.right <= innerWidth + 1
    }),
    '390px failure guidance remains horizontally contained inside its card',
  )
  await page.screenshot({ path: join(E2E_DIR, 'shots', 'why-failure.png'), fullPage: true })
  check(
    await trigger.evaluate((element) => document.activeElement === element),
    'failed explanation leaves focus on the persistent Why trigger',
  )

  await page.keyboard.press('Escape')
  check(
    await trigger.getAttribute('aria-expanded') === 'false'
      && await region.count() === 0
      && await trigger.evaluate((element) => document.activeElement === element),
    'Escape closes the failed disclosure and retains the exact trigger',
  )
  await page.keyboard.press('Enter')
  check(
    await trigger.getAttribute('aria-expanded') === 'true'
      && await region.getAttribute('aria-busy') === 'true',
    'reopening starts one natural local retry',
  )
  await page.waitForFunction((name) => {
    const candidate = document.querySelector(`[aria-label="Explanation for ${name}"]`)
    return candidate?.getAttribute('aria-busy') === 'false'
      && !candidate.textContent?.includes('Explanation unavailable')
  }, SAVED.name)
  check(
    ((await region.textContent()) ?? '').trim().length > 20
      && !(await region.textContent())?.includes('…'),
    'successful retry replaces the failure with a substantive explanation',
  )
  check(
    await trigger.evaluate((element) => document.activeElement === element),
    'successful retry also keeps focus on the persistent trigger',
  )
  check(wasmRequests === 2, `failure plus retry starts exactly two local WASM requests (${wasmRequests})`)
  check(
    await page.evaluate(() => localStorage.getItem('phase161:sentinel')) === 'unchanged'
      && await page.evaluate(() => JSON.stringify(localStorage)) === storageBefore,
    'Why failure and retry leave local storage byte-identical',
  )
  check(external.length === 0, `Why failure and retry produce zero external HTTPS requests (${external.join(' | ')})`)
  check(pageErrors.length === 0, `Why failure and retry produce zero page errors (${pageErrors.join(' | ')})`)
  await context.close()
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
console.log(`\nWhy failure recovery: all checks passed (${checks}/${EXPECTED_CHECKS})`)
