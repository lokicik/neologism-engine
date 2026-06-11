// Guided UX walk (Phase 45): screenshots every key state of the app so design
// regressions are caught by eye. Run: node e2e/explore.mjs  (serves ./dist)
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PORT = 4174
const APP_URL = `http://localhost:${PORT}`
const E2E_DIR = dirname(fileURLToPath(import.meta.url))
const SHOTS = join(E2E_DIR, 'shots', 'explore')

mkdirSync(SHOTS, { recursive: true })

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
const shot = (name) => page.screenshot({ path: join(SHOTS, `${name}.png`) })

try {
  // Landing
  await page.goto(APP_URL)
  await page.waitForTimeout(1500) // let the decode hero + wall come up
  await shot('01-landing-hero')
  await page.evaluate(() => document.querySelector('.bento')?.scrollIntoView())
  await page.waitForTimeout(600)
  await shot('02-landing-bento')

  // Enter app — empty state
  await page.click('.landing-cta')
  await page.waitForSelector('.command-bar')
  await shot('03-app-empty')

  // Generate (no prompt)
  await page.click('.command-go')
  await page.waitForSelector('.name-card', { timeout: 20000 })
  await shot('04-results')

  // Chip menus
  await page.click('.chips-row .chip-wrap:nth-child(1) .chip')
  await shot('05-menu-mode')
  await page.keyboard.press('Escape')
  await page.click('.chips-row .chip-wrap:nth-child(4) .chip')
  await shot('06-menu-advanced')
  await page.keyboard.press('Escape')

  // Card expansions
  const card = page.locator('.name-card').first()
  await card.locator('.card-chip', { hasText: 'Why' }).click()
  await page.waitForTimeout(400)
  await card.locator('.card-chip', { hasText: 'Availability' }).click()
  await page.waitForTimeout(2500) // let checks come back
  await shot('07-card-expanded')

  // Star two names — nav shift check: nav box before/after
  const navBefore = await page.locator('.workspace-nav').boundingBox()
  await page.locator('.name-card .star-btn').nth(0).click()
  await page.locator('.name-card .star-btn').nth(1).click()
  const navAfter = await page.locator('.workspace-nav').boundingBox()
  console.log(`nav height before star: ${navBefore?.height}, after: ${navAfter?.height}`)
  if (navBefore && navAfter && Math.abs(navBefore.height - navAfter.height) > 0.5) {
    console.error('FINDING: nav height changes when the saved chip appears (page shift)')
  }
  await shot('08-after-star')

  // Drawer
  await page.click('.nav-cta', { timeout: 5000 })
  await page.waitForSelector('.drawer')
  await page.waitForTimeout(300)
  await shot('09-drawer')

  // Remove one favorite from the drawer
  await page.locator('.favorites-item button').last().click()
  await page.waitForTimeout(300)
  await shot('10-drawer-after-remove')
  await page.keyboard.press('Escape')

  // Mobile pass
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(400)
  await shot('11-mobile-dashboard')
  await page.click('.nav-cta')
  await page.waitForSelector('.drawer')
  await page.waitForTimeout(300)
  await shot('12-mobile-drawer')

  console.log('explore complete — review shots in', SHOTS)
} catch (err) {
  console.error('SCRIPT ERROR:', err.message)
  await shot('error').catch(() => {})
} finally {
  await browser.close()
  if (process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { shell: true })
  } else {
    server.kill()
  }
}
