// Phase 146/150 browser contract: domain evidence is explicit, deterministic,
// time-stamped, keyboard reachable, and separate from manual developer/trademark checks.
// Run after `npm run build`: node e2e/availability-evidence.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PORT = 4196
const APP_URL = `http://localhost:${PORT}`
const E2E_DIR = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = join(E2E_DIR, '..')
const viteCli = join(WEB_DIR, 'node_modules', 'vite', 'bin', 'vite.js')
const TLDS = ['.com', '.io', '.ai', '.app', '.dev', '.co']
const EXPECTED_CHECKS = 49
const INVALID_NAME = 'Bad Name'
const INVALID_STUB = {
  name: INVALID_NAME,
  style: 'big_tech',
  syllables: 0,
  score_pronounce: 0,
  score_novelty: 0,
  score_memorability: 0,
  connotations: [],
}

const providerForHost = {
  'rdap.verisign.com': 'verisign',
  'rdap.identitydigital.services': 'identity-digital',
  'pubapi.registry.google': 'google-registry',
  'cloudflare-dns.com': 'cloudflare-doh',
}

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

const availabilityCalls = []
const developerApiCalls = []
const unexpectedExternalCalls = []
let cancellationLabel = ''
let cancellationGate = Promise.resolve()
let releaseCancellationGate = () => {}

function holdCancellationRequests(label) {
  cancellationLabel = label.toLowerCase()
  cancellationGate = new Promise((resolve) => {
    releaseCancellationGate = resolve
  })
}

function releaseCancellationRequests() {
  cancellationLabel = ''
  releaseCancellationGate()
  releaseCancellationGate = () => {}
  cancellationGate = Promise.resolve()
}

function requestDomain(url) {
  if (url.hostname === 'cloudflare-dns.com') {
    return (url.searchParams.get('name') ?? '').toLowerCase()
  }
  const marker = '/domain/'
  const offset = url.pathname.toLowerCase().lastIndexOf(marker)
  return offset < 0 ? '' : decodeURIComponent(url.pathname.slice(offset + marker.length)).toLowerCase()
}

function tldForDomain(domain) {
  return TLDS.find((tld) => domain.endsWith(tld)) ?? ''
}

function isDeveloperApi(url) {
  return url.hostname === 'api.github.com'
    || url.hostname === 'registry.npmjs.org'
    || (url.hostname === 'pypi.org' && url.pathname.startsWith('/pypi/'))
    || (url.hostname === 'crates.io' && url.pathname.startsWith('/api/'))
}

async function waitForTerminalRows(panel) {
  const rows = panel.locator('.availability-domain-row')
  await rows.first().waitFor({ timeout: 20000 })
  const deadline = Date.now() + 20000
  while (Date.now() < deadline) {
    const states = await rows.evaluateAll((items) => items.map((item) => item.getAttribute('data-status') ?? ''))
    if (states.length === 6 && states.every((state) => state !== '' && state !== 'idle' && state !== 'checking')) {
      return states
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error('domain evidence rows did not reach terminal states')
}

async function waitUntil(predicate, label, timeout = 5000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error(`timed out waiting for ${label}`)
}

async function storageSnapshot(page, ignoredLocalKeys = []) {
  return await page.evaluate((ignored) => JSON.stringify({
    local: Object.keys(localStorage)
      .filter((key) => !ignored.includes(key))
      .sort()
      .map((key) => [key, localStorage.getItem(key)]),
    session: Object.keys(sessionStorage).sort().map((key) => [key, sessionStorage.getItem(key)]),
  }), ignoredLocalKeys)
}

async function isActive(locator) {
  return await locator.evaluate((element) => document.activeElement === element)
}

async function focusIsVisible(locator, { vertical = true } = {}) {
  return await locator.evaluate((element, requireVertical) => {
    const style = getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    const outlineWidth = Number.parseFloat(style.outlineWidth) || 0
    const outlineOffset = Number.parseFloat(style.outlineOffset) || 0
    const margin = outlineWidth + Math.max(0, outlineOffset)
    return element.matches(':focus-visible')
      && style.outlineStyle !== 'none'
      && outlineWidth >= 2
      && rect.left - margin >= -1
      && rect.right + margin <= innerWidth + 1
      && (!requireVertical || (rect.top - margin >= -1 && rect.bottom + margin <= innerHeight + 1))
  }, vertical)
}

async function panelFitsViewport(card, panel) {
  const elementsFit = await Promise.all([card, panel].map((locator) => locator.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return rect.left >= -1 && rect.right <= innerWidth + 1 && element.scrollWidth <= element.clientWidth + 1
  })))
  const rowsFit = await panel.locator('.availability-domain-row').evaluateAll((rows) => rows.every((row) => (
    row.scrollWidth <= row.clientWidth + 1
      && row.getBoundingClientRect().left >= -1
      && row.getBoundingClientRect().right <= innerWidth + 1
  )))
  return elementsFit.every(Boolean) && rowsFit
}

