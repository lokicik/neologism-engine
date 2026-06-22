// Throwaway: verify "Sharpen with AI" + Phase 52 (live model list, token/cost
// estimate, min-batch guard) with MOCKED endpoints (no real key/server). Run:
// node e2e/shot-judge.mjs  (serves ./dist — build first)
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const PORT = 4178
const APP_URL = `http://localhost:${PORT}`
const E2E_DIR = dirname(fileURLToPath(import.meta.url))

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: join(E2E_DIR, '..'),
  shell: true,
  stdio: 'pipe',
})
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('vite preview did not start')), 20000)
  server.stdout.on('data', (d) => {
    if (d.toString().includes(String(PORT))) { clearTimeout(t); resolve() }
  })
  server.on('exit', () => reject(new Error('vite preview exited early')))
})

const browser = await chromium.launch()
let failures = 0
const check = (ok, label) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failures++ }

try {
  const ctx = await browser.newContext()
  await ctx.addInitScript(() => {
    localStorage.setItem('neologism:visited', '1')
    // Seed an enabled judge with a FREE model so the main-screen estimate reads $0.
    localStorage.setItem('neologism:judge', JSON.stringify({
      enabled: true, provider: 'openrouter', apiKey: 'test-key',
      model: 'mock/free-model:free', priceIn: 0, priceOut: 0,
      prompt: 'Rate these:\n{{names}}',
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
  // Mock the judge: rank input names in REVERSE so a re-rank is unmistakable.
  await page.route('**/chat/completions', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}')
    const content = body.messages?.[0]?.content ?? ''
    const names = [...content.matchAll(/^\s*\d+\.\s+(.+)$/gm)].map((m) => m[1].trim())
    const arr = names.map((_, i) => ({ i: i + 1, score: i + 1, reason: `mock reason ${i + 1}` }))
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { content: JSON.stringify(arr) } }] }),
    })
  })

  await page.goto(APP_URL)
  await page.waitForSelector('.command-bar')

  // Settings: live model list populated, price line on selecting a paid model.
  await page.click('.sidebar-settings')
  await page.waitForSelector('.settings-modal')
  await page.waitForTimeout(600) // debounced model fetch
  const optCount = await page.locator('#judge-models option').count()
  check(optCount >= 2, `model picker populated from live list (got ${optCount})`)
  await page.fill('input[list="judge-models"]', 'mock/paid-model')
  await page.waitForTimeout(150)
  const priceLines = await page.locator('.settings-field .settings-hint', { hasText: 'out' }).count()
  check(priceLines >= 1, 'selected paid model shows a price line')
  await page.locator('.settings-modal').screenshot({ path: join(E2E_DIR, 'judge-01-settings.png') })
  await page.keyboard.press('Escape') // cancel — keeps the seeded free model

  // Guard: no Sharpen bar before any results (0 < MIN_SHARPEN).
  check(await page.locator('.sharpen-bar').count() === 0, 'Sharpen hidden before any results (min-batch guard)')

  // Generate, freeze at top.
  await page.click('.command-go')
  await page.waitForSelector('.name-card')
  await page.waitForTimeout(1200)
  await page.evaluate(() => window.scrollTo(0, 0))

  const estText = (await page.locator('.sharpen-est').textContent()) ?? ''
  check(/tok/.test(estText), `token estimate shown (got "${estText}")`)
  check(estText.includes('$0'), `free model estimate shows $0 (got "${estText}")`)

  const before = await page.$$eval('.name-text', (els) => els.map((e) => e.textContent))
  await page.click('.sharpen-btn')
  await page.waitForSelector('.card-ai-reason', { timeout: 10000 })
  await page.waitForTimeout(400)
  const after = await page.$$eval('.name-text', (els) => els.map((e) => e.textContent))
  check(await page.locator('.card-ai-reason').count() > 0, 'reasons rendered on cards')
  check(await page.locator('.card-aipick').count() === 1, 'exactly one AI-pick marker')
  check(before.length > 1 && after[0] === before[before.length - 1],
    `re-rank reordered: first-after "${after[0]}" == last-before "${before[before.length - 1]}"`)

  await page.locator('.canvas').screenshot({ path: join(E2E_DIR, 'judge-02-sharpened.png') })
  console.log('screenshots: judge-01-settings.png, judge-02-sharpened.png')
} catch (err) {
  console.error('SCRIPT ERROR:', err.message)
  failures++
} finally {
  await browser.close()
  if (process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { shell: true })
  } else {
    server.kill()
  }
}

if (failures > 0) { console.error(`${failures} check(s) failed`); process.exitCode = 1 }
else console.log('judge e2e: all checks passed')
