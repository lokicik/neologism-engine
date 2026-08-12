// Phase 178 browser contract: SPA page changes participate in browser history
// without sacrificing a retained shared-import recovery hash.
// Run after `npm run build`: node e2e/view-history.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PORT = 4211
const APP_URL = `http://localhost:${PORT}`
const E2E_DIR = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = join(E2E_DIR, '..')
const viteCli = join(WEB_DIR, 'node_modules', 'vite', 'bin', 'vite.js')
const EXPECTED_CHECKS = 24

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
const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
await context.addInitScript(() => localStorage.setItem('neologism:visited', '1'))
const page = await context.newPage()
let checks = 0
let failures = 0
const pageErrors = []
const externalRequests = []

page.on('pageerror', (error) => pageErrors.push(error.message))
page.on('request', (request) => {
  if (request.url().startsWith('https://')) externalRequests.push(request.url())
})

const check = (ok, label) => {
  checks++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) failures++
}

async function stateView() {
  return page.evaluate(() => history.state?.neologismView ?? null)
}

async function currentView(name) {
  const current = page.locator('.sidebar [aria-current="page"]')
  return await current.count() === 1
    && (await current.textContent())?.replace(/\s+/g, ' ').trim().toLowerCase().includes(name)
}

async function waitForView(view, title) {
  await page.waitForFunction(({ nextView, nextTitle }) => (
    history.state?.neologismView === nextView && document.title === nextTitle
  ), { nextView: view, nextTitle: title }).catch(() => {})
}

async function storageSnapshot() {
  return page.evaluate(() => JSON.stringify({
    local: Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)]),
    session: Object.keys(sessionStorage).sort().map((key) => [key, sessionStorage.getItem(key)]),
  }))
}

async function destinationFocus(selector) {
  await page.waitForFunction((target) => document.activeElement?.matches(target), selector).catch(() => {})
  const state = await page.locator(selector).evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    const outline = Number.parseFloat(style.outlineWidth) || 0
    const state = {
      active: document.activeElement === element,
      outlined: outline >= 2 && style.outlineStyle !== 'none',
      destinationVisible: rect.left >= 0
        && rect.top >= 0
        && rect.right <= innerWidth
        && rect.top < innerHeight,
    }
    return { ...state, ok: state.active && state.outlined && state.destinationVisible }
  })
  if (!state.ok) console.log(`INFO  history focus ${selector}`, state)
  return state.ok
}

const historyLabels = [
  'Back from Saved restores AI Studio state, content, and title',
  'second Back restores Create state, content, and title',
  'Forward restores AI Studio state, content, and title',
  'opening Settings adds no page-history entry or page state',
  'closing Settings leaves the underlying page history unchanged',
  'About pushes a Landing history entry with its truthful title',
  'Back from Landing restores AI Studio',
  'reload retains the current AI Studio history page',
  'navigation preserves a retained shared-import recovery hash',
  'Back preserves the recovery hash while restoring AI Studio',
]

