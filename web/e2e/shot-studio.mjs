// Throwaway: verify the AI Studio (Phase 56) with a MOCKED LLM (no real key).
// Run: node e2e/shot-studio.mjs  (serves ./dist — build first)
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const PORT = 4180
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

// Mock the judge: rank input names in REVERSE so a re-rank is unmistakable.
async function mockJudge(page) {
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
}

try {
  // --- Configured: generate + rank by metric, switch metric ---
  {
    const ctx = await browser.newContext()
    await ctx.addInitScript(() => {
      localStorage.setItem('neologism:visited', '1')
      localStorage.setItem('neologism:judge', JSON.stringify({
        enabled: true, provider: 'openrouter', apiKey: 'test-key', model: 'mock-model',
      }))
    })
    const page = await ctx.newPage({ viewport: { width: 1440, height: 1000 } })
    await mockJudge(page)
    await page.goto(APP_URL)
    await page.waitForSelector('.command-bar')

    await page.click('.sidebar-item:has-text("AI Studio")')
    await page.waitForSelector('.ai-studio')
    const chips = await page.locator('.metric-chip').count()
    check(chips >= 7, `metric chips render (got ${chips})`)
    const sel = (await page.locator('.metric-chip.selected').textContent()) ?? ''
    check(sel.trim() === 'Brandable', `Brandable selected by default (got "${sel.trim()}")`)

    await page.click('.ai-studio .command-bar .command-go') // Generate
    await page.waitForSelector('.ai-studio .card-ai-reason', { timeout: 20000 })
    await page.waitForTimeout(400)
    const cards = await page.locator('.ai-studio .name-card').count()
    check(cards > 0, `AI-ranked pool rendered (got ${cards})`)
    check(await page.locator('.ai-studio .card-ai-reason').count() > 0, 'reasons rendered on cards')
    check(await page.locator('.ai-studio .card-aipick').count() === 1, 'exactly one AI-pick marker')
    const meta1 = (await page.locator('.studio-meta').textContent()) ?? ''
    check(/Ranked by\s*Brandable/.test(meta1), `"Ranked by Brandable" shown (got "${meta1.trim()}")`)
    await page.locator('.ai-studio').screenshot({ path: join(E2E_DIR, 'studio-01.png') })

    // Switch metric → re-ranks by the new criterion.
    await page.click('.metric-chip:has-text("Premium")')
    await page.waitForTimeout(600)
    const meta2 = (await page.locator('.studio-meta').textContent()) ?? ''
    check(/Ranked by\s*Premium/.test(meta2), `metric switch re-ranks (got "${meta2.trim()}")`)
    check(await page.locator('.ai-studio .card-ai-reason').count() > 0, 'reasons still present after switch')
    await ctx.close()
  }

  // --- Not configured: setup card ---
  {
    const ctx = await browser.newContext()
    await ctx.addInitScript(() => localStorage.setItem('neologism:visited', '1'))
    const page = await ctx.newPage({ viewport: { width: 1440, height: 1000 } })
    await page.goto(APP_URL)
    await page.waitForSelector('.command-bar')
    await page.click('.sidebar-item:has-text("AI Studio")')
    await page.waitForSelector('.ai-studio')
    check(await page.locator('.studio-setup').count() === 1, 'not-configured shows the setup card')
    await ctx.close()
  }

  console.log('screenshots: studio-01.png')
} catch (err) {
  console.error('SCRIPT ERROR:', err.message)
  failures++
} finally {
  await browser.close()
  if (process.platform === 'win32') spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { shell: true })
  else server.kill()
}

if (failures > 0) { console.error(`${failures} check(s) failed`); process.exitCode = 1 }
else console.log('studio e2e: all checks passed')
