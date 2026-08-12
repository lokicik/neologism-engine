// Phase 156/195 browser contract: clipboard and Saved-download rejection is
// visible and retryable without false success or leaked object URLs.
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
const EXPECTED_CHECKS = 36

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
    const nativeSetTimeout = window.setTimeout.bind(window)
    const nativeClearTimeout = window.clearTimeout.bind(window)
    const visualTimers = new Set()
    window.__phase199VisualTimers = visualTimers
    window.setTimeout = (handler, timeout = 0, ...args) => {
      let id
      const wrapped = typeof handler === 'function'
        ? (...callbackArgs) => {
            visualTimers.delete(id)
            handler(...callbackArgs)
          }
        : handler
      id = nativeSetTimeout(wrapped, timeout, ...args)
      if (timeout === 1500) visualTimers.add(id)
      return id
    }
    window.clearTimeout = (id) => {
      visualTimers.delete(id)
      nativeClearTimeout(id)
    }
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        async writeText(value) {
          state.calls++
          if ([1, 3, 6].includes(state.calls)) throw new Error('clipboard fixture rejection')
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
  const cardCopyStatus = nomaCard.locator('.card-copy-status')
  check(
    await cardCopyStatus.getAttribute('role') === 'status'
      && await cardCopyStatus.getAttribute('aria-live') === 'polite'
      && await cardCopyStatus.getAttribute('aria-atomic') === 'true',
    'card copy success exposes one atomic polite status channel',
  )
  check(
    (await cardCopyStatus.textContent())?.trim() === 'Noma copied to clipboard.',
    'card copy success announces the exact completed operation',
  )

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
  const savedCopyStatus = page.locator('.saved-copy-status')
  check(
    await savedCopyStatus.getAttribute('role') === 'status'
      && await savedCopyStatus.getAttribute('aria-live') === 'polite'
      && await savedCopyStatus.getAttribute('aria-atomic') === 'true'
      && (await savedCopyStatus.textContent())?.trim() === 'Saved names copied to clipboard.',
    'Copy all success announces one exact atomic polite status',
  )
  await page.waitForTimeout(900)
  await copyAll.click()
  await page.waitForTimeout(700)
  check(
    await copyAll.locator('path[d="M20 6 9 17l-5-5"]').count() === 1,
    'a second Copy all success restarts its full visual confirmation window',
  )

  const txt = page.getByRole('button', { name: 'TXT' })
  await page.evaluate(() => {
    const originalClick = HTMLAnchorElement.prototype.click
    const originalRevoke = URL.revokeObjectURL.bind(URL)
    window.__phase195Download = { failedOnce: false, revokes: 0 }
    HTMLAnchorElement.prototype.click = function click() {
      if (!window.__phase195Download.failedOnce) {
        window.__phase195Download.failedOnce = true
        throw new Error('Saved download fixture rejection')
      }
      return originalClick.call(this)
    }
    URL.revokeObjectURL = (url) => {
      window.__phase195Download.revokes++
      originalRevoke(url)
    }
  })
  let savedDownloads = 0
  page.on('download', () => { savedDownloads++ })
  await txt.click()
  await savedError.waitFor({ state: 'visible' })
  check(
    (await savedError.textContent())?.trim() === 'Could not start the TXT download.'
      && await savedError.getAttribute('role') === 'alert'
      && await txt.evaluate((element) => document.activeElement === element),
    'failed TXT download exposes an exact live error and preserves invoking focus',
  )
  check(
    savedDownloads === 0
      && (await savedCopyStatus.textContent())?.trim() === ''
      && await page.evaluate(() => window.__phase195Download.revokes === 1),
    'failed TXT starts no download, clears stale success, and revokes its object URL',
  )

  const txtDownload = page.waitForEvent('download')
  await txt.click()
  check(
    (await txtDownload).suggestedFilename() === 'names.txt'
      && savedDownloads === 1
      && await txt.evaluate((element) => document.activeElement === element)
      && await savedError.count() === 0
      && await page.evaluate(() => window.__phase195Download.revokes === 2),
    'TXT retry starts the existing download, clears its error, retains focus, and revokes its object URL',
  )
  check(
    (await savedCopyStatus.textContent())?.trim() === 'TXT download started.',
    'TXT replaces stale clipboard status with its exact completed action',
  )

  const json = page.getByRole('button', { name: 'JSON' })
  const jsonDownload = page.waitForEvent('download')
  await json.click()
  check(
    (await jsonDownload).suggestedFilename() === 'names.json'
      && savedDownloads === 2
      && await json.evaluate((element) => document.activeElement === element)
      && await page.evaluate(() => window.__phase195Download.revokes === 3),
    'JSON starts the existing download, retains focus, and revokes its object URL',
  )
  check(
    (await savedCopyStatus.textContent())?.trim() === 'JSON download started.',
    'JSON replaces the TXT status with its exact completed action',
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
    afterShareFailure.calls === 6
      && afterShareFailure.value === 'Noma\nOrbit'
      && await share.evaluate((element) => document.activeElement === element),
    'failed Share link preserves the prior clipboard and invoking focus',
  )
  check(
    (await savedCopyStatus.textContent())?.trim() === '',
    'failed Share link clears the prior Copy all success announcement',
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
  check(
    (await savedCopyStatus.textContent())?.trim() === 'Share link copied to clipboard.',
    'Share link success replaces the Saved status with its exact completed operation',
  )
  await page.waitForTimeout(900)
  await share.click()
  await page.waitForTimeout(700)
  check(
    await share.locator('path[d="M20 6 9 17l-5-5"]').count() === 1,
    'a second Share link success restarts its full visual confirmation window',
  )
  const pendingBeforeLeave = await page.evaluate(() => window.__phase199VisualTimers.size)
  await page.getByRole('button', { name: /^Create/ }).click()
  check(
    pendingBeforeLeave >= 1
      && await page.evaluate(() => window.__phase199VisualTimers.size) === 0,
    'leaving Saved clears every pending transient visual timer',
  )

  const storageAfter = await page.evaluate(() => JSON.stringify(localStorage))
  check(storageAfter === storageBefore, 'all clipboard success and failure paths leave browser storage byte-identical')
  check(pageErrors.length === 0, `clipboard rejections produce zero page errors (${JSON.stringify(pageErrors)})`)
  check(external.length === 0, `clipboard actions issue zero external HTTPS requests (${JSON.stringify(external)})`)
  const finalClipboard = await page.evaluate(() => window.__phase156Clipboard)
  check(finalClipboard.calls === 8, `exactly one clipboard attempt occurs per activation (${finalClipboard.calls})`)
  await context.close()

  // Out-of-order clipboard settlements: only the newest invoked action owns UI feedback.
  const raceContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await raceContext.addInitScript(({ liked }) => {
    localStorage.setItem('neologism:visited', '1')
    localStorage.setItem('neologism:favorites', JSON.stringify(liked))
    const state = { pending: [], value: '' }
    window.__phase202Clipboard = state
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText(value) {
          return new Promise((resolve, reject) => {
            state.pending.push({ value: String(value), resolve, reject })
          })
        },
        async readText() {
          return state.value
        },
      },
    })
  }, { liked: [result('RaceName', 'phase202-race')] })
  const raceExternal = []
  await raceContext.route('https://**/*', async (route) => {
    raceExternal.push(route.request().url())
    await route.abort()
  })
  const raceErrors = []
  const racePage = await raceContext.newPage()
  racePage.on('pageerror', (error) => raceErrors.push(error.message))
  await racePage.goto(APP_URL)
  await racePage.getByRole('button', { name: /^Saved/ }).click()
  const raceCard = racePage.locator('.saved-page .name-card')
  const raceCopy = raceCard.locator('button[title="Copy name"]')
  const settle = (index, outcome) => racePage.evaluate(({ operationIndex, operationOutcome }) => {
    const state = window.__phase202Clipboard
    const operation = state.pending[operationIndex]
    if (operationOutcome === 'resolve') {
      state.value = operation.value
      operation.resolve()
    } else {
      operation.reject(new Error('stale clipboard settlement'))
    }
  }, { operationIndex: index, operationOutcome: outcome })

  await raceCopy.click()
  await raceCopy.click()
  await racePage.waitForFunction(() => window.__phase202Clipboard.pending.length === 2)
  await settle(1, 'resolve')
  await racePage.waitForFunction(() => document.querySelector('.card-copy-status')?.textContent?.includes('RaceName copied'))
  await settle(0, 'reject')
  await racePage.waitForTimeout(0)
  check(
    await raceCard.locator('.card-copy-error').count() === 0
      && (await raceCard.locator('.card-copy-status').textContent())?.trim() === 'RaceName copied to clipboard.'
      && (await raceCard.locator('.copy-swap').getAttribute('class'))?.includes('copied'),
    'an older card-copy rejection cannot erase a newer accepted copy',
  )

  await raceCopy.click()
  await raceCopy.click()
  await racePage.waitForFunction(() => window.__phase202Clipboard.pending.length === 4)
  await settle(3, 'reject')
  await raceCard.locator('.card-copy-error').waitFor({ state: 'visible' })
  await settle(2, 'resolve')
  await racePage.waitForTimeout(0)
  check(
    (await raceCard.locator('.card-copy-error').textContent())?.includes('Could not copy RaceName')
      && (await raceCard.locator('.card-copy-status').textContent())?.trim() === ''
      && !(await raceCard.locator('.copy-swap').getAttribute('class'))?.includes('copied'),
    'an older card-copy success cannot hide a newer rejected copy',
  )

  const raceCopyAll = racePage.getByRole('button', { name: 'Copy all' })
  const raceShare = racePage.getByRole('button', { name: 'Share link' })
  await raceCopyAll.click()
  await raceShare.click()
  await racePage.waitForFunction(() => window.__phase202Clipboard.pending.length === 6)
  await settle(5, 'resolve')
  await racePage.waitForFunction(() => document.querySelector('.saved-copy-status')?.textContent?.includes('Share link copied'))
  await settle(4, 'reject')
  await racePage.waitForTimeout(0)
  check(
    await racePage.locator('.saved-copy-error').count() === 0
      && (await racePage.locator('.saved-copy-status').textContent())?.trim() === 'Share link copied to clipboard.'
      && (await racePage.evaluate(() => window.__phase202Clipboard.value)).startsWith(APP_URL),
    'an older Copy all rejection cannot overwrite the newer Share link result',
  )
  check(
    raceErrors.length === 0 && raceExternal.length === 0,
    `out-of-order clipboard settlements produce no page errors or external HTTPS requests (${JSON.stringify({ raceErrors, raceExternal })})`,
  )
  await raceContext.close()
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
