// Phase 165 browser contract: SPA view changes keep keyboard focus meaningful
// without forcing focus (and a mobile keyboard) after pointer activation.
// Run after `npm run build`: node e2e/landing-navigation-focus.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PORT = 4201
const APP_URL = `http://localhost:${PORT}`
const E2E_DIR = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = join(E2E_DIR, '..')
const viteCli = join(WEB_DIR, 'node_modules', 'vite', 'bin', 'vite.js')
const EXPECTED_CHECKS = 14

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

const check = (ok, label) => {
  checks++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) failures++
}

async function focusGeometry(locator) {
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    const offset = Number.parseFloat(style.outlineOffset) || 0
    const outline = Math.max(0, Number.parseFloat(style.outlineWidth) || 0)
    const margin = offset + outline
    const active = document.activeElement === element
    const focusVisible = element.matches(':focus-visible')
    const fits = rect.left - margin >= 0
      && rect.top - margin >= 0
      && rect.right + margin <= innerWidth
      && rect.bottom + margin <= innerHeight
    return {
      active,
      focusVisible,
      fits,
      rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
      margin,
      viewport: { width: innerWidth, height: innerHeight },
    }
  })
}

try {
  const keyboardContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const keyboardPage = await keyboardContext.newPage()
  keyboardPage.on('pageerror', (error) => pageErrors.push(error.message))
  await keyboardPage.goto(APP_URL)

  const openApp = keyboardPage.getByRole('button', { name: 'Open app' })
  await openApp.focus()
  await keyboardPage.keyboard.press('Enter')
  const commandInput = keyboardPage.locator('.command-input')
  await commandInput.waitFor({ state: 'visible' })
  check(await commandInput.evaluate((element) => document.activeElement === element), 'keyboard Landing entry focuses the Create brief field')
  check(await keyboardPage.evaluate(() => localStorage.getItem('neologism:visited') === '1'), 'keyboard Landing entry retains the existing visited marker')

  const about = keyboardPage.getByRole('button', { name: 'About', exact: true })
  await about.focus()
  await keyboardPage.keyboard.press('Enter')
  const landingTitle = keyboardPage.getByRole('heading', { name: 'Name your next big thing.' })
  await landingTitle.waitFor({ state: 'visible' })
  check(await landingTitle.evaluate((element) => document.activeElement === element), 'keyboard About navigation focuses the Landing heading')
  const titleFocus = await focusGeometry(landingTitle)
  if (!(titleFocus.active && titleFocus.focusVisible && titleFocus.fits)) console.log('INFO  Landing title focus geometry', titleFocus)
  check(titleFocus.active && titleFocus.focusVisible && titleFocus.fits, 'Landing heading focus indicator is fully visible at 390px')
  await keyboardPage.screenshot({ path: join(E2E_DIR, 'shots', 'landing-keyboard-focus.png') })

  await keyboardPage.keyboard.press('Tab')
  check(await keyboardPage.getByRole('button', { name: 'Find your name' }).first().evaluate((element) => document.activeElement === element), 'Tab from the focused Landing heading reaches the hero action')

  await keyboardPage.keyboard.press('Enter')
  await commandInput.waitFor({ state: 'visible' })
  check(await commandInput.evaluate((element) => document.activeElement === element), 'keyboard hero entry restores the same Create focus contract')

  await keyboardPage.reload()
  await commandInput.waitFor({ state: 'visible' })
  check(await keyboardPage.evaluate(() => document.activeElement === document.body), 'ordinary reload does not force a Create field focus')
  await keyboardContext.close()

  const narrowContext = await browser.newContext({ viewport: { width: 320, height: 700 } })
  const narrowPage = await narrowContext.newPage()
  narrowPage.on('pageerror', (error) => pageErrors.push(error.message))
  await narrowPage.addInitScript(() => localStorage.setItem('neologism:visited', '1'))
  await narrowPage.goto(APP_URL)
  const narrowAbout = narrowPage.getByRole('button', { name: 'About', exact: true })
  await narrowAbout.focus()
  await narrowPage.keyboard.press('Space')
  const narrowTitle = narrowPage.getByRole('heading', { name: 'Name your next big thing.' })
  const narrowFocus = await focusGeometry(narrowTitle)
  check(narrowFocus.active && narrowFocus.focusVisible && narrowFocus.fits, 'Landing heading focus indicator is fully visible at 320px')
  check(await narrowPage.evaluate(() => scrollX === 0), 'keyboard About navigation keeps the 320px viewport horizontally stable')
  await narrowContext.close()

  const pointerContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const pointerPage = await pointerContext.newPage()
  pointerPage.on('pageerror', (error) => pageErrors.push(error.message))
  await pointerPage.goto(APP_URL)
  await pointerPage.getByRole('button', { name: 'Open app' }).click()
  const pointerInput = pointerPage.locator('.command-input')
  await pointerInput.waitFor({ state: 'visible' })
  check(await pointerInput.evaluate((element) => document.activeElement !== element), 'pointer Landing entry does not force focus into the brief field')

  await pointerPage.getByRole('button', { name: 'About', exact: true }).click()
  const pointerTitle = pointerPage.getByRole('heading', { name: 'Name your next big thing.' })
  await pointerTitle.waitFor({ state: 'visible' })
  check(await pointerTitle.evaluate((element) => document.activeElement !== element), 'pointer About navigation does not force heading focus')
  check(await pointerPage.evaluate(() => scrollX === 0), 'pointer view changes keep the 390px viewport horizontally stable')
  await pointerContext.close()

  check(pageErrors.length === 0, 'both navigation paths produce zero page errors')
  check(checks === EXPECTED_CHECKS - 1, `fixture executes exactly ${EXPECTED_CHECKS} checks`)
} finally {
  await browser.close()
  server.kill()
}

if (checks !== EXPECTED_CHECKS || failures > 0) process.exitCode = 1
