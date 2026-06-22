// Throwaway: verify Auto-mode-as-default + the dev-naming positioning. Run:
// node e2e/shot-auto.mjs  (serves ./dist — build first)
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const PORT = 4179
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
  // --- Landing (first visit): dev-naming copy ---
  {
    const ctx = await browser.newContext()
    const page = await ctx.newPage({ viewport: { width: 1440, height: 1000 } })
    await page.goto(APP_URL)
    await page.waitForSelector('.landing-hero')
    const sub = (await page.locator('.hero-sub').textContent()) ?? ''
    check(/packages/i.test(sub) && /crates\.io/i.test(sub), `hero subcopy names the dev audience (got "${sub.trim()}")`)
    const devLabel = await page.locator('.check-group-label', { hasText: 'Dev namespaces' }).count()
    check(devLabel >= 1, 'availability tile bills "Dev namespaces"')
    await page.screenshot({ path: join(E2E_DIR, 'auto-01-landing.png') })
    await ctx.close()
  }

  // --- App: Auto is default, blends a batch, dev-namespace card sections ---
  {
    const ctx = await browser.newContext()
    await ctx.addInitScript(() => localStorage.setItem('neologism:visited', '1'))
    const page = await ctx.newPage({ viewport: { width: 1440, height: 1000 } })
    await page.goto(APP_URL)
    await page.waitForSelector('.command-bar')

    const selected = (await page.locator('.mode-pill.selected .mode-pill-label').textContent()) ?? ''
    check(selected.trim() === 'Auto', `Auto is the default mode (got "${selected.trim()}")`)

    await page.click('.command-go')
    await page.waitForSelector('.name-card', { timeout: 20000 })
    await page.waitForTimeout(800)
    const n = await page.locator('.name-card').count()
    check(n >= 8, `Auto produced a full blended batch (got ${n})`)
    await page.screenshot({ path: join(E2E_DIR, 'auto-02-batch.png') })

    // Switch to a single mode — still works.
    await page.click('.mode-pill:has-text("Brandable")')
    await page.click('.command-go')
    await page.waitForSelector('.name-card', { timeout: 20000 })
    check(await page.locator('.name-card').count() > 0, 'switching to Brandable still generates')

    // Dev-namespace section in a card's availability.
    const card = page.locator('.name-card').first()
    await card.locator('.card-chip', { hasText: 'Availability' }).click()
    await page.waitForTimeout(300)
    check(await card.locator('.avail-label', { hasText: 'Dev namespaces' }).count() >= 1,
      'card availability leads with a "Dev namespaces" section')
    await page.waitForTimeout(3500) // let a few checks resolve for the screenshot
    await card.screenshot({ path: join(E2E_DIR, 'auto-03-card-availability.png') })
    await ctx.close()
  }

  console.log('screenshots: auto-01-landing.png, auto-02-batch.png, auto-03-card-availability.png')
} catch (err) {
  console.error('SCRIPT ERROR:', err.message)
  failures++
} finally {
  await browser.close()
  if (process.platform === 'win32') spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { shell: true })
  else server.kill()
}

if (failures > 0) { console.error(`${failures} check(s) failed`); process.exitCode = 1 }
else console.log('auto e2e: all checks passed')
