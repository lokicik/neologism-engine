// Phase 177 browser contract: primary Create and AI Studio text fields keep
// stable purpose-specific accessible names after their placeholders disappear.
// Run after `npm run build`: node e2e/primary-textbox-names.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PORT = 4210
const APP_URL = `http://localhost:${PORT}`
const E2E_DIR = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = join(E2E_DIR, '..')
const viteCli = join(WEB_DIR, 'node_modules', 'vite', 'bin', 'vite.js')
const EXPECTED_CHECKS = 13

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
await context.addInitScript(() => {
  localStorage.setItem('neologism:visited', '1')
  localStorage.setItem('neologism:judge', JSON.stringify({
    enabled: true,
    provider: 'openrouter',
    apiKey: 'fixture-key',
    model: 'fixture-model',
  }))
})
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

async function storageSnapshot() {
  return page.evaluate(() => JSON.stringify({
    local: Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)]),
    session: Object.keys(sessionStorage).sort().map((key) => [key, sessionStorage.getItem(key)]),
  }))
}

try {
  await page.goto(APP_URL)
  const storageBefore = await storageSnapshot()

  const create = page.getByPlaceholder('What are you building? (optional)')
  check(await create.count() === 1 && await create.getAttribute('aria-label') === 'Project brief', 'Create exposes one purpose-named project brief field')
  check(await create.getAttribute('placeholder') === 'What are you building? (optional)', 'Create keeps its concise visible placeholder')
  await create.fill('an offline package security tool')
  check(await create.getAttribute('aria-label') === 'Project brief' && await create.inputValue() === 'an offline package security tool', 'Create keeps the same accessible name after text hides the placeholder')

  await page.getByRole('button', { name: 'AI Studio', exact: true }).click()
  const studioBrief = page.getByPlaceholder('What are you naming? (optional)')
  check(await studioBrief.count() === 1 && await studioBrief.getAttribute('aria-label') === 'AI Studio project brief', 'AI Studio exposes one distinct purpose-named project brief field')
  check(await studioBrief.getAttribute('placeholder') === 'What are you naming? (optional)', 'AI Studio keeps its concise visible placeholder')
  await studioBrief.fill('a calm team planning app')
  check(await studioBrief.getAttribute('aria-label') === 'AI Studio project brief' && await studioBrief.inputValue() === 'a calm team planning app', 'AI Studio brief keeps its name after typing')

  await page.getByRole('button', { name: '+ Custom', exact: true }).click()
  const custom = page.getByPlaceholder('rank by how … they sound (e.g. calm and minimal)')
  check(await custom.count() === 1 && await custom.getAttribute('aria-label') === 'Custom ranking criterion', 'Custom ranking exposes one purpose-named criterion field')
  check(await custom.getAttribute('placeholder') === 'rank by how … they sound (e.g. calm and minimal)', 'Custom ranking keeps its instructional placeholder')
  await custom.fill('trustworthy and concise')
  check(await custom.getAttribute('aria-label') === 'Custom ranking criterion' && await custom.inputValue() === 'trustworthy and concise', 'Custom criterion keeps its name after typing')

  check(await storageSnapshot() === storageBefore, 'typing in the three primary fields leaves browser storage unchanged')
  check(externalRequests.length === 0, 'field naming and typing send zero external HTTPS requests')
  check(pageErrors.length === 0, 'field naming and typing produce zero page errors')
  check(checks === EXPECTED_CHECKS - 1, `fixture executes exactly ${EXPECTED_CHECKS} checks`)
} finally {
  await context.close()
  await browser.close()
  server.kill()
}

if (checks !== EXPECTED_CHECKS || failures > 0) process.exitCode = 1
