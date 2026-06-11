// Self-verification harness (Phase 44): drives the built app in headless
// chromium, reproduces/verifies generation flows, and saves screenshots to
// web/e2e/shots/ for visual review.
//
// Usage:  node e2e/repro.mjs            (serves ./dist via `vite preview`)
// Exits non-zero when a More-names click yields no new cards AND no
// exhaustion notice — i.e. the dead-button bug.
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PORT = 4173
const APP_URL = `http://localhost:${PORT}`
const E2E_DIR = dirname(fileURLToPath(import.meta.url))
const SHOTS = join(E2E_DIR, 'shots')
const PROMPT = 'a marketplace for vintage keyboards'
const MORE_CLICKS = 8

mkdirSync(SHOTS, { recursive: true })

// Serve the production build.
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
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
let failed = false

try {
  await page.goto(APP_URL)

  // Fresh profile → landing. Enter the app.
  await page.click('.landing-cta', { timeout: 10000 })

  // Type the narrow prompt and generate.
  await page.fill('.command-input', PROMPT)
  await page.click('.command-go')
  await page.waitForSelector('.name-card', { timeout: 20000 })
  let count = await page.locator('.name-card').count()
  console.log(`generate #0: ${count} cards`)
  await page.screenshot({ path: join(SHOTS, '00-first-batch.png'), fullPage: true })

  for (let i = 1; i <= MORE_CLICKS; i++) {
    const before = await page.locator('.name-card').count()
    await page.click('.more-names-btn')
    // Wait for the click to settle (engine is fast; loading flips briefly).
    await page.waitForFunction(
      () => !document.querySelector('.more-names-btn')?.textContent?.includes('Generating'),
      { timeout: 20000 },
    )
    await page.waitForTimeout(400)
    const after = await page.locator('.name-card').count()
    const notice = await page.locator('.exhausted-notice').count()
    console.log(`more #${i}: ${before} -> ${after} cards${notice ? ' [exhaustion notice shown]' : ''}`)
    await page.screenshot({ path: join(SHOTS, `${String(i).padStart(2, '0')}-more.png`), fullPage: true })
    if (after === before && notice === 0) {
      console.error(`FAIL: more-names click #${i} produced nothing and no exhaustion notice`)
      failed = true
      break
    }
    if (notice > 0) {
      console.log('exhaustion notice shown — honest end of space; stopping')
      break
    }
  }
} catch (err) {
  console.error('SCRIPT ERROR:', err.message)
  failed = true
  await page.screenshot({ path: join(SHOTS, 'error.png'), fullPage: true }).catch(() => {})
} finally {
  await browser.close()
  // shell:true on Windows means server.pid is the cmd wrapper — kill the tree,
  // otherwise vite preview is orphaned and holds the port for the next run.
  if (process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { shell: true })
  } else {
    server.kill()
  }
}

process.exit(failed ? 1 : 0)
