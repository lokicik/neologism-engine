// Phase 169 browser contract: Landing's live mode demo exposes its visual
// single-selection state without pretending to be tabs or an ARIA menu.
// Run after `npm run build`: node e2e/landing-demo-mode-state.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PORT = 4205
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
const page = await context.newPage()
let checks = 0
let failures = 0
const pageErrors = []
const externalRequests = []

page.on('pageerror', (error) => pageErrors.push(error.message))
page.on('request', (request) => {
  const url = new URL(request.url())
  if (url.protocol === 'https:') externalRequests.push(request.url())
})

const check = (ok, label) => {
  checks++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) failures++
}

async function storageSnapshot() {
  return page.evaluate(() => JSON.stringify({
    local: Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)]),
    session: Object.keys(sessionStorage).sort().map((key) => [key, sessionStorage.getItem(key)]),
  }))
}

async function landingFocusRings() {
  const buttons = page.locator('.landing button')
  const count = await buttons.count()
  const rings = []
  await buttons.first().focus()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
  for (let index = 0; index < count; index++) {
    rings.push(await page.evaluate(() => {
      const element = document.activeElement
      if (!(element instanceof HTMLElement)) return { ok: false }
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      const outline = Number.parseFloat(style.outlineWidth) || 0
      const offset = Number.parseFloat(style.outlineOffset) || 0
      const margin = outline + offset
      return {
        ok: element.matches(':focus-visible')
          && outline >= 2
          && style.outlineStyle !== 'none'
          && rect.left - margin >= 0
          && rect.top - margin >= 0
          && rect.right + margin <= innerWidth
          && rect.bottom + margin <= innerHeight,
        label: element.innerText.replace(/\s+/g, ' ').trim(),
        outline,
        outlineStyle: style.outlineStyle,
        offset,
      }
    }))
    if (index < count - 1) await page.keyboard.press('Tab')
  }
  return rings
}

