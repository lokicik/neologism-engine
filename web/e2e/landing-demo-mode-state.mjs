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
const EXPECTED_CHECKS = 14

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
    desktopRings.length === 8 && desktopRings.every((ring) => ring.ok),
    '390px gives all eight Landing actions a contained 2px focus ring',
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
  await page.setViewportSize({ width: 320, height: 700 })
  const narrowRings = await landingFocusRings()
  if (!narrowRings.every((ring) => ring.ok)) console.log('INFO  320px Landing focus rings', narrowRings)
  check(
    narrowRings.length === 8 && narrowRings.every((ring) => ring.ok),
    '320px keeps all eight Landing focus rings fully visible',
  )
  check(await storageSnapshot() === storageBefore && externalRequests.length === 0, 'demo selection leaves storage unchanged and sends zero external HTTPS requests')
  check(pageErrors.length === 0, 'keyboard and pointer selection produce zero page errors')
  check(checks === EXPECTED_CHECKS - 1, `fixture executes exactly ${EXPECTED_CHECKS} checks`)
} finally {
  await context.close()
  await browser.close()
  server.kill()
}

if (checks !== EXPECTED_CHECKS || failures > 0) process.exitCode = 1
