// Phase 172 browser contract: every top-level SPA view exposes exactly one
// truthful h1 without changing the Create command-bar layout.
// Run after `npm run build`: node e2e/page-heading.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PORT = 4208
const APP_URL = `http://localhost:${PORT}`
const E2E_DIR = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = join(E2E_DIR, '..')
const viteCli = join(WEB_DIR, 'node_modules', 'vite', 'bin', 'vite.js')
const EXPECTED_CHECKS = 10

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

async function hasOneHeading(name) {
  const headings = page.getByRole('heading', { level: 1 })
  return await headings.count() === 1 && await headings.first().textContent() === name
}

try {
  await page.goto(APP_URL)
  check(await hasOneHeading('Name your next big thing.'), 'Landing exposes exactly one truthful h1')

  await page.locator('.landing-cta').first().click()
  check(await hasOneHeading('Create names'), 'Create exposes exactly one truthful h1')
  const createHeading = page.getByRole('heading', { level: 1, name: 'Create names' })
  const hiddenWithoutLayout = await createHeading.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    return style.position === 'absolute'
      && style.display !== 'none'
      && style.visibility !== 'hidden'
      && rect.width <= 1
      && rect.height <= 1
  }).catch(() => false)
  check(hiddenWithoutLayout, 'Create h1 remains accessible while occupying no command-bar layout space')

  await page.getByRole('button', { name: 'AI Studio', exact: true }).click()
  check(await hasOneHeading('✨ AI Studio'), 'AI Studio retains exactly one truthful h1')

  await page.getByRole('button', { name: /^Saved/ }).click()
  check(await hasOneHeading('Saved names'), 'Saved retains exactly one truthful h1')

  await page.locator('.sidebar-settings').click()
  await page.getByRole('dialog', { name: 'Settings' }).waitFor({ state: 'visible' })
  check(await hasOneHeading('Saved names'), 'Settings leaves the underlying Saved h1 contract intact')
  await page.getByRole('button', { name: 'Close settings' }).click()

  await page.getByRole('button', { name: 'Create', exact: true }).click()
  check(await hasOneHeading('Create names'), 'pointer return restores the Create h1 contract')

  check(externalRequests.length === 0, 'heading navigation sends zero external HTTPS requests')
  check(pageErrors.length === 0, 'heading navigation produces zero page errors')
  check(checks === EXPECTED_CHECKS - 1, `fixture executes exactly ${EXPECTED_CHECKS} checks`)
} finally {
  await context.close()
  await browser.close()
  server.kill()
}

if (checks !== EXPECTED_CHECKS || failures > 0) process.exitCode = 1
