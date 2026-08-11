// Phase 156 browser contract: clipboard rejection is visible and retryable on
// card Copy, Saved Copy all, and Saved Share link without false success state.
// Run after `npm run build`: node e2e/clipboard-failure.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = 4215
const APP_URL = `http://localhost:${PORT}`
const E2E_DIR = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = join(E2E_DIR, '..')
const SHOTS = join(E2E_DIR, 'shots')
const viteCli = join(WEB_DIR, 'node_modules', 'vite', 'bin', 'vite.js')
const EXPECTED_CHECKS = 18

mkdirSync(SHOTS, { recursive: true })

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
const external = []
const check = (ok, label) => {
  checks++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) failures++
}

const result = (name, contextId) => ({
  name,
  style: 'big_tech',
  syllables: 2,
  score_pronounce: 88,
  score_novelty: 91,
  score_memorability: 84,
  connotations: ['small', 'bold'],
  sourceMode: 'brandable',
  tasteContext: {
    id: contextId,
    description: `Project ${name}`,
    roots: [name.toLowerCase()],
  },
})

try {
  const favorites = [result('Noma', 'phase156-noma'), result('Orbit', 'phase156-orbit')]
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await context.addInitScript(({ liked }) => {
    localStorage.setItem('neologism:visited', '1')
    localStorage.setItem('neologism:favorites', JSON.stringify(liked))
    const state = { calls: 0, value: '' }
    window.__phase156Clipboard = state
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        async writeText(value) {
          state.calls++
          if ([1, 3, 5].includes(state.calls)) throw new Error('clipboard fixture rejection')
          state.value = String(value)
        },
        async readText() {
          return state.value
        },
      },
    })
  }, { liked: favorites })
  await context.route('https://**/*', async (route) => {
    external.push(route.request().url())
    await route.abort()
  })

  const page = await context.newPage()
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.goto(APP_URL)
  await page.locator('.sidebar-item', { hasText: 'Saved' }).click()
  await page.waitForSelector('.saved-page .name-card')
  const storageBefore = await page.evaluate(() => JSON.stringify(localStorage))

  const nomaCard = page.locator('.saved-page .name-card').filter({ hasText: 'Noma' })
  const cardCopy = nomaCard.getByRole('button', { name: 'Copy Noma' })
  await cardCopy.click()
  const cardError = nomaCard.getByRole('alert')
  await cardError.waitFor({ state: 'visible' })
  check(
    (await cardError.textContent())?.trim() === 'Could not copy Noma. Browser clipboard access was denied.',
    'card clipboard rejection exposes an exact visible error',
  )
  check(
    await cardCopy.getAttribute('aria-label') === 'Copy Noma'
      && !(await nomaCard.locator('.copy-swap').getAttribute('class'))?.includes('copied'),
    'failed card copy never exposes a false copied state',
  )
  check(
    await cardCopy.evaluate((element) => document.activeElement === element),
    'failed card copy preserves the invoking button focus',
  )
  const cardFit = await cardError.evaluate((element) => {
    const card = element.closest('.name-card')?.getBoundingClientRect()
    const box = element.getBoundingClientRect()
    return Boolean(card) && box.left >= card.left - 1 && box.right <= card.right + 1
  })
  check(cardFit, '390px card error remains contained inside its card')
  await page.screenshot({ path: join(SHOTS, 'clipboard-card-error-390.png'), fullPage: true })

  await cardCopy.click()
  await cardError.waitFor({ state: 'detached' })
  const copiedUiHandle = await page.waitForFunction(() => {
    const active = document.activeElement
    if (active?.getAttribute('aria-label') !== 'Noma copied') return false
    return {
      label: active.getAttribute('aria-label'),
      swapClass: active.querySelector('.copy-swap')?.getAttribute('class'),
    }
  })
  const copiedUi = await copiedUiHandle.jsonValue()
  const cardClipboard = await page.evaluate(() => window.__phase156Clipboard)
  check(
    cardClipboard.calls === 2
      && cardClipboard.value === 'Noma'
      && copiedUi.label === 'Noma copied'
      && copiedUi.swapClass?.includes('copied'),
    `successful card retry writes the name before exposing copied state (${JSON.stringify({ cardClipboard, copiedUi })})`,
  )
  check(await cardCopy.evaluate((element) => document.activeElement === element), 'successful card retry keeps focus on the same button')

  const copyAll = page.getByRole('button', { name: 'Copy all' })
  await copyAll.click()
  const savedError = page.locator('.saved-copy-error')
  await savedError.waitFor({ state: 'visible' })
  check(
    (await savedError.textContent())?.trim() === 'Could not copy the Saved names. Browser clipboard access was denied.',
    'Copy all rejection uses the Saved-page error surface',
  )
  check(
    await copyAll.evaluate((element) => document.activeElement === element)
      && (await copyAll.textContent())?.includes('Copy all'),
    'failed Copy all keeps focus and never claims success',
  )
  const savedFit = await savedError.evaluate((element) => {
    const box = element.getBoundingClientRect()
    return box.left >= -1 && box.right <= innerWidth + 1
  })
  check(savedFit, '390px Saved clipboard error remains horizontally contained')
  await page.screenshot({ path: join(SHOTS, 'clipboard-saved-error-390.png'), fullPage: true })

  await copyAll.click()
  await savedError.waitFor({ state: 'detached' })
  const allClipboard = await page.evaluate(() => window.__phase156Clipboard)
  check(
    allClipboard.calls === 4
      && allClipboard.value === 'Noma\nOrbit'
      && await copyAll.evaluate((element) => document.activeElement === element),
    'Copy all retry clears the error and writes the exact ordered shortlist',
  )

  const share = page.getByRole('button', { name: 'Share link' })
  await share.click()
  await savedError.waitFor({ state: 'visible' })
  check(
    (await savedError.textContent())?.trim() === 'Could not copy the share link. Browser clipboard access was denied.',
    'Share link clipboard rejection is distinguished from encoding failure',
  )
  const afterShareFailure = await page.evaluate(() => window.__phase156Clipboard)
  check(
    afterShareFailure.calls === 5
      && afterShareFailure.value === 'Noma\nOrbit'
      && await share.evaluate((element) => document.activeElement === element),
    'failed Share link preserves the prior clipboard and invoking focus',
  )

  await share.click()
  await savedError.waitFor({ state: 'detached' })
  const sharedUrl = await page.evaluate(() => window.__phase156Clipboard.value)
  const payload = JSON.parse(Buffer.from(sharedUrl.split('#names=')[1], 'base64').toString('utf8'))
  check(
    sharedUrl.startsWith(`${APP_URL}/#names=`)
      && payload.length === 2
      && payload.every((row) => Object.keys(row).sort().join(',') === 'n,s'),
    'Share link retry copies the unchanged minimal name/style payload',
  )
  check(
    await share.evaluate((element) => document.activeElement === element)
      && (await share.textContent())?.includes('Share link'),
    'successful Share link retry retains focus and its visible action label',
  )

  const storageAfter = await page.evaluate(() => JSON.stringify(localStorage))
  check(storageAfter === storageBefore, 'all clipboard success and failure paths leave browser storage byte-identical')
  check(pageErrors.length === 0, `clipboard rejections produce zero page errors (${JSON.stringify(pageErrors)})`)
  check(external.length === 0, `clipboard actions issue zero external HTTPS requests (${JSON.stringify(external)})`)
  const finalClipboard = await page.evaluate(() => window.__phase156Clipboard)
  check(finalClipboard.calls === 6, `exactly one clipboard attempt occurs per activation (${finalClipboard.calls})`)
  await context.close()
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
  console.error(`clipboard failure browser: ${failures} failure(s), ${checks}/${EXPECTED_CHECKS} checks executed`)
  process.exitCode = 1
} else {
  console.log(`clipboard failure browser: ${checks}/${EXPECTED_CHECKS} checks passed`)
}
