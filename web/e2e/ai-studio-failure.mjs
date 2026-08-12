// Phase 152 browser contract: an AI ranking failure never hides the local pool,
// lies about the displayed order, drops keyboard focus, or starts a second call.
// Run after `npm run build`: node e2e/ai-studio-failure.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PORT = 4211
const APP_URL = `http://localhost:${PORT}`
const E2E_DIR = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = join(E2E_DIR, '..')
const viteCli = join(WEB_DIR, 'node_modules', 'vite', 'bin', 'vite.js')
const EXPECTED_CHECKS = 44

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
const unexpectedExternal = []
const pageErrors = []
let modelRequests = 0

const check = (ok, label) => {
  checks++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) failures++
}

const deferred = () => {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

function requestSnapshot(request) {
  const body = JSON.parse(request.postData() ?? '{}')
  const content = body.messages?.[0]?.content ?? ''
  const names = [...content.matchAll(/^\s*\d+\.\s+(.+)$/gm)].map((match) => match[1].trim())
  const criterion = content.match(/on ONE criterion: how much each name (.+)\.\s*$/m)?.[1] ?? ''
  return { names, criterion, body }
}

function rankedReply(names, prefix) {
  const judgments = names.map((_, index) => ({
    i: index + 1,
    score: index + 1,
    reason: `${prefix}-${index + 1}`,
  }))
  return JSON.stringify({ choices: [{ message: { content: JSON.stringify(judgments) } }] })
}

async function storageSnapshot(page) {
  return page.evaluate(() => JSON.stringify({
    local: Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)]),
    session: Object.keys(sessionStorage).sort().map((key) => [key, sessionStorage.getItem(key)]),
  }))
}

async function nonJudgeStorageSnapshot(page) {
  return page.evaluate(() => JSON.stringify({
    local: Object.keys(localStorage)
      .filter((key) => key !== 'neologism:judge')
      .sort()
      .map((key) => [key, localStorage.getItem(key)]),
    session: Object.keys(sessionStorage).sort().map((key) => [key, sessionStorage.getItem(key)]),
  }))
}

async function resultSnapshot(page) {
  const cards = page.locator('.ai-studio .name-card')
  return {
    names: await cards.locator('.name-text').allTextContents(),
    reasons: await cards.locator('.card-ai-reason').allTextContents(),
    picks: await page.locator('.ai-studio .name-card:has(.card-aipick) .name-text').allTextContents(),
    meta: (await page.locator('.studio-meta').textContent())?.replace(/\s+/g, ' ').trim() ?? '',
  }
}

async function horizontalFit(page) {
  return page.evaluate(() => {
    const tolerance = 1
    const viewport = window.innerWidth
    const elements = Array.from(document.querySelectorAll(
      '.ai-studio, .studio-alert, .studio-alert button, .ai-studio .name-card',
    ))
    const fits = elements.every((element) => {
      const rect = element.getBoundingClientRect()
      return rect.width > 0 && rect.left >= -tolerance && rect.right <= viewport + tolerance
    })
    return {
      fits,
      scrollX: window.scrollX,
      scrollWidth: document.documentElement.scrollWidth,
      viewport,
    }
  })
}

async function studioPage(viewport, respond) {
  const context = await browser.newContext({ viewport })
  const calls = []
  await context.addInitScript(() => {
    localStorage.setItem('neologism:visited', '1')
    localStorage.setItem('neologism:judge', JSON.stringify({
      enabled: true,
      provider: 'openrouter',
      apiKey: 'fixture-key',
      model: 'fixture-model',
    }))
  })
  await context.route('https://**/*', async (route) => {
    if (route.request().url().endsWith('/models')) {
      modelRequests++
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":[]}' })
      return
    }
    if (route.request().url().endsWith('/chat/completions')) {
      const snapshot = requestSnapshot(route.request())
      calls.push(snapshot)
      await respond(route, calls.length, snapshot)
      return
    }
    unexpectedExternal.push(route.request().url())
    await route.abort('blockedbyclient')
  })
  const page = await context.newPage()
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.goto(APP_URL)
  await page.getByRole('button', { name: /^AI Studio$/ }).click()
  await page.locator('.ai-studio').waitFor({ state: 'visible' })
  return { context, page, calls }
}

