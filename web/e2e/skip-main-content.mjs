// Phase 173 browser contract: keyboard users can bypass the repeated shell
// controls without changing the URL, storage, or current view.
// Run after `npm run build`: node e2e/skip-main-content.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PORT = 4209
const APP_URL = `http://localhost:${PORT}`
const E2E_DIR = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = join(E2E_DIR, '..')
const viteCli = join(WEB_DIR, 'node_modules', 'vite', 'bin', 'vite.js')
const EXPECTED_CHECKS = 17

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

async function focusDocumentStart() {
  await page.evaluate(() => {
    document.body.tabIndex = -1
    document.body.focus()
  })
  await page.keyboard.press('Tab')
}

async function skipIsActive() {
  return page.locator('.skip-main-content').evaluate((element) => document.activeElement === element).catch(() => false)
}

async function mainIsFocused() {
  return page.locator('#main-content').evaluate((element) => (
    document.activeElement === element && element.matches(':focus-visible')
  )).catch(() => false)
}

try {
  await page.goto(APP_URL)
  const storageBefore = await page.evaluate(() => JSON.stringify({
    local: Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)]),
    session: Object.keys(sessionStorage).sort().map((key) => [key, sessionStorage.getItem(key)]),
  }))
  await page.evaluate(() => history.replaceState(null, '', `${location.pathname}#names=recovery-copy`))
  const urlBefore = page.url()

  await focusDocumentStart()
  const skip = page.locator('.skip-main-content')
  const skipPresent = await skip.count() === 1
  check(skipPresent && await skipIsActive(), 'first Tab reaches the skip-to-main control before repeated shell navigation')

  if (skipPresent) {
    const skipContract = await skip.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return element.textContent?.trim() === 'Skip to main content'
        && element.tagName === 'BUTTON'
        && element.matches(':focus-visible')
        && rect.width >= 40
        && rect.height >= 40
        && rect.left >= 0
        && rect.right <= innerWidth
        && style.position === 'fixed'
    })
    check(skipContract, 'focused skip control is named, native, visible, and contained at 390 pixels')
    await page.keyboard.press('Enter')
    check(await mainIsFocused(), 'keyboard activation visibly focuses the main landmark')
    check(page.url() === urlBefore && await page.locator('[aria-current="page"]').textContent() === ' Create', 'skip activation preserves a recovery hash and the current Create page')
    await page.keyboard.press('Tab')
    check(await page.locator('.command-area .command-input').evaluate((element) => document.activeElement === element), 'next Tab reaches the Create brief field instead of the sidebar')

    await page.getByRole('button', { name: 'AI Studio', exact: true }).click()
    await focusDocumentStart()
    check(await skipIsActive(), 'AI Studio also exposes skip as the first keyboard control')
    await page.keyboard.press('Enter')
    check(await mainIsFocused(), 'AI Studio skip focuses the same main landmark')
    await page.keyboard.press('Tab')
    check(await page.getByRole('button', { name: 'Open Settings' }).evaluate((element) => document.activeElement === element), 'next Tab reaches the first available AI Studio action')

    await page.getByRole('button', { name: /^Saved/ }).click()
    await focusDocumentStart()
    check(await skipIsActive(), 'Saved also exposes skip as the first keyboard control')
    await page.keyboard.press('Enter')
    check(await mainIsFocused(), 'Saved skip focuses the same main landmark')
    await page.keyboard.press('Tab')
    check(await page.getByRole('button', { name: 'Go create' }).evaluate((element) => document.activeElement === element), 'next Tab reaches the empty-Saved recovery action')

    for (const viewport of [
      { width: 320, height: 700 },
      { width: 1280, height: 900 },
    ]) {
      await page.setViewportSize(viewport)
      await focusDocumentStart()
      await page.waitForFunction(() => document.querySelector('.skip-main-content')?.getBoundingClientRect().top >= 0)
      const evidence = await skip.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        return {
          active: document.activeElement === element,
          focusVisible: element.matches(':focus-visible'),
          activeClass: document.activeElement?.className ?? '',
          rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
          viewport: { width: innerWidth, height: innerHeight },
        }
      })
      const contained = evidence.active
        && evidence.focusVisible
        && evidence.rect.left >= 0
        && evidence.rect.top >= 0
        && evidence.rect.right <= evidence.viewport.width
        && evidence.rect.bottom <= evidence.viewport.height
      check(contained, `${viewport.width}px keeps the focused skip control fully visible and contained (${JSON.stringify(evidence)})`)
    }
  } else {
    for (const label of [
      'focused skip control is named, native, visible, and contained at 390 pixels',
      'keyboard activation visibly focuses the main landmark',
      'skip activation preserves a recovery hash and the current Create page',
      'next Tab reaches the Create brief field instead of the sidebar',
      'AI Studio also exposes skip as the first keyboard control',
      'AI Studio skip focuses the same main landmark',
      'next Tab reaches the first available AI Studio action',
      'Saved also exposes skip as the first keyboard control',
      'Saved skip focuses the same main landmark',
      'next Tab reaches the empty-Saved recovery action',
      '320px keeps the focused skip control fully visible and contained',
      '1280px keeps the focused skip control fully visible and contained',
    ]) check(false, label)
  }

  const storageAfter = await page.evaluate(() => JSON.stringify({
    local: Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)]),
    session: Object.keys(sessionStorage).sort().map((key) => [key, sessionStorage.getItem(key)]),
  }))
  check(storageAfter === storageBefore, 'skip navigation leaves browser storage byte-for-byte unchanged')
  check(externalRequests.length === 0, 'skip navigation sends zero external HTTPS requests')
  check(pageErrors.length === 0, 'skip navigation produces zero page errors')
  check(checks === EXPECTED_CHECKS - 1, `fixture executes exactly ${EXPECTED_CHECKS} checks`)
} finally {
  await context.close()
  await browser.close()
  server.kill()
}

if (checks !== EXPECTED_CHECKS || failures > 0) process.exitCode = 1
