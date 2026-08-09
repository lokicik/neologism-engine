// Throwaway: verify the Settings model picker (themed combobox + live list +
// price line) with a MOCKED /models endpoint. AI ranking itself is covered by
// shot-studio.mjs. Run: node e2e/shot-judge.mjs  (serves ./dist — build first)
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const PORT = 4178
const APP_URL = `http://localhost:${PORT}`
const E2E_DIR = dirname(fileURLToPath(import.meta.url))

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: join(E2E_DIR, '..'), shell: true, stdio: 'pipe',
})
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('vite preview did not start')), 20000)
  server.stdout.on('data', (d) => { if (d.toString().includes(String(PORT))) { clearTimeout(t); resolve() } })
  server.on('exit', () => reject(new Error('vite preview exited early')))
})

const browser = await chromium.launch()
let failures = 0
const check = (ok, label) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failures++ }

try {
  const ctx = await browser.newContext()
  await ctx.addInitScript(() => {
    localStorage.setItem('neologism:visited', '1')
    localStorage.setItem('neologism:judge', JSON.stringify({
      enabled: true, provider: 'openrouter', apiKey: 'test-key', model: 'mock/free-model:free',
    }))
  })
  const page = await ctx.newPage({ viewport: { width: 1440, height: 1000 } })

  // Mock the live model list (one free, one paid with pricing).
  await page.route('**/api/v1/models', async (route) => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: [
        { id: 'mock/free-model:free', name: 'Free Model', pricing: { prompt: '0', completion: '0' }, context_length: 131072 },
        { id: 'mock/paid-model', name: 'Paid Model', pricing: { prompt: '0.000003', completion: '0.000015' }, context_length: 200000 },
      ] }),
    })
  })

  await page.goto(APP_URL)
  await page.waitForSelector('.command-bar')

  // Settings: themed combobox populated from the live list, price line on a paid pick.
  await page.click('.sidebar-settings')
  await page.waitForSelector('.settings-modal')
  await page.waitForTimeout(600) // debounced model fetch
  await page.click('.model-combo input')
  await page.waitForTimeout(150)
  const optCount = await page.locator('.model-option').count()
  check(optCount >= 2, `model picker populated from live list (got ${optCount})`)
  await page.locator('.settings-modal').screenshot({ path: join(E2E_DIR, 'judge-01-settings.png') })
  await page.fill('.model-combo input', 'mock/paid-model')
  await page.waitForTimeout(150)
  const priceLines = await page.locator('.settings-field .settings-hint', { hasText: 'out' }).count()
  check(priceLines >= 1, 'selected paid model shows a price line')

  console.log('screenshots: judge-01-settings.png')
} catch (err) {
  console.error('SCRIPT ERROR:', err.message)
  failures++
} finally {
  await browser.close()
  if (process.platform === 'win32') spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { shell: true })
  else server.kill()
}

if (failures > 0) { console.error(`${failures} check(s) failed`); process.exitCode = 1 }
else console.log('judge e2e: all checks passed')
