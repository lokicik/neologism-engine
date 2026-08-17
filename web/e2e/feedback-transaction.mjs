// Phase 153 browser contract: like/pass persistence failures never leave one
// scoped name durably liked and passed, and every failure is visibly reported.
// Run after `npm run build`: node e2e/feedback-transaction.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PORT = 4212
const APP_URL = `http://localhost:${PORT}`
const PROMPT = 'a secure developer project for offline code review'
const E2E_DIR = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = join(E2E_DIR, '..')
const viteCli = join(WEB_DIR, 'node_modules', 'vite', 'bin', 'vite.js')
const EXPECTED_CHECKS = 20

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
let checks = 0
let failures = 0
const pageErrors = []
const unexpectedExternal = []

const check = (ok, label) => {
  checks++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) failures++
}

async function createContext({ judge = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await context.addInitScript(({ withJudge }) => {
    const originalSetItem = Storage.prototype.setItem
    originalSetItem.call(localStorage, 'neologism:visited', '1')
    Math.random = () => 0.125
    Object.defineProperty(Crypto.prototype, 'getRandomValues', {
      configurable: true,
      value(array) {
        for (let index = 0; index < array.length; index++) {
          array[index] = (17 + index * 31) & 0xff
        }
        return array
      },
    })
    if (withJudge) {
      originalSetItem.call(localStorage, 'neologism:judge', JSON.stringify({
        enabled: true,
        provider: 'openrouter',
        apiKey: 'fixture-key',
        model: 'fixture-model',
      }))
    }
  }, { withJudge: judge })
  await context.route('https://**/*', async (route) => {
    if (judge && route.request().url().endsWith('/chat/completions')) {
      const body = JSON.parse(route.request().postData() ?? '{}')
      const content = body.messages?.[0]?.content ?? ''
      const names = [...content.matchAll(/^\s*\d+\.\s+(.+)$/gm)].map((match) => match[1].trim())
      const ranked = names.map((_, index) => ({
        i: index + 1,
        score: 10 - (index * 9) / Math.max(names.length - 1, 1),
        reason: `fixture-${index + 1}`,
      }))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ choices: [{ message: { content: JSON.stringify(ranked) } }] }),
      })
      return
    }
    unexpectedExternal.push(route.request().url())
    await route.abort('blockedbyclient')
  })
  return context
}

async function openCreate(context) {
  const page = await context.newPage()
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.goto(APP_URL)
  await page.locator('.command-input').fill(PROMPT)
  await page.locator('.command-go').click()
  await page.waitForSelector('.name-card', { timeout: 20000 })
  return page
}

async function currentCard(page, name = null) {
  return name
    ? page.locator('.name-card').filter({ hasText: name })
    : page.locator('.name-card').first()
}

async function feedbackRows(page) {
  return page.evaluate(() => ({
    favorites: JSON.parse(localStorage.getItem('neologism:favorites') ?? '[]'),
    rejected: JSON.parse(localStorage.getItem('neologism:rejected') ?? '[]'),
  }))
}

async function installWriteFailures(page, { favorites = [], rejected = [] }) {
  await page.evaluate(({ favoriteCalls, rejectedCalls }) => {
    const original = Storage.prototype.setItem
    const counts = { favorites: 0, rejected: 0 }
    Object.defineProperty(globalThis, '__feedbackWriteCounts', { value: counts, configurable: true })
    Storage.prototype.setItem = function setItem(key, value) {
      if (key === 'neologism:favorites') {
        counts.favorites++
        if (favoriteCalls.includes(counts.favorites)) {
          throw new DOMException('fixture quota', 'QuotaExceededError')
        }
      }
      if (key === 'neologism:rejected') {
        counts.rejected++
        if (rejectedCalls.includes(counts.rejected)) {
          throw new DOMException('fixture quota', 'QuotaExceededError')
        }
      }
      return original.call(this, key, value)
    }
  }, { favoriteCalls: favorites, rejectedCalls: rejected })
}

async function reloadCreate(page, name) {
  await page.evaluate(() => localStorage.removeItem('neologism:recent'))
  await page.reload()
  await page.locator('.command-input').fill(PROMPT)
  await page.locator('.command-go').click()
  await page.waitForSelector('.name-card', { timeout: 20000 })
  return currentCard(page, name)
}

async function state(card) {
  return {
    favorite: await card.locator('.star-btn').getAttribute('aria-pressed'),
    rejected: await card.locator('.pass-btn').getAttribute('aria-pressed'),
  }
}

