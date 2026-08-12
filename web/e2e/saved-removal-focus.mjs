// Phase 168 browser contract: keyboard removal from Saved moves to the next
// meaningful persistent action only after durable removal succeeds.
// Run after `npm run build`: node e2e/saved-removal-focus.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PORT = 4204
const APP_URL = `http://localhost:${PORT}`
const E2E_DIR = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = join(E2E_DIR, '..')
const viteCli = join(WEB_DIR, 'node_modules', 'vite', 'bin', 'vite.js')
const EXPECTED_CHECKS = 17
const STUBS = ['FocusAlpha', 'FocusBeta', 'FocusGamma'].map((name) => ({
  name,
  style: 'big_tech',
  score_pronounce: 0,
  score_novelty: 0,
  score_memorability: 0,
  connotations: [],
  syllables: 0,
}))

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

async function seed(context, items) {
  await context.addInitScript((saved) => {
    localStorage.setItem('neologism:visited', '1')
    localStorage.setItem('neologism:imported-saved', JSON.stringify(saved))
  }, items)
}

try {
  const keyboardContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await seed(keyboardContext, STUBS)
  const keyboardPage = await keyboardContext.newPage()
  keyboardPage.on('pageerror', (error) => pageErrors.push(error.message))
  await keyboardPage.goto(APP_URL)
  await keyboardPage.getByRole('button', { name: /^Saved/ }).click()
  check(await keyboardPage.locator('.name-card').count() === 3, 'three imported-only Saved cards render before removal')

  const removeBeta = keyboardPage.getByRole('button', { name: 'Remove FocusBeta from Saved' })
  await removeBeta.focus()
  await keyboardPage.keyboard.press('Enter')
  const removeGamma = keyboardPage.getByRole('button', { name: 'Remove FocusGamma from Saved' })
  await removeGamma.waitFor({ state: 'visible' })
  check(await keyboardPage.locator('.name-card').count() === 2, 'middle keyboard removal leaves the two surrounding Saved cards')
  check(await removeGamma.evaluate((element) => document.activeElement === element), 'middle keyboard removal focuses the next Remove action')
  check(await removeGamma.evaluate((element) => element.matches(':focus-visible')), 'next Remove action has a visible keyboard indicator')

  await keyboardPage.keyboard.press('Enter')
  const removeAlpha = keyboardPage.getByRole('button', { name: 'Remove FocusAlpha from Saved' })
  await removeAlpha.waitFor({ state: 'visible' })
  check(await keyboardPage.locator('.name-card').count() === 1, 'last-index keyboard removal leaves the previous Saved card')
  check(await removeAlpha.evaluate((element) => document.activeElement === element), 'last-index keyboard removal focuses the previous Remove action')

  await keyboardPage.keyboard.press('Enter')
  const goCreate = keyboardPage.getByRole('button', { name: 'Go create' })
  await goCreate.waitFor({ state: 'visible' })
  check(await keyboardPage.locator('.name-card').count() === 0, 'final keyboard removal reaches the honest empty Saved state')
  await keyboardPage.waitForFunction(() => (
    document.activeElement instanceof HTMLButtonElement
    && document.activeElement.textContent?.includes('Go create')
  ), undefined, { timeout: 5000 }).catch(async () => {
    console.log('INFO  final removal active element', await keyboardPage.evaluate(() => ({
      tag: document.activeElement?.tagName,
      className: document.activeElement?.getAttribute('class'),
      text: document.activeElement?.textContent?.replace(/\s+/g, ' ').trim(),
    })))
  })
  check(await goCreate.evaluate((element) => document.activeElement === element && element.matches(':focus-visible')), 'final keyboard removal focuses the visible Go create action')
  check(await keyboardPage.evaluate(() => localStorage.getItem('neologism:imported-saved') === '[]'), 'all removals durably empty the imported Saved store')
  await keyboardContext.close()

  const pointerContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await seed(pointerContext, STUBS.slice(0, 1))
  const pointerPage = await pointerContext.newPage()
  pointerPage.on('pageerror', (error) => pageErrors.push(error.message))
  await pointerPage.goto(APP_URL)
  await pointerPage.getByRole('button', { name: /^Saved/ }).click()
  await pointerPage.getByRole('button', { name: 'Remove FocusAlpha from Saved' }).click()
  const pointerGoCreate = pointerPage.getByRole('button', { name: 'Go create' })
  await pointerGoCreate.waitFor({ state: 'visible' })
  check(await pointerGoCreate.evaluate((element) => document.activeElement !== element), 'pointer removal does not force focus onto Go create')
  check(await pointerPage.evaluate(() => scrollX === 0), 'pointer removal keeps the 390px viewport horizontally stable')
  await pointerContext.close()

  const failureContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await seed(failureContext, STUBS.slice(0, 1))
  await failureContext.addInitScript(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function setItem(key, value) {
      if (key === 'neologism:imported-saved') throw new DOMException('quota fixture', 'QuotaExceededError')
      return original.call(this, key, value)
    }
  })
  const failurePage = await failureContext.newPage()
  failurePage.on('pageerror', (error) => pageErrors.push(error.message))
  const alerts = []
  failurePage.on('dialog', async (dialog) => {
    alerts.push(dialog.message())
    await dialog.accept()
  })
  await failurePage.goto(APP_URL)
  await failurePage.getByRole('button', { name: /^Saved/ }).click()
  const failedRemove = failurePage.getByRole('button', { name: 'Remove FocusAlpha from Saved' })
  await failedRemove.focus()
  await failurePage.keyboard.press('Enter')
  await failurePage.waitForTimeout(100)
  check(alerts.length === 1 && alerts[0].includes('Could not remove this name completely'), 'failed durable removal exposes the existing exact recovery alert')
  check(await failurePage.locator('.name-card').count() === 1, 'failed durable removal keeps the Saved card visible')
  check(await failurePage.evaluate(() => JSON.parse(localStorage.getItem('neologism:imported-saved') ?? '[]').length === 1), 'failed durable removal keeps the imported record intact')
  check(await failedRemove.evaluate((element) => document.activeElement === element), 'failed durable removal preserves the invoking Remove focus')
  await failureContext.close()

  check(pageErrors.length === 0, 'keyboard and pointer removals produce zero page errors')
  check(checks === EXPECTED_CHECKS - 1, `fixture executes exactly ${EXPECTED_CHECKS} checks`)
} finally {
  await browser.close()
  server.kill()
}

if (checks !== EXPECTED_CHECKS || failures > 0) process.exitCode = 1
