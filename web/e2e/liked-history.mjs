// Phase 154 browser contract: explicit likes remain independently reviewable
// by project context without deleting same-spelling likes or shared Saved rows.
// Run after `npm run build`: node e2e/liked-history.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = 4213
const APP_URL = `http://localhost:${PORT}`
const E2E_DIR = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = join(E2E_DIR, '..')
const SHOTS = join(E2E_DIR, 'shots')
const viteCli = join(WEB_DIR, 'node_modules', 'vite', 'bin', 'vite.js')
const FAVORITES_KEY = 'neologism:favorites'
const REJECTED_KEY = 'neologism:rejected'
const IMPORTED_KEY = 'neologism:imported-saved'
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
const pageErrors = []
const unexpectedExternal = []
const check = (ok, label) => {
  checks++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) failures++
}

const contextA = {
  id: 'phase154-project-alpha',
  description: 'Project Alpha',
  roots: ['key'],
}
const contextB = {
  id: 'phase154-project-beta',
  description: 'Project Beta',
  roots: ['orb'],
}
const base = {
  name: 'Noma',
  style: 'big_tech',
  syllables: 2,
  score_pronounce: 88,
  score_novelty: 91,
  score_memorability: 84,
  connotations: ['small', 'bold'],
  sourceMode: 'brandable',
  tasteContext: contextA,
}
const likeA = base
const likeB = { ...base, style: 'sci_fi', tasteContext: contextB }
const likeLegacy = { ...base, style: 'fantasy' }
delete likeLegacy.tasteContext
const passA = { ...base, name: 'PassAlpha' }
const passB = { ...base, name: 'PassBeta', style: 'sci_fi', tasteContext: contextB }
const passLegacy = { ...base, name: 'PassLegacy', style: 'fantasy' }
delete passLegacy.tasteContext
const imported = {
  name: 'Noma',
  style: 'big_tech',
  syllables: 0,
  score_pronounce: 0,
  score_novelty: 0,
  score_memorability: 0,
  connotations: [],
}

function tasteKey(item) {
  return JSON.stringify([item.tasteContext?.id ?? null, item.name.trim().toLowerCase()])
}

async function createSeededContext({ favorites = [], rejected = [], importedSaved = [], failFavoriteWrites = false } = {}) {
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 900, height: 860 } })
  await context.addInitScript(({ liked, passed, shared, failWrites }) => {
    const favoritesKey = 'neologism:favorites'
    const markerKey = 'phase154:liked-history-seeded'
    const originalSetItem = Storage.prototype.setItem
    if (!localStorage.getItem(markerKey)) {
      originalSetItem.call(localStorage, 'neologism:visited', '1')
      originalSetItem.call(localStorage, favoritesKey, JSON.stringify(liked))
      originalSetItem.call(localStorage, 'neologism:rejected', JSON.stringify(passed))
      originalSetItem.call(localStorage, 'neologism:imported-saved', JSON.stringify(shared))
      originalSetItem.call(localStorage, markerKey, '1')
    }
    if (failWrites) {
      Storage.prototype.setItem = function setItem(key, value) {
        if (key === favoritesKey) throw new DOMException('quota', 'QuotaExceededError')
        return originalSetItem.call(this, key, value)
      }
    }
  }, { liked: favorites, passed: rejected, shared: importedSaved, failWrites: failFavoriteWrites })
  await context.route('https://**/*', async (route) => {
    unexpectedExternal.push(route.request().url())
    await route.abort()
  })
  return context
}

async function openSettings(context) {
  const page = await context.newPage()
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.goto(APP_URL)
  await page.locator('.sidebar-settings').click()
  return page
}

async function stored(page, key) {
  return page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey) ?? '[]'), key)
}