async function openAvailability(card, activation = 'pointer') {
  const trigger = card.getByRole('button', { name: /^Name checks\b/ })
  if (activation === 'pointer') {
    await trigger.click()
  } else {
    await trigger.focus()
    await trigger.press(activation)
  }
  const panel = card.locator('.availability-panel')
  await panel.waitFor({ state: 'visible' })
  return panel
}

async function goToSaved(page) {
  await page.locator('.sidebar-item', { hasText: 'Saved' }).click()
  await page.waitForSelector('.saved-page')
}

function cardNamed(page, name) {
  return page.locator('.saved-page .name-card').filter({
    has: page.locator('.name-text', { hasText: name }),
  }).first()
}

try {
  const context = await browser.newContext()
  await context.addInitScript(({ invalidStub }) => {
    localStorage.setItem('neologism:visited', '1')
    if (!localStorage.getItem('neologism:imported-saved')) {
      localStorage.setItem('neologism:imported-saved', JSON.stringify([invalidStub]))
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
  }, { invalidStub: INVALID_STUB })

  await context.route('https://**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const provider = providerForHost[url.hostname]

    if (provider) {
      const domain = requestDomain(url)
      const tld = tldForDomain(domain)
      const shouldHold = cancellationLabel !== '' && domain === `${cancellationLabel}${tld}`
      const heldGate = cancellationGate
      availabilityCalls.push({
        provider,
        domain,
        tld,
        method: request.method(),
        headers: request.headers(),
      })
      const headers = {
        'access-control-allow-origin': '*',
        'content-type': 'application/json',
      }

      if (shouldHold) await heldGate

      try {
        if (provider === 'cloudflare-doh') {
          const payload = tld === '.io'
            ? {
                Status: 3,
                Question: [{ name: `${domain}.`, type: 1 }],
              }
            : {
                Status: 0,
                Question: [{ name: `${domain}.`, type: 1 }],
                Answer: [{ name: `${domain}.`, type: 1, TTL: 60, data: '192.0.2.1' }],
              }
          await route.fulfill({ status: 200, headers, body: JSON.stringify(payload) })
          return
        }

        const status = tld === '.com' || tld === '.app' ? 200 : 404
        await route.fulfill({ status, headers })
      } catch (error) {
        if (!shouldHold) throw error
      }
      return
    }

    if (isDeveloperApi(url)) developerApiCalls.push(request.url())
    unexpectedExternalCalls.push(request.url())
    await route.abort()
  })

  const page = await context.newPage({ viewport: { width: 1440, height: 1000 } })
  await page.goto(APP_URL)
  await page.click('.command-go')
  await page.waitForSelector('.name-card', { timeout: 20000 })

  const createCard = page.locator('.results-grid .name-card').first()
  const cancellationCard = page.locator('.results-grid .name-card').nth(1)
  const validName = ((await createCard.locator('.name-text').textContent()) ?? '').trim()
  const cancellationName = ((await cancellationCard.locator('.name-text').textContent()) ?? '').trim()
  const normalizedName = validName.toLowerCase()
  check(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(validName), 'generated fixture name is a supported DNS label')

  const createTrigger = createCard.getByRole('button', { name: `Name checks for ${validName}`, exact: true })
  const cancellationTrigger = cancellationCard.getByRole('button', { name: `Name checks for ${cancellationName}`, exact: true })
  check(
    await createTrigger.getAttribute('type') === 'button'
      && await cancellationTrigger.getAttribute('type') === 'button'
      && await createTrigger.locator('.chip-chevron').getAttribute('aria-hidden') === 'true'
      && await cancellationTrigger.locator('.chip-chevron').getAttribute('aria-hidden') === 'true',
    'each card exposes a card-specific button name with a hidden decorative chevron',
  )
  const createControls = await createTrigger.getAttribute('aria-controls')
  const cancellationControls = await cancellationTrigger.getAttribute('aria-controls')
  check(
    await createTrigger.getAttribute('aria-expanded') === 'false'
      && await cancellationTrigger.getAttribute('aria-expanded') === 'false'
      && Boolean(createControls)
      && Boolean(cancellationControls)
      && createControls !== cancellationControls,
    'collapsed cards expose false expanded state and unique non-empty control ids',
  )

  await createCard.locator('.star-btn').click()
  const storageBeforeDisclosure = await storageSnapshot(page)
  const nonRecentStorageBefore = await storageSnapshot(page, ['neologism:recent'])
  const beforeOpen = availabilityCalls.length + unexpectedExternalCalls.length
  const createPanel = await openAvailability(createCard, 'Enter')
  check(
    availabilityCalls.length + unexpectedExternalCalls.length === beforeOpen,
    'opening Name checks performs zero external calls',
  )
  check(
    await createTrigger.getAttribute('aria-expanded') === 'true'
      && await createPanel.getAttribute('id') === createControls
      && await createPanel.getAttribute('role') === 'region'
      && await createPanel.getAttribute('aria-label') === `Name checks for ${validName}`
      && await createPanel.getAttribute('tabindex') === '-1',
    'Enter expands the exact labelled region controlled by its card trigger',
  )
  check(
    await isActive(createPanel) && await focusIsVisible(createPanel, { vertical: false }),
    'every keyboard open moves visible focus into the controlled panel',
  )

  const manualLinks = createPanel.locator('.availability-manual-link')
  const manualText = (await manualLinks.allTextContents()).join(' ')
  const manualSectionText = (await createPanel.locator('.availability-manual').allTextContents()).join(' ')
  const manualServices = await manualLinks.evaluateAll((links) => links.map((link) => ({
    service: link.getAttribute('data-service'),
    target: link.getAttribute('target'),
    rel: link.getAttribute('rel'),
  })))
  check(
    manualServices.length === 6
      && ['GitHub', 'npm', 'PyPI', 'crates.io', 'USPTO', 'EUIPO'].every((label) => manualText.includes(label))
      && ['github', 'npm', 'pypi', 'crates', 'uspto', 'euipo'].every((service) => (
        manualServices.some((link) => link.service === service)
      ))
      && manualServices.every((link) => link.target === '_blank' && link.rel?.includes('noreferrer'))
      && /not evaluated/i.test(manualSectionText),
    'developer and trademark destinations are manual links marked not evaluated',
  )

  await page.keyboard.press('Tab')
  const createRun = createPanel.locator('.availability-run')
  check(
    await isActive(createRun)
      && await createRun.getAttribute('aria-label') === `Run 6 domain lookups for ${validName}`,
    'Tab from a valid focused panel reaches its exact named run action',
  )
  check(await focusIsVisible(createRun), 'the keyboard-focused run action has a fully visible focus ring')
  await page.keyboard.press('Shift+Tab')
  check(
    await isActive(createCard.locator('.star-btn')),
    'reverse Tab from Run follows natural DOM order to the preceding Save action',
  )

  await page.keyboard.press('Tab')
  const traversedServices = []
  let manualFocusVisible = true
  for (const service of ['github', 'npm', 'pypi', 'crates', 'uspto', 'euipo']) {
    await page.keyboard.press('Tab')
    const activeService = await page.evaluate(() => document.activeElement?.getAttribute('data-service') ?? '')
    traversedServices.push(activeService)
    manualFocusVisible = manualFocusVisible
      && activeService === service
      && await focusIsVisible(createPanel.locator(`.availability-manual-link[data-service="${service}"]`))
  }
  check(
    traversedServices.join(',') === 'github,npm,pypi,crates,uspto,euipo'
      && manualFocusVisible,
    'Tab visits all six manual links in order with visible focus',
  )
  await page.keyboard.press('Tab')
  check(
    await page.evaluate((panelId) => (
      document.activeElement !== document.body
        && document.activeElement !== null
        && !document.getElementById(panelId)?.contains(document.activeElement)
    ), createControls),
    'Tab after EUIPO exits the disclosure naturally without falling to BODY',
  )
  await page.keyboard.press('Shift+Tab')
  check(
    await page.evaluate(() => document.activeElement?.getAttribute('data-service') === 'euipo'),
    'reverse Tab returns naturally to the final manual link',
  )
  await page.keyboard.press('Escape')
  await createPanel.waitFor({ state: 'detached' })
  check(
    await createTrigger.getAttribute('aria-expanded') === 'false' && await isActive(createTrigger),
    'Escape from a panel descendant closes it and restores the exact trigger',
  )
  check(
    availabilityCalls.length + unexpectedExternalCalls.length === beforeOpen
      && await storageSnapshot(page) === storageBeforeDisclosure,
    'keyboard open, traversal, and close perform zero I/O and preserve browser storage',
  )

  await createTrigger.press('Space')
  await createCard.locator('.availability-panel').waitFor({ state: 'visible' })
  check(
    await createTrigger.getAttribute('aria-expanded') === 'true'
      && await isActive(createCard.locator('.availability-panel')),
    'Space opens the disclosure and focuses its panel',
  )
  await page.keyboard.press('Escape')
  await createCard.locator('.availability-panel').waitFor({ state: 'detached' })

  await createTrigger.click()
  await createCard.locator('.availability-panel').waitFor({ state: 'visible' })
  const pointerFocusedPanel = await isActive(createCard.locator('.availability-panel'))
  await createTrigger.click()
  await createCard.locator('.availability-panel').waitFor({ state: 'detached' })
  check(
    pointerFocusedPanel
      && await createTrigger.getAttribute('aria-expanded') === 'false'
      && await isActive(createTrigger),
    'pointer open focuses the panel and pointer close preserves trigger focus',
  )

  const runPanel = await openAvailability(createCard, 'Enter')
  await page.keyboard.press('Tab')
  const runAction = runPanel.locator('.availability-run')

  const beforeFirstRun = availabilityCalls.length
  await page.keyboard.press('Enter')
  await waitUntil(async () => await runAction.getAttribute('aria-busy') === 'true', 'run busy state')
  check(
    await runAction.getAttribute('aria-disabled') === 'true'
      && await runAction.evaluate((button) => !button.disabled)
      && await runPanel.locator('.availability-grid').getAttribute('aria-busy') === 'true'
      && await isActive(runAction),
    'running stays natively focusable while exposing disabled and busy semantics',
  )
  await page.keyboard.press('Enter')
  const firstStates = await waitForTerminalRows(runPanel)
  await waitUntil(async () => await runAction.getAttribute('aria-busy') === 'false', 'terminal busy state')
  const firstRunCalls = availabilityCalls.slice(beforeFirstRun)
  check(firstRunCalls.length === 6, 'repeated Enter during a valid run still performs exactly six domain requests')
  check(
    await runAction.getAttribute('aria-busy') === 'false'
      && await runAction.getAttribute('aria-disabled') === 'false'
      && await runPanel.locator('.availability-grid').getAttribute('aria-busy') === 'false'
      && await isActive(runAction),
    'terminal completion clears busy state and preserves Run focus',
  )

  const providerCounts = firstRunCalls.reduce((counts, call) => {
    counts[call.provider] = (counts[call.provider] ?? 0) + 1
    return counts
  }, {})
  check(
    providerCounts.verisign === 1
      && providerCounts['identity-digital'] === 1
      && providerCounts['google-registry'] === 2
      && providerCounts['cloudflare-doh'] === 2,
    'requests use the frozen one/one/two/two provider distribution',
  )
  check(
    firstRunCalls.map((call) => call.domain).sort().join('|')
      === TLDS.map((tld) => normalizedName + tld).sort().join('|'),
    'every request carries only the displayed spelling plus its TLD',
  )
  check(
    firstRunCalls.every((call) => !call.headers.authorization && !call.headers.cookie && !call.headers.referer),
    'domain requests omit credentials, authorization, and referrer headers',
  )
  check(firstStates.length === 6, 'all six domain rows reach terminal states')

  const firstStatusByTld = Object.fromEntries(await runPanel.locator('.availability-domain-row').evaluateAll((rows) => (
    rows.map((row) => [
      row.querySelector('.availability-domain')?.textContent?.trim() ?? '',
      row.getAttribute('data-status') ?? '',
    ])
  )))
  check(
    firstStatusByTld['.com'] === 'record_found'
      && firstStatusByTld['.ai'] === 'no_record'
      && firstStatusByTld['.app'] === 'record_found'
      && firstStatusByTld['.dev'] === 'no_record'
      && firstStatusByTld['.io'] === 'nxdomain'
      && firstStatusByTld['.co'] === 'dns_record',
    'RDAP and DNS fixtures render their exact evidence semantics',
  )
  const freshMeta = await runPanel.locator('.availability-meta').allTextContents()
  check(
    freshMeta.length === 6 && freshMeta.every((text) => /network/i.test(text) && !/cached/i.test(text)),
    'first-run rows are visibly fresh network observations',
  )

  await page.keyboard.press('Escape')
  await runPanel.waitFor({ state: 'detached' })
  const beforeCompletedReopen = availabilityCalls.length
  const completedPanel = await openAvailability(createCard, 'Enter')
  const completedStates = await completedPanel.locator('.availability-domain-row').evaluateAll((rows) => (
    rows.map((row) => row.getAttribute('data-status') ?? '')
  ))
  check(
    availabilityCalls.length === beforeCompletedReopen
      && completedStates.length === 6
      && completedStates.every((state) => state !== 'idle' && state !== 'checking'),
    'reopening completed evidence sends nothing and preserves all terminal rows',
  )
  await page.keyboard.press('Escape')
  await completedPanel.waitFor({ state: 'detached' })

  holdCancellationRequests(cancellationName)
  const cancellationPanel = await openAvailability(cancellationCard, 'Enter')
  await page.keyboard.press('Tab')
  const cancellationRun = cancellationPanel.locator('.availability-run')
  const beforeCancellationRun = availabilityCalls.length
  await page.keyboard.press('Enter')
  await waitUntil(
    () => availabilityCalls.length >= beforeCancellationRun + 4,
    'four held cancellation requests',
    10000,
  )
  check(
    availabilityCalls.length === beforeCancellationRun + 4
      && await cancellationRun.getAttribute('aria-busy') === 'true'
      && await isActive(cancellationRun),
    'a delayed run holds four provider requests while Run retains focus',
  )
  await page.keyboard.press('Escape')
  await cancellationPanel.waitFor({ state: 'detached' })
  check(
    await cancellationTrigger.getAttribute('aria-expanded') === 'false'
      && await isActive(cancellationTrigger),
    'Escape during a run closes the panel and restores its exact trigger',
  )
  const cancellationCallsAfterClose = availabilityCalls.length
  const reopenedCancellationPanel = await openAvailability(cancellationCard, 'Enter')
  const idleAfterCancellation = await reopenedCancellationPanel.locator('.availability-domain-row').evaluateAll((rows) => (
    rows.every((row) => row.getAttribute('data-status') === 'idle')
  ))
  releaseCancellationRequests()
  await new Promise((resolve) => setTimeout(resolve, 1250))
  const idleAfterLateResponses = await reopenedCancellationPanel.locator('.availability-domain-row').evaluateAll((rows) => (
    rows.every((row) => row.getAttribute('data-status') === 'idle')
  ))
  check(
    idleAfterCancellation
      && idleAfterLateResponses
      && availabilityCalls.length === cancellationCallsAfterClose
      && await reopenedCancellationPanel.locator('.availability-grid').getAttribute('aria-busy') === 'false',
    'cancelled work reopens idle and ignores late responses without starting queued requests',
  )
  await page.keyboard.press('Escape')
  await reopenedCancellationPanel.waitFor({ state: 'detached' })

  await goToSaved(page)
  const savedValidCard = cardNamed(page, validName)
  const invalidCard = cardNamed(page, INVALID_NAME)
  const savedValidTrigger = savedValidCard.getByRole('button', { name: `Name checks for ${validName}`, exact: true })
  const invalidTrigger = invalidCard.getByRole('button', { name: `Name checks for ${INVALID_NAME}`, exact: true })
  check(
    await savedValidTrigger.getAttribute('aria-controls') !== await invalidTrigger.getAttribute('aria-controls')
      && await savedValidTrigger.getAttribute('aria-expanded') === 'false'
      && await invalidTrigger.getAttribute('aria-expanded') === 'false',
    'Saved cards retain independent disclosure ids and collapsed state',
  )
  const savedValidPanel = await openAvailability(savedValidCard)
  const beforeCachedRun = availabilityCalls.length
  await savedValidPanel.locator('.availability-run').click()
  await waitForTerminalRows(savedValidPanel)
  check(availabilityCalls.length === beforeCachedRun, 'same-session repeat performs zero network requests')
  const cachedMeta = await savedValidPanel.locator('.availability-meta').allTextContents()
  check(
    cachedMeta.length === 6 && cachedMeta.every((text) => /cached/i.test(text)),
    'same-session repeat marks all six observations cached',
  )

  const beforeInvalidRun = availabilityCalls.length
  const invalidPanel = await openAvailability(invalidCard, 'Space')
  await invalidPanel.locator('.availability-unsupported').waitFor({ state: 'visible' })
  check(
    await invalidPanel.locator('.availability-run').isDisabled()
      && await isActive(invalidPanel)
      && availabilityCalls.length === beforeInvalidRun,
    'unsupported spelling disables the run action and performs zero domain requests',
  )
  check(
    /unsupported/i.test((await invalidPanel.locator('.availability-unsupported').textContent()) ?? '')
      && await invalidPanel.locator('.availability-unsupported').getAttribute('role') === 'status',
    'unsupported spelling receives an explicit terminal explanation',
  )
  await page.keyboard.press('Tab')
  check(
    await page.evaluate(() => document.activeElement?.getAttribute('data-service') === 'github')
      && await focusIsVisible(invalidPanel.locator('[data-service="github"]')),
    'Tab from an unsupported panel skips native-disabled Run and reaches GitHub',
  )
  await page.keyboard.press('Escape')
  await invalidPanel.waitFor({ state: 'detached' })
  check(
    await invalidTrigger.getAttribute('aria-expanded') === 'false' && await isActive(invalidTrigger),
    'Escape from an unsupported panel restores its exact trigger',
  )

  const beforeReloadRun = availabilityCalls.length
  await page.reload()
  await goToSaved(page)
  const reloadedValidCard = cardNamed(page, validName)
  const reloadedValidPanel = await openAvailability(reloadedValidCard)
  await reloadedValidPanel.locator('.availability-run').click()
  const reloadedStates = await waitForTerminalRows(reloadedValidPanel)
  check(availabilityCalls.length - beforeReloadRun === 6, 'reload clears session cache and explicit run performs six requests')
  check(reloadedStates.length === 6, 'reloaded run returns six terminal domain rows')
  const reloadedMeta = await reloadedValidPanel.locator('.availability-meta').allTextContents()
  check(
    reloadedMeta.length === 6 && reloadedMeta.every((text) => /network/i.test(text) && !/cached/i.test(text)),
    'reloaded observations are visibly fresh rather than cached',
  )

  await page.keyboard.press('Escape')
  await reloadedValidPanel.waitFor({ state: 'detached' })
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 320, height: 700 },
  ]) {
    await page.setViewportSize(viewport)
    const responsiveTrigger = reloadedValidCard.getByRole('button', { name: `Name checks for ${validName}`, exact: true })
    const responsivePanel = await openAvailability(reloadedValidCard, 'Enter')
    const responsiveTriggerTarget = await responsiveTrigger.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return rect.width >= 39.5 && rect.height >= 39.5
    })
    const panelHorizontalFit = await panelFitsViewport(reloadedValidCard, responsivePanel)
      && await focusIsVisible(responsivePanel, { vertical: false })
    await page.keyboard.press('Tab')
    let interactiveFocusFits = await focusIsVisible(responsivePanel.locator('.availability-run'))
    for (const service of ['github', 'npm', 'pypi', 'crates', 'uspto', 'euipo']) {
      await page.keyboard.press('Tab')
      interactiveFocusFits = interactiveFocusFits
        && await page.evaluate((expected) => document.activeElement?.getAttribute('data-service') === expected, service)
        && await focusIsVisible(responsivePanel.locator(`[data-service="${service}"]`))
    }
    check(
      panelHorizontalFit,
      `${viewport.width}px keeps the card, evidence panel, rows, and panel focus ring horizontally contained`,
    )
    check(
      interactiveFocusFits,
      `${viewport.width}px keyboard traversal keeps every interactive focus ring fully visible`,
    )
    await page.keyboard.press('Escape')
    await responsivePanel.waitFor({ state: 'detached' })
    check(
      await isActive(responsiveTrigger)
        && await responsiveTrigger.getAttribute('aria-expanded') === 'false'
        && await focusIsVisible(responsiveTrigger)
        && responsiveTriggerTarget,
      `${viewport.width}px Escape restores a fully visible, mobile-safe exact trigger`,
    )
  }

  check(
    await storageSnapshot(page, ['neologism:recent']) === nonRecentStorageBefore,
    'domain evidence lifecycle leaves all storage outside operational recent-name history unchanged',
  )

  check(developerApiCalls.length === 0, 'manual developer links trigger zero API requests')
  check(unexpectedExternalCalls.length === 0, 'fixture observes no unexpected external requests')

  await context.close()
} catch (error) {
  console.error('SCRIPT ERROR:', error instanceof Error ? error.message : error)
  failures++
} finally {
  releaseCancellationRequests()
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
  console.error(`availability evidence browser: ${failures} failure(s), ${checks}/${EXPECTED_CHECKS} checks executed`)
  process.exitCode = 1
} else {
  console.log(`availability evidence browser: ${checks}/${EXPECTED_CHECKS} checks passed`)
}