try {
  await page.goto(APP_URL)
  await page.waitForTimeout(0)
  const storageBefore = await storageSnapshot()
  const initialLength = await page.evaluate(() => history.length)
  check(await stateView() === 'create', 'initial Create page is normalized into the current history entry')

  await page.getByRole('button', { name: 'AI Studio', exact: true }).click()
  check(await stateView() === 'studio' && await currentView('ai studio'), 'AI Studio navigation pushes matching history state')
  await page.getByRole('button', { name: /^Saved/ }).click()
  check(await stateView() === 'saved' && await currentView('saved'), 'Saved navigation pushes matching history state')
  const expandedHistory = await page.evaluate((start) => history.length >= start + 2, initialLength)
  check(expandedHistory, 'two page changes add two browser-history entries')

  if (expandedHistory) {
    await page.goBack()
    await waitForView('studio', 'AI Studio — Neologism Engine')
    check(await stateView() === 'studio' && await currentView('ai studio') && await page.title() === 'AI Studio — Neologism Engine', historyLabels[0])
    check(await destinationFocus('#main-content'), 'Back from Saved visibly focuses the restored Studio main landmark')

    await page.goBack()
    await waitForView('create', 'Create — Neologism Engine')
    check(await stateView() === 'create' && await currentView('create') && await page.title() === 'Create — Neologism Engine', historyLabels[1])
    check(await destinationFocus('#main-content'), 'second Back visibly focuses the restored Create main landmark')

    await page.goForward()
    await waitForView('studio', 'AI Studio — Neologism Engine')
    check(await stateView() === 'studio' && await currentView('ai studio') && await page.title() === 'AI Studio — Neologism Engine', historyLabels[2])
    check(await destinationFocus('#main-content'), 'Forward visibly focuses the restored Studio main landmark')

    const beforeSettingsLength = await page.evaluate(() => history.length)
    await page.locator('.sidebar-settings').click()
    await page.getByRole('dialog', { name: 'Settings' }).waitFor({ state: 'visible' })
    check(await stateView() === 'studio' && await page.evaluate((length) => history.length === length, beforeSettingsLength), historyLabels[3])
    await page.getByRole('button', { name: 'Close settings' }).click()
    check(await stateView() === 'studio' && await currentView('ai studio'), historyLabels[4])

    await page.getByRole('button', { name: 'About', exact: true }).click()
    await waitForView('landing', 'Neologism Engine — Startup & Project Name Generator')
    check(await stateView() === 'landing' && await page.getByRole('heading', { level: 1, name: 'Name your next big thing.' }).count() === 1, historyLabels[5])

    await page.goBack()
    await waitForView('studio', 'AI Studio — Neologism Engine')
    check(await stateView() === 'studio' && await currentView('ai studio'), historyLabels[6])
    check(await destinationFocus('#main-content'), 'Back from Landing visibly focuses the restored Studio main landmark')

    await page.goForward()
    await waitForView('landing', 'Neologism Engine — Startup & Project Name Generator')
    check(
      await stateView() === 'landing' && await destinationFocus('.landing-title'),
      'Forward to Landing visibly focuses its restored page heading',
    )
    await page.goBack()
    await waitForView('studio', 'AI Studio — Neologism Engine')
    check(
      await stateView() === 'studio' && await destinationFocus('#main-content'),
      'Back from the restored Landing page refocuses Studio main',
    )

    await page.reload()
    await waitForView('studio', 'AI Studio — Neologism Engine')
    check(await stateView() === 'studio' && await currentView('ai studio'), historyLabels[7])

    await page.evaluate(() => history.replaceState(history.state, '', `${location.pathname}#names=recovery-copy`))
    await page.getByRole('button', { name: /^Saved/ }).click()
    check(await stateView() === 'saved' && new URL(page.url()).hash === '#names=recovery-copy', historyLabels[8])
    await page.goBack()
    await waitForView('studio', 'AI Studio — Neologism Engine')
    check(await stateView() === 'studio' && new URL(page.url()).hash === '#names=recovery-copy' && await currentView('ai studio'), historyLabels[9])
    check(await destinationFocus('#main-content'), 'Back with a recovery hash still visibly focuses the restored main landmark')
  } else {
    for (const label of historyLabels) check(false, label)
  }

  check(await storageSnapshot() === storageBefore, 'view history leaves browser storage byte-for-byte unchanged')
  check(externalRequests.length === 0 && pageErrors.length === 0, 'view history sends zero external HTTPS requests and produces zero page errors')
  check(checks === EXPECTED_CHECKS - 1, `fixture executes exactly ${EXPECTED_CHECKS} checks`)
} finally {
  await context.close()
  await browser.close()
  server.kill()
}

if (checks !== EXPECTED_CHECKS || failures > 0) process.exitCode = 1
