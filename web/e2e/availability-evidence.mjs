// Phase 146 browser contract: domain evidence is explicit, deterministic,
// time-stamped, and separate from manual developer/trademark checks.
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
const EXPECTED_CHECKS = 19
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

async function openAvailability(card) {
  await card.getByRole('button', { name: /^Name checks\b/ }).click()
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
  const validName = ((await createCard.locator('.name-text').textContent()) ?? '').trim()
  const normalizedName = validName.toLowerCase()
  check(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(validName), 'generated fixture name is a supported DNS label')

  await createCard.locator('.star-btn').click()
  const beforeOpen = availabilityCalls.length + unexpectedExternalCalls.length
  const createPanel = await openAvailability(createCard)
  check(
    availabilityCalls.length + unexpectedExternalCalls.length === beforeOpen,
    'opening Name checks performs zero external calls',
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

  const beforeFirstRun = availabilityCalls.length
  await createPanel.locator('.availability-run').click()
  const firstStates = await waitForTerminalRows(createPanel)
  const firstRunCalls = availabilityCalls.slice(beforeFirstRun)
  check(firstRunCalls.length === 6, 'valid explicit run performs exactly six domain requests')

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

  const firstStatusByTld = Object.fromEntries(await createPanel.locator('.availability-domain-row').evaluateAll((rows) => (
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
  const freshMeta = await createPanel.locator('.availability-meta').allTextContents()
  check(
    freshMeta.length === 6 && freshMeta.every((text) => /network/i.test(text) && !/cached/i.test(text)),
    'first-run rows are visibly fresh network observations',
  )

  await goToSaved(page)
  const savedValidCard = cardNamed(page, validName)
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

  const invalidCard = cardNamed(page, INVALID_NAME)
  const invalidPanel = await openAvailability(invalidCard)
  const beforeInvalidRun = availabilityCalls.length
  await invalidPanel.locator('.availability-unsupported').waitFor({ state: 'visible' })
  check(
    await invalidPanel.locator('.availability-run').isDisabled()
      && availabilityCalls.length === beforeInvalidRun,
    'unsupported spelling disables the run action and performs zero domain requests',
  )
  check(
    /unsupported/i.test((await invalidPanel.locator('.availability-unsupported').textContent()) ?? ''),
    'unsupported spelling receives an explicit terminal explanation',
  )

  const beforeReloadRun = availabilityCalls.length
  await page.reload()
  await goToSaved(page)
  const reloadedValidPanel = await openAvailability(cardNamed(page, validName))
  await reloadedValidPanel.locator('.availability-run').click()
  const reloadedStates = await waitForTerminalRows(reloadedValidPanel)
  check(availabilityCalls.length - beforeReloadRun === 6, 'reload clears session cache and explicit run performs six requests')
  check(reloadedStates.length === 6, 'reloaded run returns six terminal domain rows')
  const reloadedMeta = await reloadedValidPanel.locator('.availability-meta').allTextContents()
  check(
    reloadedMeta.length === 6 && reloadedMeta.every((text) => /network/i.test(text) && !/cached/i.test(text)),
    'reloaded observations are visibly fresh rather than cached',
  )

  check(developerApiCalls.length === 0, 'manual developer links trigger zero API requests')
  check(unexpectedExternalCalls.length === 0, 'fixture observes no unexpected external requests')

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
  console.error(`availability evidence browser: ${failures} failure(s), ${checks}/${EXPECTED_CHECKS} checks executed`)
  process.exitCode = 1
} else {
  console.log(`availability evidence browser: ${checks}/${EXPECTED_CHECKS} checks passed`)
}
