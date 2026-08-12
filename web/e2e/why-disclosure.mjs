// Phase 155 browser contract: every card's Why explanation is a named,
// stateful nonmodal disclosure with stable keyboard focus and no side effects.
// Run after `npm run build`: node e2e/why-disclosure.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = 4214
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
const pageErrors = []
const external = []
const check = (ok, label) => {
  checks++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) failures++
}

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await context.addInitScript(() => {
    localStorage.setItem('neologism:visited', '1')
    Math.random = () => 0.125
    Object.defineProperty(Crypto.prototype, 'getRandomValues', {
      configurable: true,
      value(array) {
        for (let index = 0; index < array.length; index++) {
          array[index] = (17 + index * 31) & 0xff
        }
        return array
      },
    })
    const originalFetch = window.fetch
    window.fetch = (...args) => {
      window.__phase155Fetches = (window.__phase155Fetches ?? 0) + 1
      return originalFetch(...args)
    }
    const originalOpen = XMLHttpRequest.prototype.open
    XMLHttpRequest.prototype.open = function open(...args) {
      window.__phase155Xhrs = (window.__phase155Xhrs ?? 0) + 1
      return originalOpen.apply(this, args)
    }
  })
  await context.route('https://**/*', async (route) => {
    external.push(route.request().url())
    await route.abort()
  })

  const page = await context.newPage()
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.goto(APP_URL)
  await page.locator('.command-input').fill('a secure developer project for offline code review')
  await page.locator('.command-go').click()
  await page.waitForSelector('.results-grid .name-card', { timeout: 20000 })

  const cards = page.locator('.results-grid .name-card')
  const first = cards.nth(0)
  const second = cards.nth(1)
  const firstName = ((await first.locator('.name-text').textContent()) ?? '').trim()
  const secondName = ((await second.locator('.name-text').textContent()) ?? '').trim()
  const firstTrigger = first.getByRole('button', { name: `Why ${firstName} was generated` })
  const secondTrigger = second.getByRole('button', { name: `Why ${secondName} was generated` })
  const firstId = await firstTrigger.getAttribute('aria-controls')
  const secondId = await secondTrigger.getAttribute('aria-controls')
  const storageBefore = await page.evaluate(() => JSON.stringify(localStorage))
  const countersBefore = await page.evaluate(() => ({ fetches: window.__phase155Fetches ?? 0, xhrs: window.__phase155Xhrs ?? 0 }))

  check(
    firstName.length > 0
      && secondName.length > 0
      && firstName !== secondName
      && await firstTrigger.getAttribute('aria-expanded') === 'false'
      && await secondTrigger.getAttribute('aria-expanded') === 'false',
    'collapsed Why controls expose card-specific accessible names and state',
  )
  check(
    Boolean(firstId)
      && Boolean(secondId)
      && firstId !== secondId
      && await page.locator(`#${firstId}`).count() === 0
      && await page.locator(`#${secondId}`).count() === 0,
    'simultaneous cards own unique stable controlled-region ids',
  )

  await firstTrigger.focus()
  await page.keyboard.press('Enter')
  const firstRegion = page.getByRole('region', { name: `Explanation for ${firstName}` })
  check(
    await firstTrigger.getAttribute('aria-expanded') === 'true'
      && await firstRegion.getAttribute('id') === firstId,
    'Enter opens only the matching named explanation region',
  )
  check(
    await firstTrigger.evaluate((element) => document.activeElement === element),
    'opening keeps DOM focus on the persistent Why trigger',
  )
  check(
    await firstRegion.getAttribute('aria-live') === 'polite'
      && ['true', 'false'].includes((await firstRegion.getAttribute('aria-busy')) ?? ''),
    'the explanation region exposes polite live and loading state',
  )
  await page.waitForFunction((id) => document.getElementById(id)?.getAttribute('aria-busy') === 'false', firstId)
  check(
    (await firstRegion.textContent())?.trim().length > 10
      && !(await firstRegion.textContent())?.includes('…'),
    'the local explanation resolves into substantive text and clears busy state',
  )
  check(
    await firstRegion.getAttribute('role') === 'region'
      && await firstRegion.locator('[role="menu"], [role="dialog"]').count() === 0,
    'Why remains a nonmodal region rather than claiming menu or dialog behavior',
  )

  await secondTrigger.focus()
  await page.keyboard.press('Space')
  const secondRegion = page.getByRole('region', { name: `Explanation for ${secondName}` })
  check(
    await secondTrigger.getAttribute('aria-expanded') === 'true'
      && await secondRegion.getAttribute('id') === secondId
      && await firstTrigger.getAttribute('aria-expanded') === 'true',
    'Space opens the second card independently without collapsing the first',
  )
  await page.keyboard.press('Escape')
  check(
    await secondTrigger.getAttribute('aria-expanded') === 'false'
      && await secondRegion.count() === 0
      && await firstTrigger.getAttribute('aria-expanded') === 'true',
    'Escape closes only the focused card disclosure',
  )
  check(
    await secondTrigger.evaluate((element) => document.activeElement === element),
    'Escape retains focus on the exact second-card trigger instead of BODY',
  )

  await secondTrigger.click()
  check(
    await secondTrigger.getAttribute('aria-expanded') === 'true'
      && await secondRegion.isVisible(),
    'pointer activation preserves the same expanded/controlled contract',
  )
  await secondTrigger.click()
  check(
    await secondTrigger.getAttribute('aria-expanded') === 'false'
      && await secondRegion.count() === 0,
    'pointer activation closes the matching region without stale content',
  )

  await firstTrigger.focus()
  await page.keyboard.press('Tab')
  check(
    await first.getByRole('button', { name: `Name checks for ${firstName}` }).evaluate((element) => document.activeElement === element),
    'the static explanation adds no hidden focus stop between Why and Name checks',
  )
  const fit = await firstRegion.evaluate((region) => {
    const card = region.closest('.name-card')?.getBoundingClientRect()
    const box = region.getBoundingClientRect()
    const chipRects = Array.from(region.closest('.name-card')?.querySelectorAll('.card-chip') ?? [])
      .map((element) => element.getBoundingClientRect())
    return Boolean(card)
      && box.left >= card.left - 1
      && box.right <= card.right + 1
      && box.left >= -1
      && box.right <= innerWidth + 1
      && chipRects.length === 2
      && chipRects.every((rect) => rect.width >= 39.5 && rect.height >= 39.5)
  })
  check(fit, '390px explanation stays contained and both disclosure triggers are mobile-safe')

  const storageAfter = await page.evaluate(() => JSON.stringify(localStorage))
  const counters = await page.evaluate(() => ({ fetches: window.__phase155Fetches ?? 0, xhrs: window.__phase155Xhrs ?? 0 }))
  check(
    storageAfter === storageBefore
      && counters.fetches === countersBefore.fetches
      && counters.xhrs === countersBefore.xhrs
      && external.length === 0,
    `Why interactions preserve storage and add zero network requests (${JSON.stringify({ before: countersBefore, after: counters })}, ${JSON.stringify(external)})`,
  )
  check(pageErrors.length === 0, `Why disclosure completes without page errors (${JSON.stringify(pageErrors)})`)
  await context.close()
} catch (error) {
  console.error('SCRIPT ERROR:', error instanceof Error ? error.message : error)
  failures++
} finally {
  await browser.close()
  if (process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
  } else {
    server.kill()
  }
}

if (checks !== EXPECTED_CHECKS) {
  console.error(`FAIL  expected ${EXPECTED_CHECKS} behavioral checks, executed ${checks}`)
  failures++
}

if (failures > 0) {
  console.error(`Why disclosure browser: ${failures} failure(s), ${checks}/${EXPECTED_CHECKS} checks executed`)
  process.exitCode = 1
} else {
  console.log(`Why disclosure browser: ${checks}/${EXPECTED_CHECKS} checks passed`)
}