async function readDownload(download) {
  const stream = await download.createReadStream()
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

try {
  const context = await createSeededContext({
    favorites: [likeA, likeB, likeLegacy],
    rejected: [passA, passB, passLegacy],
    importedSaved: [imported],
  })
  const page = await openSettings(context)
  const liked = page.locator('.settings-liked')
  const toggle = liked.locator('.settings-liked-toggle')
  const storageBeforeReview = await page.evaluate(() => JSON.stringify({
    favorites: localStorage.getItem('neologism:favorites'),
    rejected: localStorage.getItem('neologism:rejected'),
    imported: localStorage.getItem('neologism:imported-saved'),
  }))
  check(
    await toggle.getAttribute('aria-expanded') === 'false'
      && await liked.locator('.settings-liked-body').count() === 0
      && (await liked.locator('.settings-liked-count').textContent())?.trim() === '3',
    'liked-name review starts collapsed with the exact explicit-like count',
  )
  check(
    /3 liked.*3 passed.*3 derived pairs/.test((await page.locator('.settings-data-meta').textContent()) ?? '')
      && /2\/10 matched likes.*2\/10 matched passes.*2 project contexts/.test((await page.locator('.settings-data-evidence').textContent()) ?? ''),
    'initial summary counts scoped evidence while keeping legacy descriptive',
  )

  await toggle.click()
  const body = liked.locator('.settings-liked-body')
  const rows = body.locator('.settings-liked-row')
  check(
    await toggle.getAttribute('aria-expanded') === 'true'
      && await rows.count() === 3
      && (await rows.locator('strong').allTextContents()).every((name) => name.trim() === 'Noma'),
    'expanding review keeps three same-spelling identities as separate rows',
  )
  const labels = await rows.locator('.settings-liked-copy span').allTextContents()
  check(
    labels.some((label) => label.includes('Big Tech') && label.includes('Project Alpha') && label.includes('roots: key'))
      && labels.some((label) => label.includes('Sci-Fi') && label.includes('Project Beta') && label.includes('roots: orb'))
      && labels.some((label) => label.trim() === 'Historical unscoped feedback'),
    'liked rows distinguish project A, project B, and historical unscoped identity',
  )
  check(
    await rows.count() === 3
      && await page.locator('.settings-liked-row', { hasText: 'Saved from a shared link' }).count() === 0,
    'the shared Saved copy never appears as a liked feedback row',
  )
  const storageAfterReview = await page.evaluate(() => JSON.stringify({
    favorites: localStorage.getItem('neologism:favorites'),
    rejected: localStorage.getItem('neologism:rejected'),
    imported: localStorage.getItem('neologism:imported-saved'),
  }))
  check(storageAfterReview === storageBeforeReview, 'opening and inspecting liked history performs zero storage writes')
  await page.screenshot({ path: join(SHOTS, 'liked-history-expanded.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  const narrowFit = await liked.evaluate((section) => {
    const modal = section.closest('.settings-modal')?.getBoundingClientRect()
    const row = section.querySelector('.settings-liked-row')?.getBoundingClientRect()
    const undo = section.querySelector('.settings-liked-undo')?.getBoundingClientRect()
    return modal && row && undo
      ? section.scrollHeight <= section.clientHeight + 1
        && modal.left >= -1
        && modal.right <= innerWidth + 1
        && row.left >= modal.left - 1
        && row.right <= modal.right + 1
        && undo.left >= row.left - 1
        && undo.right <= row.right + 1
      : false
  })
  check(narrowFit, '390px expanded liked review keeps its rows and Undo actions inside the modal')
  await page.screenshot({ path: join(SHOTS, 'liked-history-expanded-390.png'), fullPage: true })

  const projectARow = rows.filter({ has: page.locator('.settings-liked-copy span', { hasText: 'Project Alpha' }) })
  await projectARow.locator('.settings-liked-undo').click()
  await page.waitForFunction(() => document.querySelectorAll('.settings-liked-row').length === 2)
  check(
    (await liked.locator('.settings-liked-count').textContent())?.trim() === '2'
      && await rows.count() === 2
      && await liked.locator('.settings-liked-error').count() === 0,
    'undoing project A immediately leaves two explicit-like rows without an error',
  )
  check(
    (await liked.locator('.settings-liked-status').textContent())?.trim() === 'Like on Noma undone. 2 liked names remain.',
    'successful scoped undo announces the exact remaining count',
  )
  await page.waitForFunction(() => document.activeElement?.classList.contains('settings-liked-undo'))
  check(
    await page.evaluate(() => document.activeElement?.classList.contains('settings-liked-undo') ?? false),
    'after a scoped undo focus moves to a remaining Undo like action',
  )
  const persistedLikes = await stored(page, FAVORITES_KEY)
  check(
    persistedLikes.map(tasteKey).sort().join('|') === [tasteKey(likeB), tasteKey(likeLegacy)].sort().join('|'),
    'undo removes only project A while project B and legacy likes remain durable',
  )
  check(
    (await stored(page, IMPORTED_KEY)).length === 1
      && tasteKey((await stored(page, REJECTED_KEY))[0]) === tasteKey(passA),
    'exact like undo preserves the shared copy and every pass collection row',
  )
  check(
    /2 liked.*3 passed.*2 derived pairs/.test((await page.locator('.settings-data-meta').textContent()) ?? '')
      && /1\/10 matched likes.*1\/10 matched passes.*1 project context/.test((await page.locator('.settings-data-evidence').textContent()) ?? ''),
    'undo updates derived pairs and scoped evidence without counting legacy',
  )

  const downloadPromise = page.waitForEvent('download')
  await page.locator('.taste-export-btn').click()
  const download = await downloadPromise
  const exported = JSON.parse(await readDownload(download))
  check(
    download.suggestedFilename() === 'neologism-taste.json'
      && exported.schema === 'neologism-taste-v2'
      && exported.summary.liked === 2
      && exported.summary.passed === 3
      && exported.summary.comparisons === 2
      && exported.examples.length === 5,
    'post-undo export keeps v2 while reflecting only the remaining explicit likes',
  )
  check(
    exported.examples.filter((example) => example.label === 'liked').map((example) => tasteKey(example.result)).sort().join('|')
      === [tasteKey(likeB), tasteKey(likeLegacy)].sort().join('|'),
    'export excludes only project A and retains project B plus legacy',
  )

  await page.getByTitle('Close').click()
  await page.locator('.sidebar-item', { hasText: 'Saved' }).click()
  const savedCards = page.locator('.saved-page .name-card')
  const savedProvenance = savedCards.locator('.card-meta-line').filter({ hasText: 'liked in' })
  check(
    await savedCards.count() === 1
      && (await savedProvenance.textContent())?.includes('liked in 1 project')
      && (await savedProvenance.textContent())?.includes('legacy unscoped like')
      && (await savedProvenance.textContent())?.includes('also received by share'),
    'Saved remains one spelling card with the two surviving likes and shared provenance',
  )

  await page.reload()
  await page.locator('.sidebar-settings').click()
  const reloaded = page.locator('.settings-liked')
  check(
    (await reloaded.locator('.settings-liked-count').textContent())?.trim() === '2'
      && await reloaded.locator('.settings-liked-toggle').getAttribute('aria-expanded') === 'false',
    'remaining project B and legacy likes survive reload and start collapsed',
  )
  await reloaded.locator('.settings-liked-toggle').click()
  const reloadLabels = await reloaded.locator('.settings-liked-copy span').allTextContents()
  check(
    reloadLabels.some((label) => label.includes('Project Beta'))
      && reloadLabels.some((label) => label.trim() === 'Historical unscoped feedback')
      && reloadLabels.every((label) => !label.includes('Project Alpha')),
    'reloaded review restores only the two surviving exact identities',
  )
  await context.close()

  const sharedOnlyContext = await createSeededContext({ favorites: [likeA], importedSaved: [imported] })
  const sharedOnlyPage = await openSettings(sharedOnlyContext)
  const sharedLiked = sharedOnlyPage.locator('.settings-liked')
  await sharedLiked.locator('.settings-liked-toggle').click()
  await sharedLiked.locator('.settings-liked-undo').click()
  await sharedLiked.locator('.settings-liked-empty').waitFor({ state: 'visible' })
  check(
    (await stored(sharedOnlyPage, FAVORITES_KEY)).length === 0
      && (await stored(sharedOnlyPage, IMPORTED_KEY)).length === 1
      && (await sharedLiked.locator('.settings-liked-count').textContent())?.trim() === '0',
    'undoing the final explicit like preserves the same-spelling shared Saved copy',
  )
  await sharedOnlyPage.waitForFunction(() => document.activeElement?.classList.contains('settings-liked-toggle'))
  check(
    await sharedOnlyPage.evaluate(() => document.activeElement?.classList.contains('settings-liked-toggle') ?? false)
      && (await sharedLiked.locator('.settings-liked-status').textContent())?.trim() === 'Like on Noma undone. 0 liked names remain.',
    'final-like undo returns focus to the disclosure and keeps a visible success status',
  )
  check(await sharedOnlyPage.locator('.taste-export-btn').isDisabled(), 'share-only Saved state cannot enable taste export')
  await sharedOnlyPage.getByTitle('Close').click()
  await sharedOnlyPage.locator('.sidebar-item', { hasText: 'Saved' }).click()
  const sharedProvenance = sharedOnlyPage.locator('.card-meta-line').filter({ hasText: 'not taste evidence' })
  check(
    await sharedOnlyPage.locator('.saved-page .name-card').count() === 1
      && await sharedProvenance.isVisible(),
    'the surviving Saved card is honestly relabeled as shared-only evidence',
  )
  await sharedOnlyContext.close()

  const quotaContext = await createSeededContext({ favorites: [likeA], failFavoriteWrites: true })
  const quotaPage = await openSettings(quotaContext)
  const quotaLiked = quotaPage.locator('.settings-liked')
  await quotaLiked.locator('.settings-liked-toggle').click()
  const quotaUndo = quotaLiked.locator('.settings-liked-undo')
  await quotaUndo.click()
  await quotaLiked.locator('.settings-liked-error').waitFor({ state: 'visible' })
  check(
    await quotaLiked.locator('.settings-liked-row').count() === 1
      && (await quotaLiked.locator('.settings-liked-count').textContent())?.trim() === '1'
      && (await stored(quotaPage, FAVORITES_KEY)).length === 1,
    'failed favorites write keeps both the rendered row and durable like unchanged',
  )
  check(
    /Browser storage kept it unchanged/.test((await quotaLiked.locator('.settings-liked-error').textContent()) ?? '')
      && await quotaUndo.evaluate((element) => document.activeElement === element),
    'failed undo exposes a visible error and preserves invoking-control focus',
  )
  await quotaContext.close()

  check(pageErrors.length === 0, `all liked-history paths complete without page errors (${JSON.stringify(pageErrors)})`)
  check(unexpectedExternal.length === 0, `liked-history review issues no external HTTPS requests (${JSON.stringify(unexpectedExternal)})`)
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
  console.error(`liked review browser: ${failures} failure(s), ${checks}/${EXPECTED_CHECKS} checks executed`)
  process.exitCode = 1
} else {
  console.log(`liked review browser: ${checks}/${EXPECTED_CHECKS} checks passed`)
}
