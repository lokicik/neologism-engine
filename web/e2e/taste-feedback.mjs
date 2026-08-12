// Phase 61: browser-level check for local positive/negative taste feedback.
// Run after `npm run build`: node e2e/taste-feedback.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PORT = 4181
const APP_URL = `http://localhost:${PORT}`
const E2E_DIR = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = join(E2E_DIR, '..')
const SHOTS = join(E2E_DIR, 'shots')
const viteCli = join(WEB_DIR, 'node_modules', 'vite', 'bin', 'vite.js')

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
let failures = 0
const check = (ok, label) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) failures++
}

async function storedCount(page, key) {
  return page.evaluate((storageKey) => {
    const raw = localStorage.getItem(storageKey)
    return raw ? JSON.parse(raw).length : 0
  }, key)
}

async function readDownload(download) {
  const stream = await download.createReadStream()
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

try {
  const context = await browser.newContext()
  await context.addInitScript(() => localStorage.setItem('neologism:visited', '1'))
  const page = await context.newPage({ viewport: { width: 1440, height: 1000 } })
  await page.goto(APP_URL)
  await page.click('.command-go')
  await page.waitForSelector('.name-card', { timeout: 20000 })

  const cards = page.locator('.name-card')
  for (let index = 0; index < 3; index++) {
    await cards.nth(index).locator('.star-btn').click()
  }
  check(await storedCount(page, 'neologism:favorites') === 3, 'three likes are stored locally')
  const storedModes = await page.evaluate(() => {
    const raw = localStorage.getItem('neologism:favorites')
    return raw ? JSON.parse(raw).map((item) => item.sourceMode) : []
  })
  check(storedModes.every(Boolean), 'Auto feedback preserves each candidate source mode')

  // Opposite feedback is mutually exclusive in both directions.
  await cards.nth(0).locator('.pass-btn').click()
  check(await storedCount(page, 'neologism:favorites') === 2, 'passing a liked name removes its positive signal')
  check(await storedCount(page, 'neologism:rejected') === 1, 'the pass is stored as negative feedback')

  await cards.nth(0).locator('.star-btn').click()
  check(await storedCount(page, 'neologism:favorites') === 3, 'saving the name again restores its positive signal')
  check(await storedCount(page, 'neologism:rejected') === 0, 'saving a passed name clears its negative signal')

  await cards.nth(3).locator('.pass-btn').click()
  await cards.nth(4).locator('.pass-btn').click()
  check(await storedCount(page, 'neologism:rejected') === 2, 'multiple passes are retained for contrast learning')
  check(await cards.nth(3).locator('.pass-btn').getAttribute('aria-pressed') === 'true', 'pass state is exposed accessibly')

  const status = (await page.locator('.taste-note').textContent()) ?? ''
  check(/Local taste.*3 liked.*2 passed/.test(status), `taste status explains the active model (got "${status.trim()}")`)
  check(
    /evidence 3\/10 likes \+ 2\/10 passes/.test(status),
    `active taste keeps guiding the matched evidence sample (got "${status.trim()}")`,
  )

  const recentBeforeTastePool = await storedCount(page, 'neologism:recent')
  await page.click('.command-go')
  await page.waitForFunction((before) => {
    const raw = localStorage.getItem('neologism:recent')
    return raw ? JSON.parse(raw).length >= before + 10 : false
  }, recentBeforeTastePool)
  const recentAfterTastePool = await storedCount(page, 'neologism:recent')
  const personalizedCards = await cards.count()
  check(
    personalizedCards >= 10 && personalizedCards % 10 === 0,
    'personalized generation still appends complete ten-name pages',
  )
  check(
    recentAfterTastePool - recentBeforeTastePool === personalizedCards,
    'active local taste records only displayed names while selecting from an expanded pool',
  )
  await page.screenshot({ path: join(SHOTS, 'taste-feedback.png'), fullPage: true })

  await page.fill('.command-input', 'a secure password manager for a new project')
  await page.click('.command-go')
  await page.waitForFunction(() => {
    const text = document.querySelector('.taste-note')?.textContent ?? ''
    return /this project.*3 likes.*3 passes left/.test(text)
  })
  const newProjectStatus = (await page.locator('.taste-note').textContent()) ?? ''
  check(
    !/Local taste.*liked/.test(newProjectStatus),
    `another project does not inherit the active profile (got "${newProjectStatus.trim()}")`,
  )

  await page.reload()
  await page.click('.command-go')
  await page.waitForSelector('.taste-note', { timeout: 20000 })
  const restored = (await page.locator('.taste-note').textContent()) ?? ''
  check(/3 liked.*2 passed/.test(restored), 'taste feedback survives a reload')

  await page.click('.sidebar-settings')
  check(await page.locator('.settings-group').count() === 0, 'disabled AI details stay collapsed')
  await page.locator('.settings-toggle input').click()
  check(await page.locator('.settings-group').count() === 1, 'enabling AI reveals provider details')
  await page.locator('.settings-toggle input').click()
  const dataMeta = (await page.locator('.settings-data-meta').textContent()) ?? ''
  check(/3 liked.*2 passed.*6 derived pairs/.test(dataMeta), 'Settings summarizes derived contextual taste pairs')
  const evidenceMeta = (await page.locator('.settings-data-evidence').textContent()) ?? ''
  check(
    /3\/10 matched likes.*2\/10 matched passes.*1 project context/.test(evidenceMeta),
    'Settings distinguishes matched evidence and its project scope from raw label totals',
  )
  await page.screenshot({ path: join(SHOTS, 'taste-export-settings.png'), fullPage: true })
  const downloadPromise = page.waitForEvent('download')
  await page.click('.taste-export-btn')
  const download = await downloadPromise
  check(download.suggestedFilename() === 'neologism-taste.json', 'taste export uses a stable filename')
  const exported = JSON.parse(await readDownload(download))
  check(
    exported.schema === 'neologism-taste-v2' && exported.comparisons.length === 6,
    'downloaded taste data carries the versioned pairwise dataset',
  )
  check(
    exported.examples.every((example) => example.result.sourceMode && example.result.tasteContext),
    'downloaded feedback retains source modes and project context without AI settings',
  )

  await context.close()

  const passOnlyContext = await browser.newContext()
  await passOnlyContext.addInitScript(() => localStorage.setItem('neologism:visited', '1'))
  const passOnlyPage = await passOnlyContext.newPage({ viewport: { width: 1440, height: 1000 } })
  await passOnlyPage.goto(APP_URL)
  await passOnlyPage.click('.command-go')
  await passOnlyPage.waitForSelector('.name-card', { timeout: 20000 })
  const passOnlyCards = passOnlyPage.locator('.name-card')
  for (let index = 0; index < 3; index++) {
    await passOnlyCards.nth(index).locator('.pass-btn').click()
  }
  check(await storedCount(passOnlyPage, 'neologism:rejected') === 3, 'three passes work without any likes')
  const passOnlyStatus = (await passOnlyPage.locator('.taste-note').textContent()) ?? ''
  check(
    /Local taste.*0 liked.*3 passed/.test(passOnlyStatus),
    `pass-only feedback activates local taste (got "${passOnlyStatus.trim()}")`,
  )
  check(
    /evidence 0\/10 likes \+ 0\/10 passes/.test(passOnlyStatus),
    'one-sided local taste does not masquerade as paired evidence',
  )
  await passOnlyPage.screenshot({ path: join(SHOTS, 'taste-pass-only.png'), fullPage: true })
  await passOnlyContext.close()

  const shareContext = await browser.newContext({
    permissions: ['clipboard-read', 'clipboard-write'],
  })
  const sharePage = await shareContext.newPage({ viewport: { width: 1440, height: 900 } })
  const sharedRows = [
    { n: 'SharedAlpha', s: 'big_tech' },
    { n: ' sharedalpha ', s: 'big_tech' },
    { n: 'SharedBeta', s: 'big_tech' },
    { n: 'İsim✨', s: 'big_tech' },
  ]
  const sharedPayload = Buffer.from(JSON.stringify(sharedRows).replace(/[\u007f-\uffff]/g, (character) => (
    `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`
  ))).toString('base64')
  await sharePage.goto(`${APP_URL}#names=${sharedPayload}`)
  await sharePage.waitForFunction(() => document.querySelectorAll('.saved-page .name-card').length === 3)
  check(await storedCount(sharePage, 'neologism:imported-saved') === 3, 'share-link names persist in Saved')
  check(
    await storedCount(sharePage, 'neologism:favorites') === 0
      && await storedCount(sharePage, 'neologism:rejected') === 0,
    'opening a share link creates no explicit taste labels',
  )
  await sharePage.click('.sidebar-settings')
  const shareDataMeta = (await sharePage.locator('.settings-data-meta').textContent()) ?? ''
  check(
    /0 liked.*0 passed.*0 derived pairs/.test(shareDataMeta)
      && await sharePage.locator('.taste-export-btn').isDisabled(),
    'share-only Saved names cannot enter a taste export',
  )
  await sharePage.getByTitle('Close').click()
  await sharePage.reload()
  await sharePage.locator('.sidebar').getByRole('button', { name: /^Saved(?:\s+\d+)?$/ }).click()
  check(
    await sharePage.locator('.saved-page .name-card').count() === 3,
    'imported Saved names survive reload after the share hash is cleared',
  )
  const txtPromise = sharePage.waitForEvent('download')
  await sharePage.getByRole('button', { name: 'TXT' }).click()
  const txtNames = (await readDownload(await txtPromise)).trim().split(/\r?\n/)
  check(
    txtNames.length === 3
      && new Set(txtNames.map((name) => name.toLowerCase())).size === 3
      && txtNames.includes('İsim✨'),
    'Saved TXT export contains one row per normalized spelling',
  )
  const jsonPromise = sharePage.waitForEvent('download')
  await sharePage.getByRole('button', { name: 'JSON' }).click()
  const sharedJson = JSON.parse(await readDownload(await jsonPromise))
  check(
    sharedJson.length === 3
      && sharedJson.every((item) => Object.keys(item).sort().join(',') === 'name,style')
      && sharedJson.some((item) => item.name === 'İsim✨'),
    'Saved JSON export is deduped and carries no taste or project context',
  )
  await sharePage.getByRole('button', { name: 'Share link' }).click()
  const forwardedUrl = await sharePage.evaluate(() => navigator.clipboard.readText())
  const forwardedRows = JSON.parse(Buffer.from(forwardedUrl.split('#names=')[1], 'base64').toString('utf8'))
  check(
    forwardedRows.length === 3
      && forwardedRows.every((item) => Object.keys(item).sort().join(',') === 'n,s')
      && forwardedRows.some((item) => item.n === 'İsim✨'),
    'forwarded share links stay deduped and omit labels and context',
  )
  await sharePage.getByRole('button', { name: /Create/ }).click()
  await sharePage.click('.command-go')
  await sharePage.waitForSelector('.name-card', { timeout: 20000 })
  const shareOnlyStatus = (await sharePage.locator('.taste-note').textContent()) ?? ''
  check(
    /Teach local taste.*3 likes.*3 passes left/.test(shareOnlyStatus),
    `share-only Saved names cannot activate personalization (got "${shareOnlyStatus.trim()}")`,
  )
  await sharePage.locator('.name-card').first().locator('.star-btn').click()
  check(
    await storedCount(sharePage, 'neologism:favorites') === 1
      && await storedCount(sharePage, 'neologism:imported-saved') === 3,
    'an explicit generated-name star records taste without mutating imported Saved names',
  )
  await shareContext.close()

  const quotaContext = await browser.newContext()
  await quotaContext.addInitScript(() => {
    localStorage.setItem('neologism:visited', '1')
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function setItem(key, value) {
      if (key === 'neologism:imported-saved') throw new DOMException('quota', 'QuotaExceededError')
      return original.call(this, key, value)
    }
  })
  const quotaPage = await quotaContext.newPage({ viewport: { width: 1200, height: 800 } })
  await quotaPage.goto(`${APP_URL}#names=${sharedPayload}`)
  await quotaPage.waitForFunction(() => document.querySelectorAll('.saved-page .name-card').length === 3)
  check(
    await storedCount(quotaPage, 'neologism:imported-saved') === 0
      && (await quotaPage.evaluate(() => location.hash)).startsWith('#names='),
    'a failed import write preserves the recovery share URL instead of clearing it',
  )
  await quotaContext.close()

  const invalidShareContext = await browser.newContext()
  await invalidShareContext.addInitScript(() => localStorage.setItem('neologism:visited', '1'))
  const invalidHashes = [
    '#names=not-base64',
    `#names=${Buffer.from(JSON.stringify([{}])).toString('base64')}`,
    `#names=${Buffer.from(JSON.stringify(Array.from(
      { length: 201 },
      (_, index) => ({ n: `Name${index}`, s: 'big_tech' }),
    ))).toString('base64')}`,
  ]
  let invalidSharePage
  for (const [index, hash] of invalidHashes.entries()) {
    if (invalidSharePage) await invalidSharePage.close()
    invalidSharePage = await invalidShareContext.newPage({ viewport: { width: 1200, height: 800 } })
    await invalidSharePage.goto(`${APP_URL}${hash}`)
    await invalidSharePage.waitForFunction(() => location.hash === '')
    check(
      await invalidSharePage.locator('.saved-page').count() === 0,
      `invalid share case ${index + 1} clears into the normal app instead of trapping empty Saved`,
    )
  }
  if (!invalidSharePage) throw new Error('invalid-share fixtures did not run')
  await invalidSharePage.reload()
  check(
    await invalidSharePage.locator('.saved-page').count() === 0
      && await invalidSharePage.locator('.command-bar').count() === 1,
    'an invalid share remains recoverable after reload',
  )
  await invalidShareContext.close()

  const failedMigrationStubs = ['OldSharedA', 'OldSharedB', 'OldSharedC'].map((name) => ({
    name,
    style: 'big_tech',
    score_pronounce: 0,
    score_novelty: 0,
    score_memorability: 0,
    connotations: [],
    syllables: 0,
  }))
  const failedMigrationContext = await browser.newContext()
  await failedMigrationContext.addInitScript((stubs) => {
    localStorage.setItem('neologism:visited', '1')
    if (!localStorage.getItem('phase145:failed-migration-seeded')) {
      localStorage.setItem('neologism:favorites', JSON.stringify(stubs))
      localStorage.setItem('neologism:imported-saved', '{}')
      localStorage.setItem('phase145:failed-migration-seeded', '1')
    }
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function setItem(key, value) {
      if (key === 'neologism:imported-saved') throw new DOMException('quota', 'QuotaExceededError')
      return original.call(this, key, value)
    }
  }, failedMigrationStubs)
  const failedMigrationPage = await failedMigrationContext.newPage({ viewport: { width: 1200, height: 800 } })
  await failedMigrationPage.goto(APP_URL)
  await failedMigrationPage.locator('.sidebar').getByRole('button', { name: /^Saved(?:\s+\d+)?$/ }).click()
  const failedMigrationSavedCount = await failedMigrationPage.locator('.saved-page .name-card').count()
  const failedMigrationFavoriteCount = await storedCount(failedMigrationPage, 'neologism:favorites')
  check(
    failedMigrationSavedCount === 3 && failedMigrationFavoriteCount === 3,
    `failed historical migration keeps all share names recoverable in Saved (cards ${failedMigrationSavedCount}, stored ${failedMigrationFavoriteCount})`,
  )
  await failedMigrationPage.click('.sidebar-settings')
  const failedMigrationMeta = (await failedMigrationPage.locator('.settings-data-meta').textContent()) ?? ''
  check(
    /0 liked.*0 passed.*0 derived pairs/.test(failedMigrationMeta)
      && await failedMigrationPage.locator('.taste-export-btn').isDisabled(),
    'failed historical migration cannot restore false taste evidence',
  )
  await failedMigrationPage.getByTitle('Close').click()
  await failedMigrationPage.getByRole('button', { name: /Create/ }).click()
  await failedMigrationPage.click('.command-go')
  await failedMigrationPage.waitForSelector('.taste-note', { timeout: 20000 })
  check(
    /Teach local taste.*3 likes.*3 passes left/.test(
      (await failedMigrationPage.locator('.taste-note').textContent()) ?? '',
    ),
    'failed historical migration cannot activate the local taste profile',
  )
  await failedMigrationPage.locator('.results-grid .name-card').first().locator('.star-btn').click()
  await failedMigrationPage.reload()
  await failedMigrationPage.locator('.sidebar').getByRole('button', { name: /^Saved(?:\s+\d+)?$/ }).click()
  const recoveredOldCards = await failedMigrationPage.locator('.saved-page .name-card').filter({ hasText: /OldShared/ }).count()
  await failedMigrationPage.click('.sidebar-settings')
  const recoveredMigrationMeta = (await failedMigrationPage.locator('.settings-data-meta').textContent()) ?? ''
  check(
    recoveredOldCards === 3 && /1 liked.*0 passed/.test(recoveredMigrationMeta),
    'a later explicit star preserves failed-migration share names without converting them to taste',
  )
  await failedMigrationContext.close()

  const removalFailureLike = {
    name: 'AtomicSaved',
    style: 'big_tech',
    tasteContext: { id: 'project-a', description: 'project-a', roots: [] },
    score_pronounce: 85,
    score_novelty: 90,
    score_memorability: 80,
    connotations: [],
    syllables: 2,
  }
  const removalFailureStub = {
    name: 'AtomicSaved',
    style: 'big_tech',
    score_pronounce: 0,
    score_novelty: 0,
    score_memorability: 0,
    connotations: [],
    syllables: 0,
  }
  const removalFailureContext = await browser.newContext()
  await removalFailureContext.addInitScript(({ liked, imported }) => {
    localStorage.setItem('neologism:visited', '1')
    if (!localStorage.getItem('phase145:removal-failure-seeded')) {
      localStorage.setItem('neologism:favorites', JSON.stringify([liked]))
      localStorage.setItem('neologism:imported-saved', JSON.stringify([imported]))
      localStorage.setItem('phase145:removal-failure-seeded', '1')
    }
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function setItem(key, value) {
      if (key === 'neologism:imported-saved') throw new DOMException('quota', 'QuotaExceededError')
      return original.call(this, key, value)
    }
  }, { liked: removalFailureLike, imported: removalFailureStub })
  const removalFailurePage = await removalFailureContext.newPage({ viewport: { width: 1200, height: 800 } })
  const removalDialogs = []
  removalFailurePage.on('dialog', async (dialog) => {
    removalDialogs.push(dialog.message())
    await dialog.accept()
  })
  await removalFailurePage.goto(APP_URL)
  await removalFailurePage.locator('.sidebar').getByRole('button', { name: /^Saved(?:\s+\d+)?$/ }).click()
  await removalFailurePage.locator('.saved-page .star-btn').click()
  check(
    removalDialogs.some((message) => /browser storage rejected/.test(message))
      && await storedCount(removalFailurePage, 'neologism:favorites') === 1
      && await storedCount(removalFailurePage, 'neologism:imported-saved') === 1,
    'a failed multi-key removal reports failure and leaves both durable sources unchanged',
  )
  await removalFailurePage.reload()
  await removalFailurePage.locator('.sidebar').getByRole('button', { name: /^Saved(?:\s+\d+)?$/ }).click()
  check(
    await removalFailurePage.locator('.saved-page .name-card').count() === 1,
    'a failed multi-key removal cannot claim success and then resurrect on reload',
  )
  await removalFailureContext.close()

  const partialMigrationContext = await browser.newContext()
  await partialMigrationContext.addInitScript((stub) => {
    localStorage.setItem('neologism:visited', '1')
    if (!localStorage.getItem('phase145:partial-migration-seeded')) {
      localStorage.setItem('neologism:favorites', JSON.stringify([stub]))
      localStorage.setItem('phase145:partial-migration-seeded', '1')
      const original = Storage.prototype.setItem
      globalThis.__originalStorageSetItem = original
      Storage.prototype.setItem = function setItem(key, value) {
        if (key === 'neologism:favorites') throw new DOMException('quota', 'QuotaExceededError')
        return original.call(this, key, value)
      }
    }
  }, { ...removalFailureStub, name: 'PartialLegacy' })
  const partialMigrationPage = await partialMigrationContext.newPage({ viewport: { width: 1200, height: 800 } })
  await partialMigrationPage.goto(APP_URL)
  await partialMigrationPage.evaluate(() => {
    Storage.prototype.setItem = globalThis.__originalStorageSetItem
  })
  await partialMigrationPage.locator('.sidebar').getByRole('button', { name: /^Saved(?:\s+\d+)?$/ }).click()
  await partialMigrationPage.locator('.saved-page .star-btn').click()
  await partialMigrationPage.reload()
  const partialFavoriteCount = await storedCount(partialMigrationPage, 'neologism:favorites')
  const partialImportedCount = await storedCount(partialMigrationPage, 'neologism:imported-saved')
  check(
    partialFavoriteCount === 0
      && partialImportedCount === 0
      && await partialMigrationPage.locator('.saved-page .name-card').count() === 0,
    `removal after a partial migration cleanup cannot resurrect the stale historical stub (favorites ${partialFavoriteCount}, imported ${partialImportedCount})`,
  )
  await partialMigrationContext.close()

  const migrationContext = await browser.newContext()
  await migrationContext.addInitScript(() => {
    localStorage.setItem('neologism:visited', '1')
    if (localStorage.getItem('phase145:migration-seeded')) return
    const oldShareStub = {
      name: 'OldSharedOnly',
      style: 'big_tech',
      score_pronounce: 0,
      score_novelty: 0,
      score_memorability: 0,
      connotations: [],
      syllables: 0,
    }
    const explicit = (name, context) => ({
      name,
      style: 'big_tech',
      tasteContext: context
        ? { id: context, description: context, roots: [] }
        : undefined,
      score_pronounce: 85,
      score_novelty: 90,
      score_memorability: 80,
      connotations: [],
      syllables: 2,
    })
    localStorage.setItem('neologism:favorites', JSON.stringify([
      oldShareStub,
      explicit('LegacyLiked'),
      explicit('SharedEverywhere', 'project-a'),
      explicit('SHAREDEVERYWHERE', 'project-b'),
    ]))
    localStorage.setItem('neologism:imported-saved', JSON.stringify([
      {
        ...oldShareStub,
        name: 'SharedEverywhere',
      },
    ]))
    localStorage.setItem('neologism:rejected', JSON.stringify([
      explicit('SharedEverywhere', 'project-c'),
    ]))
    localStorage.setItem('phase145:migration-seeded', '1')
  })
  const migrationPage = await migrationContext.newPage({ viewport: { width: 1440, height: 1000 } })
  await migrationPage.goto(APP_URL)
  check(
    await storedCount(migrationPage, 'neologism:favorites') === 3
      && await storedCount(migrationPage, 'neologism:imported-saved') === 2,
    'historical share stubs migrate while genuine legacy and scoped likes remain explicit',
  )
  await migrationPage.reload()
  check(
    await storedCount(migrationPage, 'neologism:favorites') === 3
      && await storedCount(migrationPage, 'neologism:imported-saved') === 2,
    'historical share migration is idempotent across repeated app initialization',
  )
  await migrationPage.click('.sidebar-settings')
  const migrationExportPromise = migrationPage.waitForEvent('download')
  await migrationPage.click('.taste-export-btn')
  const migrationExport = JSON.parse(await readDownload(await migrationExportPromise))
  check(
    migrationExport.examples.length === 4
      && migrationExport.examples.every((example) => example.result.name !== 'OldSharedOnly'),
    'migrated share-only names stay out of taste exports while genuine legacy likes remain',
  )
  await migrationPage.getByTitle('Close').click()
  await migrationPage.locator('.sidebar').getByRole('button', { name: /^Saved(?:\s+\d+)?$/ }).click()
  check(
    await migrationPage.locator('.saved-page .name-card').count() === 3
      && await migrationPage.getByText('Saved from a shared link · not taste evidence').count() === 1
      && await migrationPage.getByText(/liked in 2 projects.*also received by share/i).count() === 1,
    'Saved explains imported-only and multi-project provenance without duplicate cards',
  )
  const oldSharedCard = migrationPage.locator('.name-card').filter({ hasText: 'OldSharedOnly' })
  check(
    await oldSharedCard.locator('.card-score').textContent() === 'Shared'
      && !/0 syllables/.test((await oldSharedCard.textContent()) ?? ''),
    'share-only cards do not present missing scores or syllables as zero-quality evidence',
  )
  const sharedEverywhere = migrationPage.locator('.name-card').filter({ hasText: 'SharedEverywhere' })
  let removalPrompt = ''
  migrationPage.once('dialog', async (dialog) => {
    removalPrompt = dialog.message()
    await dialog.dismiss()
  })
  await sharedEverywhere.locator('.star-btn').click()
  check(
    /2 explicit likes and its shared copy.*Passes are kept/.test(removalPrompt)
      && await storedCount(migrationPage, 'neologism:favorites') === 3,
    'multi-source Saved removal requires explicit confirmation and cancel preserves every source',
  )
  migrationPage.once('dialog', (dialog) => dialog.accept())
  await sharedEverywhere.locator('.star-btn').click()
  check(
    await storedCount(migrationPage, 'neologism:favorites') === 1
      && await storedCount(migrationPage, 'neologism:imported-saved') === 1
      && await storedCount(migrationPage, 'neologism:rejected') === 1,
    'confirmed Saved removal clears positive/share copies but preserves other-context passes',
  )
  await migrationContext.close()

  const referenceContext = await browser.newContext()
  await referenceContext.addInitScript(() => localStorage.setItem('neologism:visited', '1'))
  const referencePage = await referenceContext.newPage({ viewport: { width: 1440, height: 1000 } })
  await referencePage.goto(APP_URL)
  await referencePage.locator('.command-input').fill(
    'an offline naming engine for developer projects that checks npm and crates.io',
  )
  await referencePage.locator('.chips-row .chip-wrap:last-child > .chip').click()
  await referencePage.locator('.taste-reference-input').fill('Vercel, Linear, Notion')
  check(
    await referencePage.evaluate(() => localStorage.getItem('neologism:taste-references'))
      === 'Vercel, Linear, Notion',
    'reference names are stored separately in the browser',
  )
  await referencePage.click('.command-go')
  await referencePage.waitForFunction(() => document.querySelectorAll('.name-card').length === 10)
  const referenceCards = referencePage.locator('.name-card')
  const referenceStatus = (await referencePage.locator('.taste-note').textContent()) ?? ''
  check(await referenceCards.count() === 10, 'reference taste still renders ten selected names')
  check(
    await storedCount(referencePage, 'neologism:recent') === await referenceCards.count(),
    'expanded reference ranking records only the ten names the user actually saw',
  )
  check(
    /Local taste.*3 refs.*0 liked.*0 passed/.test(referenceStatus),
    `reference status explains the active local model (got "${referenceStatus.trim()}")`,
  )
  check(
    await storedCount(referencePage, 'neologism:favorites') === 0
      && await storedCount(referencePage, 'neologism:rejected') === 0,
    'reference names do not masquerade as explicit likes or passes',
  )
  await referencePage.locator('.chips-row .chip-wrap:last-child > .chip').click()
  check(
    (await referencePage.locator('.menu-progress').textContent())?.trim() === '3/3',
    'Advanced shows when reference taste is ready',
  )
  await referencePage.waitForTimeout(700)
  await referencePage.screenshot({ path: join(SHOTS, 'taste-references.png'), fullPage: true })
  await referencePage.reload()
  await referencePage.locator('.chips-row .chip-wrap:last-child > .chip').click()
  check(
    await referencePage.locator('.taste-reference-input').inputValue() === 'Vercel, Linear, Notion',
    'reference names survive a reload',
  )
  await referenceContext.close()

  const compoundReferenceContext = await browser.newContext()
  await compoundReferenceContext.addInitScript(() => localStorage.setItem('neologism:visited', '1'))
  const compoundReferencePage = await compoundReferenceContext.newPage({
    viewport: { width: 1440, height: 600 },
  })
  await compoundReferencePage.goto(APP_URL)
  await compoundReferencePage.locator('.command-input').fill('a secure password manager for teams')
  await compoundReferencePage.locator('.chips-row .chip-wrap:last-child > .chip').click()
  await compoundReferencePage.locator('.taste-reference-input').fill('GitHub, DoorDash, YouTube')
  await compoundReferencePage.click('.command-go')
  await compoundReferencePage.waitForFunction(() => document.querySelectorAll('.name-card').length === 10)
  const compoundReferenceNames = await compoundReferencePage.locator('.name-text').allTextContents()
  const twoPartNames = compoundReferenceNames.filter((name) => /[a-z][A-Z]/.test(name))
  check(
    twoPartNames.length > 0 && twoPartNames.length <= 3,
    `strong two-part references add a bounded Compound accent (got ${twoPartNames.length})`,
  )
  check(
    await storedCount(compoundReferencePage, 'neologism:recent') === compoundReferenceNames.length,
    'mode-aware reference ranking still records only displayed names',
  )
  await compoundReferenceContext.close()
} catch (error) {
  console.error('SCRIPT ERROR:', error.message)
  failures++
} finally {
  await browser.close()
  if (process.platform === 'win32') spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
  else server.kill()
}

if (failures > 0) {
  console.error(`${failures} check(s) failed`)
  process.exitCode = 1
} else {
  console.log('taste feedback e2e: all checks passed')
}
