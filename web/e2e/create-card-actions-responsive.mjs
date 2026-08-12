// Phase 182 browser contract: all five Create-card actions stay contained and
// keep their native order when a narrow card must wrap its action row.
// Run after `npm run build`: node e2e/create-card-actions-responsive.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PORT = 4214
const APP_URL = `http://localhost:${PORT}`
const E2E_DIR = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = join(E2E_DIR, '..')
const viteCli = join(WEB_DIR, 'node_modules', 'vite', 'bin', 'vite.js')
const EXPECTED_CHECKS = 15
const VIEWPORTS = [1280, 390, 360, 320]

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
const externalRequests = []

const check = (ok, label) => {
  checks++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) failures++
}

async function actionGeometry(card) {
  return card.evaluate((element) => {
    const cardRect = element.getBoundingClientRect()
    const row = element.querySelector('.card-actions-row')
    const controls = Array.from(element.querySelectorAll('.card-actions-row button'))
    if (!(row instanceof HTMLElement) || controls.length !== 5) return { complete: false }
    const rects = controls.map((control) => {
      const rect = control.getBoundingClientRect()
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
    })
    const overlaps = rects.some((a, index) => rects.slice(index + 1).some((b) => (
      Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0
      && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0
    )))
    return {
      complete: true,
      cardContained: element.scrollWidth <= element.clientWidth + 1,
      controlsContained: rects.every((rect) => (
        rect.left >= cardRect.left && rect.right <= cardRect.right
        && rect.top >= cardRect.top && rect.bottom <= cardRect.bottom
      )),
      overlaps,
    }
  })
}

try {
  for (const width of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width, height: width <= 360 ? 700 : 844 } })
    await context.addInitScript(() => localStorage.setItem('neologism:visited', '1'))
    const page = await context.newPage()
    page.on('pageerror', (error) => pageErrors.push(`${width}: ${error.message}`))
    page.on('request', (request) => {
      if (request.url().startsWith('https://')) externalRequests.push(`${width}: ${request.url()}`)
    })
    await page.goto(APP_URL)
    await page.getByRole('button', { name: /a Rust CLI that processes logs/ }).click()
    const card = page.locator('.name-card').first()
    await card.waitFor({ state: 'visible' })
    const name = (await card.locator('.name-text').textContent())?.trim()

    const documentFit = await page.evaluate(() => (
      scrollX === 0
      && document.documentElement.scrollWidth <= innerWidth + 1
      && document.body.scrollWidth <= innerWidth + 1
    ))
    check(documentFit, `${width}px generated Create page has no horizontal document overflow`)

    const geometry = await actionGeometry(card)
    if (!(geometry.complete && geometry.cardContained && geometry.controlsContained && !geometry.overlaps)) {
      console.log(`INFO  ${width}px action geometry`, geometry)
    }
    check(
      geometry.complete && geometry.cardContained && geometry.controlsContained && !geometry.overlaps,
      `${width}px card contains five non-overlapping actions`,
    )

    const firstAction = card.getByRole('button', { name: `Why ${name} was generated` })
    await firstAction.focus()
    const focusOrder = []
    for (let index = 0; index < 5; index++) {
      focusOrder.push(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
      if (index < 4) await page.keyboard.press('Tab')
    }
    check(JSON.stringify(focusOrder) === JSON.stringify([
      `Why ${name} was generated`,
      `Name checks for ${name}`,
      `Copy ${name}`,
      `${name} is not for me`,
      `Save ${name} to favorites`,
    ]), `${width}px wrapping preserves the five-action DOM and Tab order`)
    if (width === 320) {
      await page.screenshot({ path: join(E2E_DIR, 'shots', 'create-card-actions-320.png'), fullPage: true })
    }
    await context.close()
  }

  check(externalRequests.length === 0, `responsive card paths make zero external HTTPS requests (${JSON.stringify(externalRequests)})`)
  check(pageErrors.length === 0, `responsive card paths produce zero page errors (${JSON.stringify(pageErrors)})`)
  check(checks === EXPECTED_CHECKS - 1, `fixture executes exactly ${EXPECTED_CHECKS} checks`)
} finally {
  await browser.close()
  server.kill()
}

if (checks !== EXPECTED_CHECKS || failures > 0) process.exitCode = 1
