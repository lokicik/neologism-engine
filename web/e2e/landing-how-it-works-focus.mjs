// Phase 180 browser contract: the Landing "How it works" jump carries
// keyboard focus to its destination without forcing pointer focus.
// Run after `npm run build`: node e2e/landing-how-it-works-focus.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PORT = 4212
const APP_URL = `http://localhost:${PORT}`
const E2E_DIR = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = join(E2E_DIR, '..')
const viteCli = join(WEB_DIR, 'node_modules', 'vite', 'bin', 'vite.js')
const EXPECTED_CHECKS = 15

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
const externalRequests = []

const check = (ok, label) => {
  checks++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) failures++
}

async function focusedAndContained(locator) {
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    const margin = (Number.parseFloat(style.outlineWidth) || 0)
      + (Number.parseFloat(style.outlineOffset) || 0)
    const active = document.activeElement === element
    const focusVisible = element.matches(':focus-visible')
    const fits = rect.left - margin >= 0
      && rect.top - margin >= 0
      && rect.right + margin <= innerWidth
      && rect.bottom + margin <= innerHeight
    return {
      ok: active && focusVisible && fits,
      active,
      focusVisible,
      fits,
      rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
      margin,
      viewport: { width: innerWidth, height: innerHeight },
    }
  })
}

async function waitForLandingScroll(page) {
  await page.waitForFunction(() => scrollY > 0)
}

async function waitForFocusedSteps(page) {
  await page.waitForFunction(() => {
    const element = document.querySelector('.landing-steps')
    if (!(element instanceof HTMLElement) || document.activeElement !== element) return false
    const rect = element.getBoundingClientRect()
    return rect.top >= 7 && rect.bottom <= innerHeight - 7
  })
}

try {
  const keyboardContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const keyboardPage = await keyboardContext.newPage()
  keyboardPage.on('pageerror', (error) => pageErrors.push(error.message))
  keyboardPage.on('request', (request) => {
    if (request.url().startsWith('https://')) externalRequests.push(request.url())
  })
  await keyboardPage.goto(APP_URL)

  const keyboardTrigger = keyboardPage.getByRole('button', { name: 'How it works' })
  const keyboardSteps = keyboardPage.locator('.landing-steps')
  await keyboardTrigger.focus()
  check(await keyboardTrigger.evaluate((element) => document.activeElement === element && element.matches(':focus-visible')), 'keyboard starts from a visibly focused How it works action')
  await keyboardPage.keyboard.press('Enter')
  await waitForLandingScroll(keyboardPage)
  await waitForFocusedSteps(keyboardPage)
  check(await keyboardPage.evaluate(() => scrollY > 0), 'keyboard activation scrolls to the steps')
  check(await keyboardSteps.evaluate((element) => element.getAttribute('role') === 'region' && element.getAttribute('aria-label') === 'How it works'), 'destination exposes a named region')
  check(await keyboardSteps.evaluate((element) => document.activeElement === element), 'keyboard activation moves focus to the steps region')
  const keyboardFit = await focusedAndContained(keyboardSteps)
  if (!keyboardFit.ok) console.log('INFO  390px steps focus geometry', keyboardFit)
  check(keyboardFit.ok, 'steps focus indicator is fully visible at 390px')
  await keyboardPage.screenshot({ path: join(E2E_DIR, 'shots', 'landing-how-it-works-focus.png') })
  await keyboardPage.keyboard.press('Tab')
  check(await keyboardPage.getByRole('button', { name: 'Find your name' }).last().evaluate((element) => document.activeElement === element), 'Tab continues from the destination to the closing action')
  await keyboardContext.close()

  const pointerContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const pointerPage = await pointerContext.newPage()
  pointerPage.on('pageerror', (error) => pageErrors.push(error.message))
  pointerPage.on('request', (request) => {
    if (request.url().startsWith('https://')) externalRequests.push(request.url())
  })
  await pointerPage.goto(APP_URL)
  const pointerTrigger = pointerPage.getByRole('button', { name: 'How it works' })
  const pointerSteps = pointerPage.locator('.landing-steps')
  await pointerTrigger.click()
  await waitForLandingScroll(pointerPage)
  check(await pointerPage.evaluate(() => scrollY > 0), 'pointer activation preserves the existing scroll behavior')
  check(await pointerSteps.evaluate((element) => document.activeElement !== element), 'pointer activation does not force focus onto the destination')
  check(await pointerTrigger.evaluate((element) => document.activeElement === element), 'pointer activation leaves native focus on the action')
  await pointerContext.close()

  const narrowContext = await browser.newContext({ viewport: { width: 320, height: 700 } })
  const narrowPage = await narrowContext.newPage()
  narrowPage.on('pageerror', (error) => pageErrors.push(error.message))
  narrowPage.on('request', (request) => {
    if (request.url().startsWith('https://')) externalRequests.push(request.url())
  })
  await narrowPage.goto(APP_URL)
  const narrowTrigger = narrowPage.getByRole('button', { name: 'How it works' })
  const narrowSteps = narrowPage.locator('.landing-steps')
  await narrowTrigger.focus()
  await narrowPage.keyboard.press('Space')
  await waitForLandingScroll(narrowPage)
  await waitForFocusedSteps(narrowPage)
  const narrowFit = await focusedAndContained(narrowSteps)
  if (!narrowFit.ok) console.log('INFO  320px steps focus geometry', narrowFit)
  check(narrowFit.ok, 'steps focus indicator is fully visible at 320px')
  check(await narrowPage.evaluate(() => scrollX === 0 && document.documentElement.scrollWidth <= innerWidth + 1), 'keyboard jump keeps the 320px viewport horizontally contained')
  check((await narrowPage.evaluate(() => Object.keys(localStorage).length)) === 0, 'the in-page jump does not write local storage')
  await narrowContext.close()

  check(externalRequests.length === 0, 'all focus and scroll paths make zero external HTTPS requests')
  check(pageErrors.length === 0, 'all focus and scroll paths produce zero page errors')
  check(checks === EXPECTED_CHECKS - 1, `fixture executes exactly ${EXPECTED_CHECKS} checks`)
} finally {
  await browser.close()
  server.kill()
}

if (checks !== EXPECTED_CHECKS || failures > 0) process.exitCode = 1
