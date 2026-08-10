// Phase 147 browser contract: passed-name records are scoped, reviewable, and
// safely undoable without turning the name into a like. Run after `npm run build`.
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PORT = 4197
const APP_URL = `http://localhost:${PORT}`
const E2E_DIR = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = join(E2E_DIR, '..')
const SHOTS = join(E2E_DIR, 'shots')
const viteCli = join(WEB_DIR, 'node_modules', 'vite', 'bin', 'vite.js')
const PROMPT = 'a secure developer project for offline code review'
const REJECTED_KEY = 'neologism:rejected'
const EXPECTED_CHECKS = 26

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
const check = (ok, label) => {
  checks++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) failures++
}

async function createSeededContext({ favorites = [], rejected = [], malformedRejected = false, rejectWrites = false } = {}) {
  const context = await browser.newContext({ acceptDownloads: true })
  await context.addInitScript(({ liked, passed, malformed, failWrites }) => {
    const favoritesKey = 'neologism:favorites'
    const rejectedKey = 'neologism:rejected'
    const markerKey = 'phase147:passed-history-seeded'
    const originalSetItem = Storage.prototype.setItem

    if (!localStorage.getItem(markerKey)) {
      originalSetItem.call(localStorage, 'neologism:visited', '1')
      originalSetItem.call(localStorage, favoritesKey, JSON.stringify(liked))
      originalSetItem.call(
        localStorage,
        rejectedKey,
        malformed ? JSON.stringify({ rows: passed }) : JSON.stringify(passed),
      )
      originalSetItem.call(localStorage, markerKey, '1')
    }

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

    if (failWrites) {
      Storage.prototype.setItem = function setItem(key, value) {
        if (key === rejectedKey) throw new DOMException('quota', 'QuotaExceededError')
        return originalSetItem.call(this, key, value)
      }
    }
  }, {
    liked: favorites,
    passed: rejected,
    malformed: malformedRejected,
    failWrites: rejectWrites,
  })
  return context
}

async function generateCreatePage(context) {
  const page = await context.newPage({ viewport: { width: 1440, height: 1000 } })
  await page.goto(APP_URL)
  await page.locator('.command-input').fill(PROMPT)
  await page.locator('.command-go').click()
  await page.waitForSelector('.results-grid .name-card', { timeout: 20000 })
  return page
}

function exactNameCard(page, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return page.locator('.results-grid .name-card').filter({
    has: page.locator('.name-text', { hasText: new RegExp(`^${escaped}$`) }),
  })
}

async function storedRejected(page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : []
  }, REJECTED_KEY)
}

