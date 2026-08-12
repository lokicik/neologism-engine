// Phase 167 browser contract: exhaustion recovery never drops keyboard focus
// while an impossible constraint honestly remains exhausted.
// Run after `npm run build`: node e2e/exhaustion-recovery-focus.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PORT = 4203
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
const pageErrors = []

const check = (ok, label) => {
  checks++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) failures++
}

async function configureImpossibleConstraint(page) {
  await page.getByRole('button', { name: /^Advanced filters/ }).click()
  await page.getByRole('textbox', { name: 'Starts with' }).fill('zzz')
  await page.getByRole('textbox', { name: 'Contains' }).fill('zzzzzz')
  await page.getByRole('button', { name: /^Advanced filters/ }).click()
  await page.getByRole('button', { name: 'Generate', exact: true }).click()
  await page.locator('.exhausted-notice').waitFor({ state: 'visible', timeout: 30000 })
}

try {
  const keyboardContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await keyboardContext.addInitScript(() => localStorage.setItem('neologism:visited', '1'))
  const keyboardPage = await keyboardContext.newPage()
  keyboardPage.on('pageerror', (error) => pageErrors.push(error.message))
  await keyboardPage.goto(APP_URL)
  await configureImpossibleConstraint(keyboardPage)
  check(await keyboardPage.locator('.name-card').count() === 0, 'unreachable exact constraints produce zero misleading cards')

  const recovery = keyboardPage.getByRole('button', { name: 'Clear seen names & regenerate' })
  check(await recovery.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return rect.width >= 39.5
      && rect.height >= 39.5
      && rect.left >= 0
      && rect.right <= innerWidth
  }), 'exhaustion exposes one visible, mobile-safe explicit recovery action')
  await recovery.focus()
  await keyboardPage.keyboard.press('Enter')
  await keyboardPage.waitForTimeout(1000)
  const returnedRecovery = keyboardPage.getByRole('button', { name: 'Clear seen names & regenerate' })
  await returnedRecovery.waitFor({ state: 'visible' })
  check(await returnedRecovery.evaluate((element) => document.activeElement === element), 'failed keyboard recovery restores the persistent recovery action')
  check(await returnedRecovery.evaluate((element) => element.matches(':focus-visible')), 'restored recovery action keeps a visible keyboard indicator')
  check(await keyboardPage.locator('.error-banner').count() === 0, 'honest exhaustion does not masquerade as an engine error')
  check(await keyboardPage.evaluate(() => localStorage.getItem('neologism:recent') === '[]'), 'recovery clears the durable recent-name window exactly')
  check(await keyboardPage.evaluate(() => scrollX === 0), 'keyboard recovery keeps the 390px viewport horizontally stable')

  await keyboardPage.getByRole('button', { name: /^Advanced filters/ }).click()
  await keyboardPage.getByRole('textbox', { name: 'Starts with' }).fill('')
  await keyboardPage.getByRole('textbox', { name: 'Contains' }).fill('')
  await keyboardPage.getByRole('button', { name: /^Advanced filters/ }).click()
  await returnedRecovery.focus()
  await keyboardPage.keyboard.press('Enter')
  await keyboardPage.locator('.name-card').first().waitFor({ state: 'visible', timeout: 30000 })
  const generate = keyboardPage.getByRole('button', { name: 'Generate', exact: true })
  check(await keyboardPage.locator('.name-card').count() >= 10, 'recovery succeeds normally after the impossible filters are removed')
  check(await generate.evaluate((element) => document.activeElement === element && element.matches(':focus-visible')), 'successful keyboard recovery returns focus to persistent Generate')
  await keyboardContext.close()

  const pointerContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await pointerContext.addInitScript(() => localStorage.setItem('neologism:visited', '1'))
  const pointerPage = await pointerContext.newPage()
  pointerPage.on('pageerror', (error) => pageErrors.push(error.message))
  await pointerPage.goto(APP_URL)
  await configureImpossibleConstraint(pointerPage)
  await pointerPage.getByRole('button', { name: /^Advanced filters/ }).click()
  await pointerPage.getByRole('textbox', { name: 'Starts with' }).fill('')
  await pointerPage.getByRole('textbox', { name: 'Contains' }).fill('')
  await pointerPage.getByRole('button', { name: /^Advanced filters/ }).click()
  await pointerPage.getByRole('button', { name: 'Clear seen names & regenerate' }).click()
  await pointerPage.locator('.name-card').first().waitFor({ state: 'visible', timeout: 30000 })
  const pointerGenerate = pointerPage.getByRole('button', { name: 'Generate', exact: true })
  check(await pointerGenerate.evaluate((element) => document.activeElement !== element), 'successful pointer recovery does not force focus onto Generate')
  await pointerContext.close()

  check(pageErrors.length === 0, 'keyboard and pointer recovery produce zero page errors')
  check(checks === EXPECTED_CHECKS - 1, `fixture executes exactly ${EXPECTED_CHECKS} checks`)
} finally {
  await browser.close()
  server.kill()
}

if (checks !== EXPECTED_CHECKS || failures > 0) process.exitCode = 1
