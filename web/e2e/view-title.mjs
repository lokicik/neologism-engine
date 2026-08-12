// Phase 171 browser contract: every top-level SPA view has a truthful browser
// title, while the Settings modal keeps its underlying page identity.
// Run after `npm run build`: node e2e/view-title.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PORT = 4207
const APP_URL = `http://localhost:${PORT}`
const E2E_DIR = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = join(E2E_DIR, '..')
const viteCli = join(WEB_DIR, 'node_modules', 'vite', 'bin', 'vite.js')
const EXPECTED_CHECKS = 11
const TITLES = {
  landing: 'Neologism Engine — Startup & Project Name Generator',
  create: 'Create — Neologism Engine',
  studio: 'AI Studio — Neologism Engine',
  saved: 'Saved — Neologism Engine',
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
const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await context.newPage()
let checks = 0
let failures = 0
const pageErrors = []
const externalRequests = []

page.on('pageerror', (error) => pageErrors.push(error.message))
page.on('request', (request) => {
  if (request.url().startsWith('https://')) externalRequests.push(request.url())
})

const check = (ok, label) => {
  checks++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) failures++
}

async function titleIs(expected) {
  await page.waitForFunction((title) => document.title === title, expected, { timeout: 750 }).catch(() => {})
  return await page.title() === expected
}

try {
  await page.goto(APP_URL)
  check(await titleIs(TITLES.landing), 'first visit exposes the Landing title')

  const enter = page.locator('.landing-cta').first()
  await enter.focus()
  await page.keyboard.press('Enter')
  check(await titleIs(TITLES.create), 'keyboard entry updates the browser title to Create')

  const studio = page.getByRole('button', { name: 'AI Studio', exact: true })
  await studio.focus()
  await page.keyboard.press('Enter')
  check(await titleIs(TITLES.studio), 'AI Studio navigation updates the browser title')

  const saved = page.getByRole('button', { name: /^Saved/ })
  await saved.focus()
  await page.keyboard.press('Space')
  check(await titleIs(TITLES.saved), 'Saved navigation updates the browser title')

  await page.locator('.sidebar-settings').click()
  await page.getByRole('dialog', { name: 'Settings' }).waitFor({ state: 'visible' })
  check(await titleIs(TITLES.saved), 'opening Settings keeps the underlying Saved page title')
  await page.getByRole('button', { name: 'Close settings' }).click()
  check(await titleIs(TITLES.saved), 'closing Settings leaves the Saved title unchanged')

  await page.getByRole('button', { name: 'Create', exact: true }).click()
  check(await titleIs(TITLES.create), 'pointer navigation returns the browser title to Create')

  await page.getByRole('button', { name: 'About', exact: true }).click()
  check(await titleIs(TITLES.landing), 'About navigation restores the Landing title')

  check(externalRequests.length === 0, 'view-title navigation sends zero external HTTPS requests')
  check(pageErrors.length === 0, 'view-title navigation produces zero page errors')
  check(checks === EXPECTED_CHECKS - 1, `fixture executes exactly ${EXPECTED_CHECKS} checks`)
} finally {
  await context.close()
  await browser.close()
  server.kill()
}

if (checks !== EXPECTED_CHECKS || failures > 0) process.exitCode = 1