async function readDownload(download) {
  const stream = await download.createReadStream()
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

function passedIdentity(item) {
  return JSON.stringify([item.tasteContext?.id ?? null, item.name.trim().toLowerCase()])
}

try {
  // Capture a real generated row so the main scenario can also verify that the
  // visible current-project card becomes neutral when its pass is undone.
  const baselineContext = await createSeededContext()
  const baselinePage = await generateCreatePage(baselineContext)
  const baselineCard = baselinePage.locator('.results-grid .name-card').first()
  const generatedName = ((await baselineCard.locator('.name-text').textContent()) ?? '').trim()
  await baselineCard.locator('.pass-btn').click()
  const generatedPass = (await storedRejected(baselinePage))[0]
  if (!generatedName || generatedPass?.name !== generatedName || !generatedPass?.tasteContext?.id) {
    throw new Error('could not capture a contextual generated pass for the fixture')
  }
  await baselineContext.close()

  const contextB = {
    id: 'phase147-project-beta',
    description: 'Project Beta',
    roots: ['orb'],
  }
  const passA = generatedPass
  const passB = {
    ...generatedPass,
    style: 'sci_fi',
    tasteContext: contextB,
  }
  const passLegacy = {
    ...generatedPass,
    style: 'fantasy',
  }
  delete passLegacy.tasteContext

  const favorites = [
    { ...generatedPass, name: 'ScopeAlpha' },
    { ...generatedPass, name: 'ScopeBeta', style: 'sci_fi', tasteContext: contextB },
    (() => {
      const legacy = { ...generatedPass, name: 'ScopeLegacy', style: 'fantasy' }
      delete legacy.tasteContext
      return legacy
    })(),
  ]

  const context = await createSeededContext({
    favorites,
    rejected: [passA, passB, passLegacy],
  })
  const page = await generateCreatePage(context)
  const currentCard = exactNameCard(page, generatedName)
  check(
    await currentCard.count() === 1
      && await currentCard.locator('.pass-btn').getAttribute('aria-pressed') === 'true',
    'the visible current-project card starts in its stored passed state',
  )

  await page.locator('.sidebar-settings').click()
  const passedSection = page.locator('.settings-passed')
  const passedToggle = passedSection.locator('.settings-passed-toggle')
  check(
    await passedSection.isVisible()
      && await passedToggle.getAttribute('aria-expanded') === 'false'
      && await passedSection.locator('.settings-passed-body').count() === 0,
    'passed-name review is collapsed by default',
  )
  check(
    (await passedSection.locator('.settings-passed-count').textContent())?.trim() === '3',
    'collapsed review reports the exact three-pass count',
  )

  const initialSummary = (await page.locator('.settings-data-meta').textContent()) ?? ''
  check(
    /3 liked.*3 passed.*3 derived pairs/.test(initialSummary),
    `initial Settings summary reports three scoped buckets (got "${initialSummary.trim()}")`,
  )
  const initialEvidence = (await page.locator('.settings-data-evidence').textContent()) ?? ''
  check(
    /2\/10 matched likes.*2\/10 matched passes.*2 project contexts/.test(initialEvidence),
    `initial evidence counts only the two scoped matched contexts (got "${initialEvidence.trim()}")`,
  )

  await passedToggle.click()
  const passedBody = passedSection.locator('.settings-passed-body')
  const rows = passedBody.locator('.settings-passed-row')
  check(
    await passedToggle.getAttribute('aria-expanded') === 'true'
      && await passedBody.isVisible()
      && await rows.count() === 3,
    'expanding review renders exactly three passed-name rows',
  )
  check(
    (await rows.locator('strong').allTextContents()).every((name) => name.trim() === generatedName),
    'the same spelling remains visible as three distinct review rows',
  )
  const contextLabels = await rows.locator('.settings-passed-copy span').allTextContents()
  check(
    contextLabels.some((label) => label.includes('Big Tech') && label.includes(PROMPT))
      && contextLabels.some((label) => label.includes('Sci-Fi') && label.includes('Project Beta') && label.includes('roots: orb'))
      && contextLabels.some((label) => label.trim() === 'Historical unscoped feedback'),
    'rows distinguish project A, project B, and the historical unscoped bucket',
  )
  const sourceLabels = await rows.locator('.settings-passed-copy small').allTextContents()
  check(
    sourceLabels.length === 3 && sourceLabels.every((label) => label.trim().length > 0),
    'every reviewed pass retains a visible source-mode label',
  )
  await page.screenshot({ path: join(SHOTS, 'passed-history-expanded.png'), fullPage: true })

  const projectARow = rows.filter({
    has: page.locator('.settings-passed-copy span', { hasText: PROMPT }),
  })
  await projectARow.locator('.settings-passed-undo').click()
  await page.waitForFunction(() => document.querySelectorAll('.settings-passed-row').length === 2)
  check(
    await passedSection.locator('.settings-passed-count').textContent() === '2'
      && await rows.count() === 2
      && await passedSection.locator('.settings-passed-error').count() === 0,
    'undoing project A immediately leaves two rows without an error',
  )
  check(
    await passedSection.locator('.settings-passed-status').isVisible()
      && (await passedSection.locator('.settings-passed-status').textContent())?.trim()
        === `Pass on ${generatedName} undone. 2 passed names remain.`,
    'a successful scoped undo announces the exact remaining count',
  )
  await page.waitForFunction(() => document.activeElement?.classList.contains('settings-passed-undo'))
  check(
    await page.evaluate(() => document.activeElement?.classList.contains('settings-passed-undo') ?? false),
    'after a scoped undo, focus moves to a remaining Undo action',
  )

  const persistedAfterUndo = await storedRejected(page)
  const remainingIdentities = persistedAfterUndo.map(passedIdentity).sort()
  check(
    remainingIdentities.join('|') === [passedIdentity(passB), passedIdentity(passLegacy)].sort().join('|'),
    'undo removes only the exact project-A identity while project B and legacy survive',
  )
  const remainingLabels = await rows.locator('.settings-passed-copy span').allTextContents()
  check(
    remainingLabels.some((label) => label.includes('Project Beta'))
      && remainingLabels.some((label) => label.trim() === 'Historical unscoped feedback')
      && remainingLabels.every((label) => !label.includes(PROMPT)),
    'the rendered rows retain only project B and legacy labels after undo',
  )

  const updatedSummary = (await page.locator('.settings-data-meta').textContent()) ?? ''
  check(
    /3 liked.*2 passed.*2 derived pairs/.test(updatedSummary),
    `undo updates the Settings pair summary (got "${updatedSummary.trim()}")`,
  )
  const updatedEvidence = (await page.locator('.settings-data-evidence').textContent()) ?? ''
  check(
    /1\/10 matched likes.*1\/10 matched passes.*1 project context(?:\D|$)/.test(updatedEvidence),
    `undo updates scoped evidence without counting legacy (got "${updatedEvidence.trim()}")`,
  )

  const downloadPromise = page.waitForEvent('download')
  await page.locator('.taste-export-btn').click()
  const download = await downloadPromise
  const exported = JSON.parse(await readDownload(download))
  check(
    download.suggestedFilename() === 'neologism-taste.json'
      && exported.schema === 'neologism-taste-v2',
    'post-undo export keeps the stable filename and schema',
  )
  check(
    exported.summary.liked === 3
      && exported.summary.passed === 2
      && exported.summary.comparisons === 2
      && exported.summary.contexts === 3
      && exported.examples.length === 5
      && exported.comparisons.length === 2,
    'post-undo export summary and derived pairs reflect the remaining history',
  )
  const exportedPasses = exported.examples
    .filter((example) => example.label === 'passed')
    .map((example) => passedIdentity(example.result))
    .sort()
  check(
    exportedPasses.join('|') === [passedIdentity(passB), passedIdentity(passLegacy)].sort().join('|'),
    'post-undo export excludes project A and retains project B plus legacy',
  )

  await page.getByTitle('Close').click()
  check(
    await currentCard.locator('.pass-btn').getAttribute('aria-pressed') === 'false'
      && await currentCard.locator('.star-btn').getAttribute('aria-pressed') === 'false',
    'the live current-project card returns to neutral after its pass is undone',
  )

  await page.reload()
  await page.locator('.sidebar-settings').click()
  const reloadedSection = page.locator('.settings-passed')
  check(
    (await reloadedSection.locator('.settings-passed-count').textContent())?.trim() === '2'
      && await reloadedSection.locator('.settings-passed-toggle').getAttribute('aria-expanded') === 'false',
    'the two-pass result persists across reload and starts collapsed again',
  )
  await reloadedSection.locator('.settings-passed-toggle').click()
  const reloadedLabels = await reloadedSection.locator('.settings-passed-copy span').allTextContents()
  check(
    await reloadedSection.locator('.settings-passed-row').count() === 2
      && reloadedLabels.some((label) => label.includes('Project Beta'))
      && reloadedLabels.some((label) => label.trim() === 'Historical unscoped feedback')
      && reloadedLabels.every((label) => !label.includes(PROMPT)),
    'reload restores only project B and legacy review rows',
  )
  await context.close()

  const finalRemovalContext = await createSeededContext({ rejected: [passA] })
  const finalRemovalPage = await finalRemovalContext.newPage({ viewport: { width: 900, height: 800 } })
  await finalRemovalPage.goto(APP_URL)
  await finalRemovalPage.locator('.sidebar-settings').click()
  const finalRemovalSection = finalRemovalPage.locator('.settings-passed')
  const finalRemovalToggle = finalRemovalSection.locator('.settings-passed-toggle')
  await finalRemovalToggle.click()
  await finalRemovalSection.locator('.settings-passed-undo').click()
  await finalRemovalSection.locator('.settings-passed-empty').waitFor({ state: 'visible' })
  const finalStoredRows = await storedRejected(finalRemovalPage)
  check(
    await finalRemovalSection.locator('.settings-passed-row').count() === 0
      && (await finalRemovalSection.locator('.settings-passed-count').textContent())?.trim() === '0'
      && /No passed names remain/.test((await finalRemovalSection.locator('.settings-passed-empty').textContent()) ?? '')
      && finalStoredRows.length === 0,
    'undoing the final pass leaves zero rows, a zero count, and empty durable storage',
  )
  await finalRemovalPage.waitForFunction(() => document.activeElement?.classList.contains('settings-passed-toggle'))
  check(
    await finalRemovalPage.evaluate(() => document.activeElement?.classList.contains('settings-passed-toggle') ?? false)
      && await finalRemovalSection.locator('.settings-passed-status').isVisible()
      && (await finalRemovalSection.locator('.settings-passed-status').textContent())?.trim()
          === `Pass on ${generatedName} undone. 0 passed names remain.`,
    'after the final undo, focus returns to the toggle and success status stays visible',
  )
  await finalRemovalContext.close()

  const malformedContext = await createSeededContext({
    rejected: [passA],
    malformedRejected: true,
  })
  const malformedPage = await malformedContext.newPage({ viewport: { width: 900, height: 800 } })
  await malformedPage.goto(APP_URL)
  await malformedPage.locator('.sidebar-settings').click()
  const malformedSection = malformedPage.locator('.settings-passed')
  check(
    (await malformedSection.locator('.settings-passed-count').textContent())?.trim() === '0'
      && await malformedSection.locator('.settings-passed-toggle').isDisabled()
      && await malformedSection.locator('.settings-passed-body').count() === 0,
    'malformed non-array rejected storage fails closed as an empty review',
  )
  await malformedContext.close()

  const quotaContext = await createSeededContext({ rejected: [passA], rejectWrites: true })
  const quotaPage = await quotaContext.newPage({ viewport: { width: 900, height: 800 } })
  await quotaPage.goto(APP_URL)
  await quotaPage.locator('.sidebar-settings').click()
  const quotaSection = quotaPage.locator('.settings-passed')
  await quotaSection.locator('.settings-passed-toggle').click()
  await quotaSection.locator('.settings-passed-undo').click()
  await quotaSection.locator('.settings-passed-error').waitFor({ state: 'visible' })
  const quotaRows = await storedRejected(quotaPage)
  check(
    await quotaSection.locator('.settings-passed-row').count() === 1
      && (await quotaSection.locator('.settings-passed-count').textContent())?.trim() === '1'
      && quotaRows.length === 1
      && passedIdentity(quotaRows[0]) === passedIdentity(passA)
      && /Browser storage kept it unchanged/.test((await quotaSection.locator('.settings-passed-error').textContent()) ?? ''),
    'a failed rejected-storage write reports the error and keeps UI plus durable state unchanged',
  )
  await quotaContext.close()
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
  console.error(`passed review browser: ${failures} failure(s), ${checks}/${EXPECTED_CHECKS} checks executed`)
  process.exitCode = 1
} else {
  console.log(`passed review browser: ${checks}/${EXPECTED_CHECKS} checks passed`)
}
