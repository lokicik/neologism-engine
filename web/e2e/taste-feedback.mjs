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
  check(/3 liked.*2 passed.*6 same-project pairs/.test(dataMeta), 'Settings summarizes contextual pairwise taste data')
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
  await passOnlyPage.screenshot({ path: join(SHOTS, 'taste-pass-only.png'), fullPage: true })
  await passOnlyContext.close()

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
