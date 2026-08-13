// Prompting-logic regressions (Phase 48): single-keyword prompts must
// generate, no stem family may wall a batch, the keyword line must render,
// and Real-words mode must say it ignores the description.
// Run: node e2e/prompts.mjs  (serves ./dist)
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const PORT = 4176
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
const check = (ok, label) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) failures++
}

// Fresh context per scenario: clean localStorage, landing skipped.
async function freshPage() {
  const ctx = await browser.newContext()
  await ctx.addInitScript(() => localStorage.setItem('neologism:visited', '1'))
  const page = await ctx.newPage({ viewport: { width: 1440, height: 1000 } })
  await page.goto(APP_URL)
  await page.waitForSelector('.command-bar')
  return { ctx, page }
}

async function generateWith(page, prompt) {
  await page.fill('.command-input', prompt)
  await page.click('.command-go')
  return Promise.race([
    page.waitForSelector('.name-card', { timeout: 20000 }).then(() => 'cards'),
    page.waitForSelector('.exhausted-notice', { timeout: 20000 }).then(() => 'exhausted'),
    page.waitForSelector('.error-banner', { timeout: 20000 }).then(() => 'error'),
  ]).catch(() => 'timeout')
}

try {
  // 1. Single-keyword prompt generates a full batch on a fresh session.
  {
    const { ctx, page } = await freshPage()
    const res = await generateWith(page, 'fitness')
    check(res === 'cards', `"fitness" generates cards (got: ${res})`)
    if (res === 'cards') {
      await page.waitForTimeout(600) // infinite scroll may auto-fill the viewport
      const n = await page.locator('.name-card').count()
      check(n >= 10 && n % 10 === 0, `"fitness" yields full batches (got ${n})`)
    }
    await ctx.close()
  }

  // 2. No stem family walls the batch; keyword line renders.
  {
    const { ctx, page } = await freshPage()
    const res = await generateWith(page, 'a marketplace for vintage keyboards')
    check(res === 'cards', `marketplace prompt generates cards (got: ${res})`)
    if (res === 'cards') {
      await page.waitForTimeout(600) // let any viewport auto-fill settle
      const names = await page.$$eval('.name-text', (els) => els.map((e) => e.textContent ?? ''))
      const counts = {}
      for (const n of names) {
        const p = n.toLowerCase().slice(0, 4)
        counts[p] = (counts[p] ?? 0) + 1
      }
      const worst = Math.max(...Object.values(counts))
      check(worst <= Math.ceil(names.length * 0.4),
        `no 4-char prefix on >40% of cards (worst ${worst}/${names.length}: ${names.join(', ')})`)

      const kwLine = await page.locator('.keyword-line').textContent().catch(() => null)
      check(Boolean(kwLine && kwLine.includes('keyboard')),
        `keyword line shows "keyboard" (got: ${kwLine})`)
    }
    await ctx.close()
  }

  // 3. Real-words mode + description shows the honest hint.
  {
    const { ctx, page } = await freshPage()
    await page.fill('.command-input', 'a journaling app with mood insights')
    await page.click('.mode-pill:has-text("Real words")')
    const note = await page.locator('.mode-note').textContent().catch(() => null)
    check(Boolean(note && note.includes('isn’t used')), `realword hint visible (got: ${note})`)
    await ctx.close()
  }
  // 4. A long unbroken user term may exhaust the naming space, but its
  // rendered keyword must not widen the 320px product shell.
  {
    const { ctx, page } = await freshPage()
    await page.setViewportSize({ width: 320, height: 700 })
    const token = 'x'.repeat(80)
    const res = await generateWith(page, `a ${token} tool`)
    check(res === 'cards' || res === 'exhausted', `long unbroken prompt settles honestly (got: ${res})`)
    const evidence = await page.locator('.keyword-line').evaluate((element) => ({
      text: element.textContent,
      viewport: innerWidth,
      htmlWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }))
    check(
      evidence.text?.includes(token)
        && evidence.htmlWidth <= evidence.viewport
        && evidence.bodyWidth <= evidence.viewport
        && evidence.scrollWidth <= evidence.clientWidth + 1,
      `80-character keyword stays wrapped inside the 320px document (${JSON.stringify(evidence)})`,
    )
    await ctx.close()
  }
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

if (failures > 0) {
  console.error(`${failures} check(s) failed`)
  process.exitCode = 1
} else {
  console.log('prompts e2e: all checks passed')
}
