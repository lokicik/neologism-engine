// Phase 170 browser contract: the visual sidebar selection is also announced
// as exactly one current SPA page without changing native button focus.
// Run after `npm run build`: node e2e/sidebar-current-view.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PORT = 4206
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
const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
await context.addInitScript(() => localStorage.setItem('neologism:visited', '1'))
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

async function currentButtons() {
  return page.locator('.sidebar button[aria-current="page"]')
}

try {
  await page.goto(APP_URL)
  const storageBefore = await page.evaluate(() => JSON.stringify({
    local: Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)]),
    session: Object.keys(sessionStorage).sort().map((key) => [key, sessionStorage.getItem(key)]),
  }))
  const nav = page.getByRole('navigation', { name: 'Application navigation' })
  check(await nav.count() === 1, 'sidebar exposes one named application navigation landmark')

  const create = page.getByRole('button', { name: 'Create', exact: true })
  const studio = page.getByRole('button', { name: 'AI Studio', exact: true })
  const saved = page.getByRole('button', { name: /^Saved/ })
  check(await (await currentButtons()).count() === 1, 'exactly one sidebar action is announced as the current page initially')
  check(await create.getAttribute('aria-current') === 'page', 'Create is the announced initial page')

  await studio.focus()
  await page.keyboard.press('Enter')
  check(await studio.getAttribute('aria-current') === 'page' && await (await currentButtons()).count() === 1, 'keyboard navigation moves the sole current-page state to AI Studio')
  check(await studio.evaluate((element) => document.activeElement === element && element.matches(':focus-visible')), 'AI Studio navigation preserves its native visible focus')

  await saved.focus()
  await page.keyboard.press('Space')
  check(await saved.getAttribute('aria-current') === 'page' && await (await currentButtons()).count() === 1, 'Space navigation moves the sole current-page state to Saved')
  check(await saved.evaluate((element) => document.activeElement === element && element.matches(':focus-visible')), 'Saved navigation preserves its native visible focus')

  const settings = page.locator('.sidebar-settings')
  await settings.click()
  await page.getByRole('dialog', { name: 'Settings' }).waitFor({ state: 'visible' })
  check(await saved.getAttribute('aria-current') === 'page' && await (await currentButtons()).count() === 1, 'opening the Settings modal does not claim or erase the current Saved page')
  await page.getByRole('button', { name: 'Close settings' }).click()

  await create.click()
  check(await create.getAttribute('aria-current') === 'page' && await (await currentButtons()).count() === 1, 'pointer navigation returns the sole current-page state to Create')

  const storageAfter = await page.evaluate(() => JSON.stringify({
    local: Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)]),
    session: Object.keys(sessionStorage).sort().map((key) => [key, sessionStorage.getItem(key)]),
  }))
  check(storageAfter === storageBefore && externalRequests.length === 0, 'sidebar state navigation leaves storage unchanged and sends zero external HTTPS requests')
  check(pageErrors.length === 0, 'keyboard, pointer, and modal navigation produce zero page errors')
  check(checks === EXPECTED_CHECKS - 1, `fixture executes exactly ${EXPECTED_CHECKS} checks`)
} finally {
  await context.close()
  await browser.close()
  server.kill()
}

if (checks !== EXPECTED_CHECKS || failures > 0) process.exitCode = 1
