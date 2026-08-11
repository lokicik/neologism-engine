// Phase 157 browser contract: a rejected AI-settings write keeps the durable
// and in-memory config unchanged, remains visible, and supports an honest retry.
// Run after `npm run build`: node e2e/settings-storage-failure.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = 4216
const APP_URL = `http://localhost:${PORT}`
const E2E_DIR = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = join(E2E_DIR, '..')
const SHOTS = join(E2E_DIR, 'shots')
const viteCli = join(WEB_DIR, 'node_modules', 'vite', 'bin', 'vite.js')
const EXPECTED_CHECKS = 13
const OLD_CONFIG = {
  enabled: true,
  provider: 'openrouter',
  apiKey: 'old-fixture-key',
  model: 'mock/model',
}

mkdirSync(SHOTS, { recursive: true })

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

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await context.addInitScript(({ oldConfig }) => {
    const nativeSetItem = Storage.prototype.setItem
    if (localStorage.getItem('phase157:seeded') !== '1') {
      nativeSetItem.call(localStorage, 'neologism:visited', '1')
      nativeSetItem.call(localStorage, 'neologism:judge', JSON.stringify(oldConfig))
      nativeSetItem.call(localStorage, 'phase157:sentinel', 'unchanged')
      nativeSetItem.call(localStorage, 'phase157:seeded', '1')
    }
    const state = { judgeWrites: 0, remainingFailures: 1 }
    window.__phase157Storage = state
    Storage.prototype.setItem = function (key, value) {
      if (this === localStorage && key === 'neologism:judge') {
        state.judgeWrites++
        if (state.remainingFailures > 0) {
          state.remainingFailures--
          throw new DOMException('fixture quota rejection', 'QuotaExceededError')
        }
      }
      return nativeSetItem.call(this, key, value)
    }
  }, { oldConfig: OLD_CONFIG })
  await context.route('https://openrouter.ai/api/v1/models', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ data: [] }),
    })
  })

  const page = await context.newPage()
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.goto(APP_URL)
  const storageBefore = await page.evaluate(() => JSON.stringify(
    Object.fromEntries(Object.entries(localStorage).filter(([key]) => key !== 'neologism:judge')),
  ))
  const settingsTrigger = page.locator('.sidebar-settings')
  await settingsTrigger.click()
  const dialog = page.locator('.settings-modal[role="dialog"]')
  const apiKey = dialog.getByLabel('API key')
  await apiKey.fill('new-fixture-key')
  const save = dialog.getByRole('button', { name: 'Save', exact: true })
  await save.click()

  const alert = dialog.getByRole('alert')
  await alert.waitFor({ state: 'visible' })
  check(await dialog.isVisible(), 'rejected settings write keeps the dialog open')
  check(
    (await alert.textContent())?.trim() === 'Could not save AI settings. Browser storage kept the previous settings unchanged.',
    'rejected settings write exposes the exact durable-state error',
  )
  check(
    await save.evaluate((element) => document.activeElement === element),
    'failed Save preserves the invoking button focus',
  )
  const failedState = await page.evaluate(() => ({
    config: JSON.parse(localStorage.getItem('neologism:judge')),
    writes: window.__phase157Storage.judgeWrites,
  }))
  check(
    failedState.config.apiKey === OLD_CONFIG.apiKey && failedState.writes === 1,
    `first failure leaves the previous durable config intact (${JSON.stringify(failedState)})`,
  )
  check(await apiKey.inputValue() === 'new-fixture-key', 'failed Save keeps the edited draft available')
  await page.waitForFunction(() => {
    const modal = document.querySelector('.settings-modal')?.getBoundingClientRect()
    const button = document.activeElement?.getBoundingClientRect()
    return Boolean(modal && button && button.top >= modal.top && button.bottom <= modal.bottom)
  })
  check(
    await dialog.evaluate((modal) => {
      const boundary = modal.getBoundingClientRect()
      const error = modal.querySelector('[role="alert"]')?.getBoundingClientRect()
      const button = modal.querySelector('.settings-actions .command-go')?.getBoundingClientRect()
      return Boolean(error && button)
        && error.left >= boundary.left - 1
        && error.right <= boundary.right + 1
        && error.top >= boundary.top - 1
        && error.bottom <= boundary.bottom + 1
        && button.top >= boundary.top - 1
        && button.bottom <= boundary.bottom + 1
    }),
    '390px error and focused retry action stay visible inside Settings',
  )
  await dialog.screenshot({ path: join(SHOTS, 'settings-storage-failure-390.png') })

  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  check(
    await settingsTrigger.evaluate((element) => document.activeElement === element),
    'Cancel after a failed write restores the Settings opener',
  )
  await settingsTrigger.click()
  const reopened = page.locator('.settings-modal[role="dialog"]')
  check(
    await reopened.getByLabel('API key').inputValue() === OLD_CONFIG.apiKey,
    'cancelling after failure reveals no false in-memory config update',
  )

  await reopened.getByLabel('API key').fill('new-fixture-key')
  const retrySave = reopened.getByRole('button', { name: 'Save', exact: true })
  await retrySave.click()
  await reopened.waitFor({ state: 'detached' })
  const recoveredState = await page.evaluate(() => ({
    config: JSON.parse(localStorage.getItem('neologism:judge')),
    writes: window.__phase157Storage.judgeWrites,
  }))
  check(
    recoveredState.config.apiKey === 'new-fixture-key' && recoveredState.writes === 2,
    `successful retry persists the edited config exactly once (${JSON.stringify(recoveredState)})`,
  )
  check(
    await settingsTrigger.evaluate((element) => document.activeElement === element),
    'successful Save restores the Settings opener',
  )

  await page.reload()
  await page.locator('.sidebar-settings').click()
  check(
    await page.locator('.settings-modal').getByLabel('API key').inputValue() === 'new-fixture-key',
    'reload reads the successfully persisted config',
  )
  const storageAfter = await page.evaluate(() => JSON.stringify(
    Object.fromEntries(Object.entries(localStorage).filter(([key]) => key !== 'neologism:judge')),
  ))
  check(storageAfter === storageBefore, 'settings failure and retry leave every non-judge key byte-identical')
  check(pageErrors.length === 0, `settings failure and retry produce no page errors (${pageErrors.join(' | ')})`)
} finally {
  await browser.close()
  server.kill()
}

if (checks !== EXPECTED_CHECKS) {
  console.error(`FAIL  expected ${EXPECTED_CHECKS} checks, executed ${checks}`)
  process.exit(1)
}
if (failures > 0) process.exit(1)
console.log(`\nsettings storage failure: all checks passed (${checks}/${EXPECTED_CHECKS})`)
