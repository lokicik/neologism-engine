// Phase 166 browser contract: the empty Saved CTA returns keyboard users to
// Create meaningfully without forcing form focus after pointer activation.
// Run after `npm run build`: node e2e/empty-saved-navigation-focus.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PORT = 4202
const APP_URL = `http://localhost:${PORT}`
const E2E_DIR = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = join(E2E_DIR, '..')
const viteCli = join(WEB_DIR, 'node_modules', 'vite', 'bin', 'vite.js')
const EXPECTED_CHECKS = 8

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

async function storageSnapshot(page) {
  return page.evaluate(() => JSON.stringify({
    local: Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)]),
    session: Object.keys(sessionStorage).sort().map((key) => [key, sessionStorage.getItem(key)]),
  }))
}

try {
  const keyboardContext = await browser.newContext({ viewport: { width: 320, height: 700 } })
  await keyboardContext.addInitScript(() => localStorage.setItem('neologism:visited', '1'))
  const keyboardPage = await keyboardContext.newPage()
  keyboardPage.on('pageerror', (error) => pageErrors.push(error.message))
  await keyboardPage.goto(APP_URL)
  const keyboardBefore = await storageSnapshot(keyboardPage)

  const saved = keyboardPage.getByRole('button', { name: /^Saved/ })
  await saved.focus()
  await keyboardPage.keyboard.press('Enter')
  const goCreate = keyboardPage.getByRole('button', { name: 'Go create' })
  await goCreate.waitFor({ state: 'visible' })
  check(await goCreate.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return rect.width >= 39.5
      && rect.height >= 39.5
      && rect.left >= 0
      && rect.right <= innerWidth
  }), 'empty Saved exposes one visible, mobile-safe Go create action')

  await goCreate.focus()
  await keyboardPage.keyboard.press('Enter')
  const commandInput = keyboardPage.locator('.command-input')
  await commandInput.waitFor({ state: 'visible' })
  check(await commandInput.evaluate((element) => document.activeElement === element), 'keyboard Go create focuses the Create brief field')
  check(await commandInput.evaluate((element) => element.matches(':focus-visible')), 'restored Create brief focus has a visible keyboard indicator')
  check(await keyboardPage.evaluate(() => scrollX === 0), 'keyboard Saved round trip keeps the 320px viewport horizontally stable')
  check(await storageSnapshot(keyboardPage) === keyboardBefore, 'keyboard Saved round trip leaves browser storage byte-for-byte unchanged')
  await keyboardContext.close()

  const pointerContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await pointerContext.addInitScript(() => localStorage.setItem('neologism:visited', '1'))
  const pointerPage = await pointerContext.newPage()
  pointerPage.on('pageerror', (error) => pageErrors.push(error.message))
  await pointerPage.goto(APP_URL)
  await pointerPage.getByRole('button', { name: /^Saved/ }).click()
  await pointerPage.getByRole('button', { name: 'Go create' }).click()
  const pointerInput = pointerPage.locator('.command-input')
  await pointerInput.waitFor({ state: 'visible' })
  check(await pointerInput.evaluate((element) => document.activeElement !== element), 'pointer Go create does not force focus into the brief field')
  check(pageErrors.length === 0, 'keyboard and pointer Saved round trips produce zero page errors')
  await pointerContext.close()

  check(checks === EXPECTED_CHECKS - 1, `fixture executes exactly ${EXPECTED_CHECKS} checks`)
} finally {
  await browser.close()
  server.kill()
}

if (checks !== EXPECTED_CHECKS || failures > 0) process.exitCode = 1