try {
  // First ranking failure: preserve and truthfully expose the local engine pool.
  {
    const retryGate = deferred()
    const { context, page, calls } = await studioPage({ width: 390, height: 844 }, async (route, call, request) => {
      if (call === 1) {
        await route.fulfill({ status: 503, body: 'fixture unavailable' })
        return
      }
      await retryGate.promise
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: rankedReply(request.names, 'brandable-retry'),
      })
    })
    const storageBefore = await storageSnapshot(page)
    const generate = page.getByRole('button', { name: 'Generate', exact: true })
    const rankingStatus = page.locator('.studio-ranking-status')
    await generate.focus()
    await page.keyboard.press('Enter')
    const alert = page.getByRole('alert')
    await alert.waitFor({ state: 'visible' })
    const first = await resultSnapshot(page)
    await page.locator('.ai-studio').screenshot({ path: join(E2E_DIR, 'shots', 'ai-studio-first-failure-390.png') })

    check(calls.length === 1, 'first Generate makes exactly one ranking request')
    check(
      calls[0]?.names.length === 24 && new Set(calls[0].names.map((name) => name.toLowerCase())).size === 24,
      'first request carries 24 unique locally generated names',
    )
    check(/real, distinctive brand/i.test(calls[0]?.criterion ?? ''), 'first request freezes the Brandable criterion')
    check(
      (await alert.textContent())?.includes('Brandable ranking is unavailable. Showing the unranked local pool.')
        && await rankingStatus.getAttribute('role') === 'status'
        && await rankingStatus.getAttribute('aria-live') === 'polite'
        && await rankingStatus.getAttribute('aria-atomic') === 'true'
        && (await rankingStatus.textContent())?.trim() === '',
      'first failure exposes its exact accessible Brandable fallback message',
    )
    check(first.names.join('|') === calls[0].names.join('|'), 'all 24 cards remain in exact local engine order')
    check(first.reasons.length === 0 && first.picks.length === 0, 'unranked fallback invents no AI reasons or pick')
    check(
      first.meta.includes('Unranked local pool') && !first.meta.includes('Ranked by Brandable'),
      'fallback metadata never calls the local order AI-ranked',
    )
    check(await page.locator('.ai-studio .empty-state').count() === 0, 'ranking failure never restores the pre-generation empty state')
    check(await generate.evaluate((button) => document.activeElement === button), 'Generate retains focus through its failed async request')
    check(await alert.getByRole('button').count() === 2, 'failure exposes Retry ranking and Open Settings recovery actions')

    const openSettings = alert.getByRole('button', { name: 'Open Settings' })
    await openSettings.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Settings' })
    await dialog.waitFor({ state: 'visible' })
    check(await dialog.getByRole('heading', { name: 'Settings' }).isVisible(), 'recovery action opens the existing Settings dialog')
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'detached' })
    check(await openSettings.evaluate((button) => document.activeElement === button), 'closing Settings restores the exact recovery action')

    const retry = alert.getByRole('button', { name: 'Retry ranking' })
    await retry.focus()
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => document.querySelector('[role="alert"]')?.getAttribute('aria-busy') === 'true')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(100)
    check(calls.length === 2, 'repeated Retry activation while pending cannot create a duplicate request')
    check(
      calls[1].names.join('|') === calls[0].names.join('|') && calls[1].criterion === calls[0].criterion,
      'Retry uses the byte-identical 24-name pool and frozen criterion',
    )
    retryGate.resolve()
    await alert.waitFor({ state: 'detached' })
    await page.waitForFunction(() => document.querySelectorAll('.ai-studio .card-ai-reason').length === 24)
    const recovered = await resultSnapshot(page)
    const brandableChip = page.getByRole('button', { name: 'Brandable', exact: true })
    check(
      recovered.reasons.length === 24 && recovered.picks.length === 1 && recovered.meta.includes('Ranked by Brandable'),
      'successful Retry produces 24 reasons, one pick, and the true Brandable label',
    )
    check(
      (await rankingStatus.textContent())?.trim() === '24 names ranked by Brandable.',
      'successful Retry announces the exact verified ranking total and label',
    )
    check(await brandableChip.evaluate((button) => document.activeElement === button), 'successful Retry restores focus before removing its button')
    const fit = await horizontalFit(page)
    check(fit.fits && fit.scrollX === 0 && fit.scrollWidth <= fit.viewport + 1, `390px fallback and recovered cards stay horizontally contained (${JSON.stringify(fit)})`)
    check(await storageSnapshot(page) === storageBefore, 'first-failure and Retry lifecycle leaves browser storage byte-identical')
    await context.close()
  }

  // Later metric failure: preserve the prior successful order and block races.
  {
    const premiumFailureGate = deferred()
    const premiumRetryGate = deferred()
    const { context, page, calls } = await studioPage({ width: 320, height: 700 }, async (route, call, request) => {
      if (call === 1) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: rankedReply(request.names, 'brandable'),
        })
        return
      }
      if (call === 2) {
        await premiumFailureGate.promise
        await route.fulfill({ status: 503, body: 'fixture unavailable' })
        return
      }
      await premiumRetryGate.promise
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: rankedReply(request.names, 'premium-retry'),
      })
    })
    const storageBefore = await nonJudgeStorageSnapshot(page)
    const generate = page.getByRole('button', { name: 'Generate', exact: true })
    const rankingStatus = page.locator('.studio-ranking-status')
    await generate.focus()
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => document.querySelectorAll('.ai-studio .card-ai-reason').length === 24)
    const brandable = await resultSnapshot(page)
    check(
      calls.length === 1 && brandable.reasons.length === 24 && brandable.picks.length === 1 && brandable.meta.includes('Ranked by Brandable'),
      'initial successful ranking establishes a complete truthful Brandable view',
    )
    check(
      (await rankingStatus.textContent())?.trim() === '24 names ranked by Brandable.',
      'initial success announces only the completed Brandable ranking',
    )

    const premium = page.getByRole('button', { name: 'Premium', exact: true })
    await premium.focus()
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => document.querySelector('.studio-meta')?.textContent?.includes('ranking by Premium'))
    await premium.evaluate((button) => button.click())
    await page.getByRole('button', { name: 'Playful', exact: true }).evaluate((button) => button.click())
    await page.waitForTimeout(100)
    check(calls.length === 2, 'rapid Premium/Playful activation during pending work starts no competing request')
    check(
      await premium.getAttribute('aria-pressed') === 'true'
        && await page.getByRole('button', { name: 'Playful', exact: true }).getAttribute('aria-pressed') === 'false',
      'blocked pending controls cannot drift the selected metric',
    )
    premiumFailureGate.resolve()
    const alert = page.getByRole('alert')
    await alert.waitFor({ state: 'visible' })
    const preserved = await resultSnapshot(page)
    await page.locator('.ai-studio').screenshot({ path: join(E2E_DIR, 'shots', 'ai-studio-later-failure-320.png') })
    check(calls.length === 2, 'Premium failure never auto-retries')
    check(
      (await alert.textContent())?.includes('Premium ranking is unavailable. Still showing the Brandable ranking.')
        && (await rankingStatus.textContent())?.trim() === '',
      'later failure names both the failed Premium attempt and preserved Brandable view',
    )
    check(
      JSON.stringify({ names: preserved.names, reasons: preserved.reasons, picks: preserved.picks })
        === JSON.stringify({ names: brandable.names, reasons: brandable.reasons, picks: brandable.picks }),
      'failed metric leaves the prior order, reasons, and pick byte-identical',
    )
    check(
      preserved.meta.includes('Ranked by Brandable') && !preserved.meta.includes('Ranked by Premium'),
      'display metadata remains tied to the last successful metric',
    )
    check(await premium.evaluate((button) => document.activeElement === button), 'failed metric request preserves focus on its invoking chip')

    const retry = alert.getByRole('button', { name: 'Retry ranking' })
    await retry.focus()
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => document.querySelector('[role="alert"]')?.getAttribute('aria-busy') === 'true')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(100)
    check(calls.length === 3, 'pending Premium Retry also rejects duplicate activation')
    check(
      calls[2].names.join('|') === calls[1].names.join('|') && calls[2].criterion === calls[1].criterion,
      'Premium Retry preserves the failed pool and criterion snapshot',
    )
    premiumRetryGate.resolve()
    await alert.waitFor({ state: 'detached' })
    await page.waitForFunction(() => document.querySelectorAll('.ai-studio .card-ai-reason').length === 24)
    const premiumRecovered = await resultSnapshot(page)
    check(
      premiumRecovered.meta.includes('Ranked by Premium')
        && premiumRecovered.reasons.every((reason) => reason.includes('premium-retry'))
        && premiumRecovered.picks.length === 1,
      'successful Premium Retry replaces the view with its own reasons, pick, and label',
    )
    check(
      (await rankingStatus.textContent())?.trim() === '24 names ranked by Premium.',
      'Premium Retry announces only its completed verified ranking',
    )
    check(await premium.evaluate((button) => document.activeElement === button), 'Premium Retry restores focus to its persistent metric chip')
    const brandableChip = page.getByRole('button', { name: 'Brandable', exact: true })
    await brandableChip.click()
    await page.waitForFunction(() => document.querySelector('.studio-ranking-status')?.textContent?.includes('Brandable'))
    const cachedBrandable = await resultSnapshot(page)
    check(
      calls.length === 3
        && cachedBrandable.reasons.every((reason) => reason.includes('brandable'))
        && (await rankingStatus.textContent())?.trim() === '24 names ranked by Brandable.'
        && await brandableChip.evaluate((button) => document.activeElement === button),
      'cached Brandable return adds no request and announces the restored verified ranking',
    )
    await page.locator('.sidebar-settings').click()
    let dialog = page.getByRole('dialog', { name: 'Settings' })
    await dialog.getByRole('checkbox', { name: 'Enable AI re-rank' }).uncheck()
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    await page.locator('.studio-setup').waitFor({ state: 'visible' })
    await page.waitForFunction(() => document.querySelector('.studio-ranking-status')?.textContent?.trim() === '')
    check(
      (await rankingStatus.textContent())?.trim() === ''
        && await page.locator('.ai-studio .name-card').count() === 0,
      'disabling AI hides the ranked view and clears its stale success status',
    )
    await page.locator('.sidebar-settings').click()
    dialog = page.getByRole('dialog', { name: 'Settings' })
    await dialog.getByRole('checkbox', { name: 'Enable AI re-rank' }).check()
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    await page.waitForFunction(() => document.querySelectorAll('.ai-studio .name-card').length === 24)
    check(
      calls.length === 3
        && (await rankingStatus.textContent())?.trim() === ''
        && (await page.locator('.studio-meta').textContent())?.includes('Ranked by Brandable'),
      're-enabling AI restores the local view without replaying stale live success or adding a request',
    )
    const fit = await horizontalFit(page)
    check(fit.fits && fit.scrollX === 0 && fit.scrollWidth <= fit.viewport + 1, `320px alert, recovery actions, and cards stay horizontally contained (${JSON.stringify(fit)})`)
    check(
      await nonJudgeStorageSnapshot(page) === storageBefore,
      'later-failure, Retry, and AI enable lifecycle leave non-judge browser storage byte-identical',
    )
    await context.close()
  }

  // Settings changes are request identity: never reuse the prior model's
  // per-metric Studio result for the same pool.
  {
    const { context, page, calls } = await studioPage({ width: 390, height: 844 }, async (route, _call, request) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: rankedReply(request.names, `model-${request.body.model}`),
      })
    })
    const generate = page.getByRole('button', { name: 'Generate', exact: true })
    await generate.click()
    await page.waitForFunction(() => document.querySelectorAll('.ai-studio .card-ai-reason').length === 24)
    const initial = await resultSnapshot(page)
    check(
      calls.length === 1
        && calls[0].body.model === 'fixture-model'
        && initial.reasons.every((reason) => reason.includes('model-fixture-model')),
      'initial Brandable ranking is visibly owned by the configured model',
    )

    await page.locator('.sidebar-settings').click()
    const dialog = page.getByRole('dialog', { name: 'Settings' })
    const model = dialog.getByRole('combobox', { name: /Model/ })
    await model.fill('fixture-model-b')
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    check(
      await page.evaluate(() => JSON.parse(localStorage.getItem('neologism:judge') ?? '{}').model) === 'fixture-model-b',
      'Settings commits the second model before the same metric is requested again',
    )

    const namesBefore = initial.names.join('|')
    await page.getByRole('button', { name: 'Brandable', exact: true }).click()
    await page.waitForTimeout(200)
    const reranked = await resultSnapshot(page)
    check(
      calls.length === 2 && calls[1]?.body.model === 'fixture-model-b',
      'the same metric performs a fresh request after the configured model changes',
    )
    check(
      reranked.reasons.length === 24
        && reranked.reasons.every((reason) => reason.includes('model-fixture-model-b')),
      'the visible reasons come from the newly configured model rather than the stale metric cache',
    )
    check(
      reranked.names.join('|') === namesBefore,
      'model replacement reranks the byte-identical local pool instead of regenerating names',
    )
    await context.close()
  }

  check(
    unexpectedExternal.length === 0 && pageErrors.length === 0 && modelRequests <= 1,
    `fixture observes no unexpected external HTTPS requests, model-list burst, or page errors (${JSON.stringify({ modelRequests, unexpectedExternal, pageErrors })})`,
  )
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
  console.error(`AI Studio failure browser: ${failures} failure(s), ${checks}/${EXPECTED_CHECKS} checks executed`)
  process.exitCode = 1
} else {
  console.log(`AI Studio failure browser: ${checks}/${EXPECTED_CHECKS} checks passed`)
}
