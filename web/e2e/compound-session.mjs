// Browser regression for a long, description-driven Compound session.
// Run after `npm run build`: node e2e/compound-session.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PORT = 4184
const APP_URL = `http://localhost:${PORT}`
const E2E_DIR = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = join(E2E_DIR, '..')
const viteCli = join(WEB_DIR, 'node_modules', 'vite', 'bin', 'vite.js')
const DESCRIPTION = 'a secure password manager for teams'
const SECURITY_NOUNS = new Set(['vault', 'guard', 'shield', 'lock', 'cipher'])

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
let failures = 0
const check = (ok, label) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) failures++
}

function compoundNoun(name) {
  const boundary = [...name.slice(1)].findIndex((character) => /[A-Z]/.test(character))
  return boundary < 0 ? '' : name.slice(boundary + 1).toLowerCase()
}

try {
  const context = await browser.newContext()
  await context.addInitScript(() => localStorage.setItem('neologism:visited', '1'))
  const page = await context.newPage({ viewport: { width: 1440, height: 1000 } })
  await page.goto(APP_URL)
  await page.fill('.command-input', DESCRIPTION)
  await page.locator('.mode-pill').filter({ hasText: 'Compound' }).click()
  await page.click('.command-go')
  await page.waitForFunction(() => document.querySelectorAll('.name-card').length === 10, undefined, {
    timeout: 20000,
  })
  check(await page.locator('.name-card').count() === 10, 'the first Compound batch contains ten names')

  for (let attempt = 0; attempt < 12; attempt++) {
    const before = await page.locator('.name-card').count()
    if (before >= 100) break
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForFunction(
      (previous) => document.querySelectorAll('.name-card').length > previous,
      before,
      { timeout: 6000 },
    )
  }

  const names = await page.locator('.name-text').allTextContents()
  const lowered = names.map((name) => name.toLowerCase())
  const unrelated = names.filter((name) => !SECURITY_NOUNS.has(compoundNoun(name)))
  check(names.length >= 100, `Compound infinite scroll reaches at least 100 names (got ${names.length})`)
  check(new Set(lowered).size === names.length, 'the Compound session contains no repeated names')
  check(unrelated.length === 0, `every Compound noun stays tied to security (unrelated: ${unrelated.join(', ') || 'none'})`)
  check(await page.locator('.exhausted-notice').count() === 0, 'the Compound brief is not falsely marked exhausted')
  await context.close()
} catch (error) {
  console.error('SCRIPT ERROR:', error.message)
  failures++
} finally {
  await browser.close()
  if (process.platform === 'win32') spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
  else server.kill()
}

if (failures > 0) {
  console.error(`compound session e2e: ${failures} check(s) failed`)
  process.exitCode = 1
} else {
  console.log('compound session e2e: all checks passed')
}