try {
  await page.goto(APP_URL)
  const storageBefore = await storageSnapshot()
  const desktopRings = await landingFocusRings()
  if (!desktopRings.every((ring) => ring.ok)) console.log('INFO  390px Landing focus rings', desktopRings)
  check(
    desktopRings.length === 9 && desktopRings.every((ring) => ring.ok),
    '390px gives all nine Landing actions a contained 2px focus ring',
  )
  const group = page.locator('.tile-pills')
  await group.scrollIntoViewIfNeeded()
  const buttons = group.locator('button')
  check(await group.getAttribute('role') === 'group', 'live mode choices expose a native-button selection group')
  check(await group.getAttribute('aria-label') === 'Live naming mode example', 'live mode group has one concise accessible name')
  check(await buttons.allTextContents().then((items) => items.map((item) => item.trim()).join('|')) === 'Brandable|Real words|Respelled|Compound', 'group retains the four visible modes in production order')
  check(await buttons.evaluateAll((items) => items.filter((item) => item.getAttribute('aria-pressed') === 'true').length) === 1, 'exactly one live mode exposes aria-pressed=true initially')
  check(await buttons.filter({ hasText: 'Brandable' }).getAttribute('aria-pressed') === 'true', 'Brandable is the announced default mode')

  const respelled = buttons.filter({ hasText: 'Respelled' })
  await respelled.focus()
  await page.keyboard.press('Enter')
  check(await respelled.getAttribute('aria-pressed') === 'true', 'Enter updates the announced selection to Respelled')
  check(await buttons.evaluateAll((items) => items.filter((item) => item.getAttribute('aria-pressed') === 'true').length) === 1, 'keyboard selection keeps exactly one announced mode')
  check(await respelled.evaluate((element) => document.activeElement === element && element.matches(':focus-visible')), 'keyboard selection preserves its native button and visible focus')

  const compound = buttons.filter({ hasText: 'Compound' })
  await compound.click()
  check(await compound.getAttribute('aria-pressed') === 'true' && await respelled.getAttribute('aria-pressed') === 'false', 'pointer selection moves the same single pressed state to Compound')

  const heroName = page.locator('.decode-name')
  const heroToggle = page.locator('.hero-cycle-toggle')
  const wallTrack = page.locator('.wall-track').first()
  await page.waitForFunction(() => document.querySelector('.decode-name')?.textContent?.trim())
  await heroToggle.scrollIntoViewIfNeeded()
  check(
    await heroToggle.getAttribute('aria-pressed') === null
      && await heroToggle.getAttribute('aria-label') === 'Pause moving name examples',
    'ordinary motion starts with one explicit Pause action without conflicting toggle semantics',
  )
  await heroToggle.click()
  // Pause owns the next hero target; let any already-started 700ms letter
  // decode finish before comparing the stable visible spelling.
  await page.waitForTimeout(800)
  const pausedName = (await heroName.textContent())?.trim()
  await page.waitForTimeout(4000)
  check(
    (await heroName.textContent())?.trim() === pausedName
      && await heroToggle.getAttribute('aria-label') === 'Resume moving name examples'
      && await heroToggle.evaluate((element) => document.activeElement === element)
      && await wallTrack.evaluate((element) => getComputedStyle(element).animationPlayState === 'paused'),
    'Pause keeps the current hero and wall motion stable while preserving the invoking control',
  )
  await heroToggle.click()
  await page.waitForFunction(
    (previous) => document.querySelector('.decode-name')?.textContent?.trim() !== previous,
    pausedName,
    { timeout: 5000 },
  )
  check(
    await heroToggle.getAttribute('aria-label') === 'Pause moving name examples'
      && await heroToggle.evaluate((element) => document.activeElement === element)
      && await wallTrack.evaluate((element) => getComputedStyle(element).animationPlayState === 'running'),
    'Resume restarts ordinary name motion after a full pause and keeps focus on the toggle',
  )
  await page.emulateMedia({ reducedMotion: 'reduce' })
  // A target already chosen before the preference change may finish its
  // 700ms decode; measure stability after that target becomes readable.
  await page.waitForTimeout(800)
  const dynamicallyReducedName = (await heroName.textContent())?.trim()
  await page.waitForTimeout(4000)
  check(
    await heroToggle.getAttribute('aria-label') === 'Resume moving name examples'
      && (await heroName.textContent())?.trim() === dynamicallyReducedName
      && await wallTrack.evaluate((element) => getComputedStyle(element).animationName === 'none'),
    'enabling reduced motion in an open Landing pauses both name-motion layers',
  )
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const preferenceReturnName = (await heroName.textContent())?.trim()
  await page.waitForTimeout(4000)
  check(
    await heroToggle.getAttribute('aria-label') === 'Resume moving name examples'
      && (await heroName.textContent())?.trim() === preferenceReturnName
      && await wallTrack.evaluate((element) => getComputedStyle(element).animationPlayState === 'paused'),
    'returning to ordinary motion does not override the paused user-visible state',
  )
  await page.setViewportSize({ width: 320, height: 700 })
  await page.evaluate(() => scrollTo(0, 0))
  check(
    await heroToggle.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      const ring = 4 // Landing's 2px focus ring plus its 2px outline offset.
      return rect.top - ring >= 0
        && rect.bottom + ring <= innerHeight
        && rect.left - ring >= 0
        && rect.right + ring <= innerWidth
    }),
    '320px initially exposes the full motion-control focus ring without scrolling',
  )
  const narrowRings = await landingFocusRings()
  if (!narrowRings.every((ring) => ring.ok)) console.log('INFO  320px Landing focus rings', narrowRings)
  check(
    narrowRings.length === 9 && narrowRings.every((ring) => ring.ok),
    '320px keeps all nine Landing focus rings fully visible',
  )
  check(await storageSnapshot() === storageBefore && externalRequests.length === 0, 'demo selection leaves storage unchanged and sends zero external HTTPS requests')
  check(pageErrors.length === 0, 'keyboard and pointer selection produce zero page errors')

  const reducedContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  })
  const reducedPage = await reducedContext.newPage()
  const reducedErrors = []
  const reducedExternalRequests = []
  reducedPage.on('pageerror', (error) => reducedErrors.push(error.message))
  reducedPage.on('request', (request) => {
    const url = new URL(request.url())
    if (url.protocol === 'https:') reducedExternalRequests.push(request.url())
  })
  try {
    await reducedPage.goto(APP_URL)
    const hero = reducedPage.locator('.decode-name')
    const toggle = reducedPage.locator('.hero-cycle-toggle')
    await reducedPage.waitForFunction(() => document.querySelector('.decode-name')?.textContent?.trim())
    const firstReducedName = (await hero.textContent())?.trim()
    check(
      await toggle.getAttribute('aria-pressed') === null
        && await toggle.getAttribute('aria-label') === 'Resume moving name examples',
      'reduced-motion starts paused with one explicit Resume action and no conflicting pressed state',
    )
    await reducedPage.waitForTimeout(4400)
    check(
      (await hero.textContent())?.trim() === firstReducedName,
      'reduced-motion keeps the first generated hero name stable beyond one rotation interval',
    )
    await toggle.click()
    await reducedPage.waitForFunction(
      (previous) => document.querySelector('.decode-name')?.textContent?.trim() !== previous,
      firstReducedName,
      { timeout: 5000 },
    )
    check(
      await toggle.getAttribute('aria-label') === 'Pause moving name examples'
        && await toggle.evaluate((element) => document.activeElement === element)
        && await reducedPage.locator('.wall-track').first().evaluate((element) => getComputedStyle(element).animationName === 'none'),
      'reduced-motion can resume hero rotation without restarting wall motion or losing focus',
    )
    check(
      reducedErrors.length === 0 && reducedExternalRequests.length === 0,
      'reduced-motion Landing produces zero page errors or external HTTPS requests',
    )
  } finally {
    await reducedContext.close()
  }
  check(checks === EXPECTED_CHECKS - 1, `fixture executes exactly ${EXPECTED_CHECKS} checks`)
} finally {
  await context.close()
  await browser.close()
  server.kill()
}

if (checks !== EXPECTED_CHECKS || failures > 0) process.exitCode = 1