try {
  // liked -> passed: target write fails, compensating rollback succeeds.
  {
    const context = await createContext()
    const page = await openCreate(context)
    const card = await currentCard(page)
    const name = (await card.locator('.name-text').textContent())?.trim() ?? ''
    await card.locator('.star-btn').click()
    await installWriteFailures(page, { rejected: [1] })
    const pass = card.locator('.pass-btn')
    await pass.focus()
    await page.keyboard.press('Enter')
    const alert = page.getByRole('alert')
    await alert.waitFor({ state: 'visible' })
    const rows = await feedbackRows(page)
    check(
      rows.favorites.length === 1 && rows.rejected.length === 0,
      'failed liked-to-passed target write restores the durable like',
    )
    check(
      JSON.stringify(await state(card)) === JSON.stringify({ favorite: 'true', rejected: 'false' }),
      'rollback-success UI remains liked-only instead of showing both labels',
    )
    check(
      (await alert.textContent())?.includes(`Could not update feedback for ${name}. Browser storage kept the previous choice.`),
      'rollback success exposes the exact durable-state message',
    )
    check(await pass.evaluate((button) => document.activeElement === button), 'failure keeps focus on the invoking pass control')
    const restored = await reloadCreate(page, name)
    check(
      JSON.stringify(await state(restored)) === JSON.stringify({ favorite: 'true', rejected: 'false' })
        && await page.getByRole('alert').count() === 0,
      'reload preserves the restored like and does not persist the transient alert',
    )
    await context.close()
  }

  // passed -> liked: symmetric target write failure restores the pass.
  {
    const context = await createContext()
    const page = await openCreate(context)
    const card = await currentCard(page)
    const name = (await card.locator('.name-text').textContent())?.trim() ?? ''
    await card.locator('.pass-btn').click()
    await installWriteFailures(page, { favorites: [1] })
    const star = card.locator('.star-btn')
    await star.focus()
    await page.keyboard.press('Enter')
    const alert = page.getByRole('alert')
    await alert.waitFor({ state: 'visible' })
    const rows = await feedbackRows(page)
    check(
      rows.favorites.length === 0 && rows.rejected.length === 1,
      'failed passed-to-liked target write restores the durable pass',
    )
    check(
      JSON.stringify(await state(card)) === JSON.stringify({ favorite: 'false', rejected: 'true' }),
      'symmetric rollback UI remains passed-only',
    )
    check(
      (await alert.textContent())?.includes(`Could not update feedback for ${name}. Browser storage kept the previous choice.`),
      'symmetric failure exposes the same previous-choice contract',
    )
    check(await star.evaluate((button) => document.activeElement === button), 'failure keeps focus on the invoking star control')
    await context.close()
  }

  // The target write and compensating rollback both fail: neutral is honest.
  {
    const context = await createContext()
    const page = await openCreate(context)
    const card = await currentCard(page)
    const name = (await card.locator('.name-text').textContent())?.trim() ?? ''
    await card.locator('.star-btn').click()
    await installWriteFailures(page, { favorites: [2], rejected: [1] })
    await card.locator('.pass-btn').click()
    const alert = page.getByRole('alert')
    await alert.waitFor({ state: 'visible' })
    const rows = await feedbackRows(page)
    check(rows.favorites.length === 0 && rows.rejected.length === 0, 'double failure leaves an honest neutral durable state')
    check(
      JSON.stringify(await state(card)) === JSON.stringify({ favorite: 'false', rejected: 'false' }),
      'double-failure UI reconciles to neutral instead of claiming rollback succeeded',
    )
    check(
      (await alert.textContent())?.includes('browser storage could not restore the previous choice. The name is now neutral.'),
      'rollback failure explains the neutral recovery boundary',
    )
    const box = await alert.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return { left: rect.left, right: rect.right, top: rect.top, width: innerWidth }
    })
    check(box.left >= -1 && box.right <= box.width + 1 && box.top >= -1, `390px sticky feedback alert is visible and contained (${JSON.stringify(box)})`)
    await page.screenshot({ path: join(E2E_DIR, 'shots', 'feedback-rollback-failure-390.png'), fullPage: true })
    const restored = await reloadCreate(page, name)
    check(
      JSON.stringify(await state(restored)) === JSON.stringify({ favorite: 'false', rejected: 'false' }),
      'neutral rollback-failure state survives reload without resurrection',
    )
    await context.close()
  }

  // Studio uses the same App-owned persistence and global error surface.
  {
    const context = await createContext({ judge: true })
    const page = await context.newPage()
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await page.goto(APP_URL)
    await page.getByRole('button', { name: /^AI Studio$/ }).click()
    await page.getByRole('button', { name: 'Generate' }).click()
    await page.waitForFunction(() => document.querySelectorAll('.ai-studio .name-card').length === 24)
    const card = page.locator('.ai-studio .name-card').first()
    const name = (await card.locator('.name-text').textContent())?.trim() ?? ''
    await installWriteFailures(page, { favorites: [1] })
    const star = card.locator('.star-btn')
    await star.focus()
    await page.keyboard.press('Enter')
    const alert = page.getByRole('alert')
    await alert.waitFor({ state: 'visible' })
    const rows = await feedbackRows(page)
    check(rows.favorites.length === 0 && rows.rejected.length === 0, 'Studio single-key failure leaves durable feedback unchanged')
    check(await star.getAttribute('aria-pressed') === 'false', 'Studio star does not claim a failed write succeeded')
    check(
      (await alert.textContent())?.includes(`Could not update feedback for ${name}. Browser storage kept the previous choice.`),
      'Studio exposes the same App-owned storage error surface',
    )
    check(await star.evaluate((button) => document.activeElement === button), 'Studio failure preserves its invoking star focus')
    await context.close()
  }

  check(pageErrors.length === 0, `all storage failures are handled without page errors (${JSON.stringify(pageErrors)})`)
  check(unexpectedExternal.length === 0, `fixture observes no unexpected external HTTPS requests (${JSON.stringify(unexpectedExternal)})`)
} catch (error) {
  console.error('SCRIPT ERROR:', error instanceof Error ? error.message : error)
  failures++
} finally {
  await browser.close()
  if (process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
  } else {
    server.kill()
  }
}

if (checks !== EXPECTED_CHECKS) {
  console.error(`FAIL  expected ${EXPECTED_CHECKS} behavioral checks, executed ${checks}`)
  failures++
}

if (failures > 0) {
  console.error(`feedback transaction browser: ${failures} failure(s), ${checks}/${EXPECTED_CHECKS} checks executed`)
  process.exitCode = 1
} else {
  console.log(`feedback transaction browser: ${checks}/${EXPECTED_CHECKS} checks passed`)
}
