// Phase 181 browser contract: keyboard activation of an empty-state example
// keeps focus on the persistent Generate action when the example unmounts.
// Run after `npm run build`: node e2e/example-prompt-focus.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PORT = 4213
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
const externalRequests = []

const check = (ok, label) => {
  checks++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) failures++
}

async function generateFocusState(page) {
  return page.locator('.command-go').evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    const margin = (Number.parseFloat(style.outlineWidth) || 0)
      + (Number.parseFloat(style.outlineOffset) || 0)
    return {
      active: document.activeElement === element,
      focusVisible: element.matches(':focus-visible'),
      fits: rect.left - margin >= 0
        && rect.top - margin >= 0
        && rect.right + margin <= innerWidth
        && rect.bottom + margin <= innerHeight,
    }
  })
}

async function focusRingState(locator) {
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    const outline = Number.parseFloat(style.outlineWidth) || 0
    const offset = Number.parseFloat(style.outlineOffset) || 0
    const margin = outline + offset
    return {
      active: document.activeElement === element,
      focusVisible: element.matches(':focus-visible'),
      outline,
      outlineStyle: style.outlineStyle,
      offset,
      fits: rect.left - margin >= 0
        && rect.top - margin >= 0
        && rect.right + margin <= innerWidth
        && rect.bottom + margin <= innerHeight,
    }
  })
}

async function setupPage(context) {
  await context.addInitScript(() => localStorage.setItem('neologism:visited', '1'))
  const page = await context.newPage()
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('request', (request) => {
    if (request.url().startsWith('https://')) externalRequests.push(request.url())
  })
  await page.goto(APP_URL)
  return page
}

try {
  const keyboardContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const keyboardPage = await setupPage(keyboardContext)
  const rustExample = keyboardPage.getByRole('button', { name: /a Rust CLI that processes logs/ })
  await rustExample.focus()
  await keyboardPage.keyboard.press('Shift+Tab')
  await keyboardPage.keyboard.press('Tab')
  const rustExampleFocus = await focusRingState(rustExample)
  check(
    rustExampleFocus.active
      && rustExampleFocus.focusVisible
      && rustExampleFocus.outline >= 2
      && rustExampleFocus.outlineStyle !== 'none'
      && rustExampleFocus.fits,
    `keyboard starts from an example prompt with a contained 2px ring (${JSON.stringify(rustExampleFocus)})`,
  )
  await keyboardPage.keyboard.press('Enter')
  await keyboardPage.locator('.name-card').first().waitFor({ state: 'visible' })
  check(await keyboardPage.locator('.command-input').inputValue() === 'a Rust CLI that processes logs', 'example activation applies the exact visible brief')
  check(await keyboardPage.locator('.name-card').count() === 10, 'example activation produces one complete local page')
  const keyboardFocus = await generateFocusState(keyboardPage)
  check(keyboardFocus.active && keyboardFocus.focusVisible, 'keyboard example activation restores visible focus to Generate')
  check(keyboardFocus.fits, 'restored Generate focus is fully visible at 390px')
  const visibleNames = await keyboardPage.locator('.name-text').allTextContents()
  const recentNames = await keyboardPage.evaluate(() => JSON.parse(localStorage.getItem('neologism:recent') || '[]'))
  check(JSON.stringify(recentNames) === JSON.stringify(visibleNames), 'the example records exactly the names shown on its first page')
  await keyboardContext.close()

  const pointerContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const pointerPage = await setupPage(pointerContext)
  await pointerPage.getByRole('button', { name: /a Python package for data validation/ }).click()
  await pointerPage.locator('.name-card').first().waitFor({ state: 'visible' })
  check(await pointerPage.locator('.command-input').inputValue() === 'a Python package for data validation', 'pointer example activation retains the same prompt behavior')
  check(!(await generateFocusState(pointerPage)).active, 'pointer example activation does not force focus to Generate')
  await pointerContext.close()

  const narrowContext = await browser.newContext({ viewport: { width: 320, height: 700 } })
  const narrowPage = await setupPage(narrowContext)
  const narrowExample = narrowPage.getByRole('button', { name: /a journaling app with mood insights/ })
  await narrowExample.focus()
  await narrowPage.keyboard.press('Shift+Tab')
  await narrowPage.keyboard.press('Tab')
  const narrowExampleFocus = await focusRingState(narrowExample)
  check(
    narrowExampleFocus.active
      && narrowExampleFocus.focusVisible
      && narrowExampleFocus.outline >= 2
      && narrowExampleFocus.outlineStyle !== 'none'
      && narrowExampleFocus.fits,
    `320px example prompt keeps its full 2px ring visible (${JSON.stringify(narrowExampleFocus)})`,
  )
  await narrowPage.keyboard.press('Space')
  await narrowPage.locator('.name-card').first().waitFor({ state: 'visible' })
  const narrowFocus = await generateFocusState(narrowPage)
  check(narrowFocus.active && narrowFocus.focusVisible && narrowFocus.fits, 'keyboard example focus is fully visible at 320px')
  check(JSON.stringify(await narrowPage.evaluate(() => Object.keys(localStorage).sort())) === JSON.stringify(['neologism:recent', 'neologism:visited']), 'example generation writes only visited and recent operational state')
  await narrowContext.close()

  check(externalRequests.length === 0, 'all example paths make zero external HTTPS requests')
  check(pageErrors.length === 0, 'all example paths produce zero page errors')
  check(checks === EXPECTED_CHECKS - 1, `fixture executes exactly ${EXPECTED_CHECKS} checks`)
} finally {
  await browser.close()
  server.kill()
}

if (checks !== EXPECTED_CHECKS || failures > 0) process.exitCode = 1
