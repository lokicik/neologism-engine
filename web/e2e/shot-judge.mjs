// Throwaway: verify the Phase 50 "Sharpen with AI" feature with a MOCKED LLM
// endpoint (no real key/server needed). Asserts the batch re-orders to the
// mocked ranking and a reason renders per card; screenshots the settings modal
// and a sharpened batch. Run: node e2e/shot-judge.mjs  (serves ./dist — build first)
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
    // Pre-configure the judge (OpenRouter path → no /models probe). Prompt keeps
    // {{names}} so the mock can read the candidate list back out.
    localStorage.setItem('neologism:judge', JSON.stringify({
      enabled: true, provider: 'openrouter', apiKey: 'test-key', model: 'mock-model',
      prompt: 'Rate these:\n{{names}}',
    }))
  })
  const page = await ctx.newPage({ viewport: { width: 1440, height: 1000 } })

  // Mock the LLM: parse the numbered names out of the prompt and rank them in
  // REVERSE (input #N gets the top score) so a successful re-rank is unmistakable.
  await page.route('**/chat/completions', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}')
    const content = body.messages?.[0]?.content ?? ''
    const names = [...content.matchAll(/^\s*\d+\.\s+(.+)$/gm)].map((m) => m[1].trim())
    const arr = names.map((_, i) => ({ i: i + 1, score: i + 1, reason: `mock reason ${i + 1}` }))
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { content: JSON.stringify(arr) } }] }),
    })
  })

  await page.goto(APP_URL)
  await page.waitForSelector('.command-bar')

  // Settings modal screenshot.
  await page.click('.sidebar-settings')
  await page.waitForSelector('.settings-modal')
  await page.locator('.settings-modal').screenshot({ path: join(E2E_DIR, 'judge-01-settings.png') })
  await page.keyboard.press('Escape')

  // Generate a batch, freeze it at the top so infinite-scroll won't append mid-test.
  await page.click('.command-go')
  await page.waitForSelector('.name-card')
  await page.waitForTimeout(1200)
  await page.evaluate(() => window.scrollTo(0, 0))
  const before = await page.$$eval('.name-text', (els) => els.map((e) => e.textContent))

  check(await page.locator('.sharpen-btn').count() === 1, 'Sharpen button visible when judge enabled')

  // Sharpen and assert the re-rank took effect.
  await page.click('.sharpen-btn')
  await page.waitForSelector('.card-ai-reason', { timeout: 10000 })
  await page.waitForTimeout(400)
  const after = await page.$$eval('.name-text', (els) => els.map((e) => e.textContent))
  const reasonCount = await page.locator('.card-ai-reason').count()
  const aiPickCount = await page.locator('.card-aipick').count()

  check(reasonCount > 0, `reasons rendered on cards (got ${reasonCount})`)
  check(aiPickCount === 1, `exactly one AI-pick marker (got ${aiPickCount})`)
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
