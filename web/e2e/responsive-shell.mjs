// Phase 151 browser contract: the shared app shell stays horizontally contained
// before focus can pan the viewport, while its natural navigation order survives.
// Run after `npm run build`: node e2e/responsive-shell.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PORT = 4200
const APP_URL = `http://localhost:${PORT}`
const E2E_DIR = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = join(E2E_DIR, '..')
const viteCli = join(WEB_DIR, 'node_modules', 'vite', 'bin', 'vite.js')
const EXPECTED_CHECKS = 20
const VIEWPORTS = [
  { width: 1280, height: 900, layout: 'desktop' },
  { width: 390, height: 844, layout: 'mobile' },
  { width: 320, height: 700, layout: 'mobile' },
]
const SAVED_STUBS = [
  {
    name: 'SharedAlpha',
    style: 'big_tech',
    score_pronounce: 0,
    score_novelty: 0,
    score_memorability: 0,
    connotations: [],
    syllables: 0,
  },
  {
    name: 'SharedBeta',
    style: 'big_tech',
    score_pronounce: 0,
    score_novelty: 0,
    score_memorability: 0,
    connotations: [],
    syllables: 0,
  },
  {
    name: 'SharedGamma',
    style: 'big_tech',
    score_pronounce: 0,
    score_novelty: 0,
    score_memorability: 0,
    connotations: [],
    syllables: 0,
  },
]

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
const externalRequests = []
const storageResults = []
const networkResults = []

const check = (ok, label) => {
  checks++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) failures++
}

async function storageSnapshot(page) {
  return page.evaluate(() => JSON.stringify({
    local: Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)]),
    session: Object.keys(sessionStorage).sort().map((key) => [key, sessionStorage.getItem(key)]),
  }))
}

async function captureSavedLayout(page) {
  return page.evaluate(() => {
    const tolerance = 1
    const viewportWidth = window.innerWidth

    const describe = (element) => {
      if (!(element instanceof HTMLElement)) return null
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        display: style.display,
        visibility: style.visibility,
        opacity: Number.parseFloat(style.opacity),
        overflowX: style.overflowX,
        text: element.innerText.replace(/\s+/g, ' ').trim(),
      }
    }

    const fits = (item) => Boolean(
      item
      && item.display !== 'none'
      && item.visibility !== 'hidden'
      && item.width > 0
      && item.height > 0
      && item.left >= -tolerance
      && item.right <= viewportWidth + tolerance
      && item.scrollWidth <= item.clientWidth + tolerance,
    )
    const visiblyFits = (item) => fits(item) && item.opacity > 0

    const overlaps = (first, second) => Boolean(
      first
      && second
      && Math.min(first.right, second.right) - Math.max(first.left, second.left) > tolerance
      && Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top) > tolerance,
    )

    const selectors = {
      shell: '.shell',
      sidebar: '.sidebar',
      page: '.page',
      savedPage: '.saved-page',
      pageHeader: '.page-header',
      pageTitle: '.page-title',
      pageToolbar: '.page-toolbar',
      resultsGrid: '.saved-page .results-grid',
      firstCard: '.saved-page .name-card',
    }
    const elements = Object.fromEntries(Object.entries(selectors).map(([key, selector]) => [
      key,
      describe(document.querySelector(selector)),
    ]))
    const sidebarButtons = Array.from(document.querySelectorAll('.sidebar button')).map(describe)
    const toolbarButtons = Array.from(document.querySelectorAll('.page-toolbar button')).map(describe)
    const maskedOverflow = [
      document.documentElement,
      document.body,
      document.querySelector('.shell'),
      document.querySelector('.sidebar'),
      document.querySelector('.page'),
      document.querySelector('.page-header'),
      document.querySelector('.page-toolbar'),
    ].filter((element) => element instanceof HTMLElement).map((element) => ({
      element: element === document.documentElement
        ? 'html'
        : element === document.body
          ? 'body'
          : element.className,
      overflowX: getComputedStyle(element).overflowX,
    })).filter(({ overflowX }) => ['hidden', 'clip', 'auto', 'scroll'].includes(overflowX))

    return {
      viewportWidth,
      viewportHeight: window.innerHeight,
      scrollX: window.scrollX,
      htmlClientWidth: document.documentElement.clientWidth,
      htmlScrollWidth: document.documentElement.scrollWidth,
      bodyClientWidth: document.body.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
      maskedOverflow,
      elements,
      sidebarButtons,
      toolbarButtons,
      shellFits: ['shell', 'sidebar', 'page'].every((key) => fits(elements[key])),
      savedFits: ['savedPage', 'pageHeader', 'pageTitle', 'pageToolbar', 'resultsGrid']
        .every((key) => visiblyFits(elements[key]))
        // NameCard deliberately starts its 450 ms mount animation at opacity 0;
        // its box is already final, which is the horizontal-overflow evidence.
        && fits(elements.firstCard),
      sidebarButtonsFit: sidebarButtons.length === 6 && sidebarButtons.every(visiblyFits),
      toolbarButtonsFit: toolbarButtons.length === 4 && toolbarButtons.every(visiblyFits),
      sidebarButtonsOverlap: sidebarButtons.some((first, index) => (
        sidebarButtons.slice(index + 1).some((second) => overlaps(first, second))
      )),
      toolbarButtonsOverlap: toolbarButtons.some((first, index) => (
        toolbarButtons.slice(index + 1).some((second) => overlaps(first, second))
      )),
      titleToolbarOverlap: overlaps(elements.pageTitle, elements.pageToolbar),
    }
  })
}

async function naturalSidebarOrder(page) {
  const controls = page.locator('.sidebar button')
  if (await controls.count() !== 6) return []
  await controls.first().focus()
  const order = []
  for (let index = 0; index < 6; index++) {
    order.push(await page.evaluate(() => (
      document.activeElement instanceof HTMLElement
        ? document.activeElement.innerText.replace(/\s+/g, ' ').trim()
        : ''
    )))
    if (index < 5) await page.keyboard.press('Tab')
  }
  return order
}

async function savedToolbarFocusRings(page) {
  const buttons = page.locator('.page-toolbar .toolbar-btn')
  if (await buttons.count() !== 4) return []
  await buttons.first().focus()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
  const rings = []
  for (let index = 0; index < 4; index++) {
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
        focusVisible: element.matches(':focus-visible'),
        outline,
        outlineStyle: style.outlineStyle,
        offset,
      }
    }))
    if (index < 3) await page.keyboard.press('Tab')
  }
  return rings
}

async function runScenario(viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
  })
  await context.addInitScript(({ saved }) => {
    localStorage.setItem('neologism:visited', '1')
    localStorage.setItem('neologism:imported-saved', JSON.stringify(saved))

    const activity = { fetch: [], xhr: [] }
    Object.defineProperty(window, '__responsiveShellNetwork', {
      configurable: false,
      value: activity,
    })

    const nativeFetch = window.fetch
    window.fetch = function trackedFetch(input, init) {
      activity.fetch.push(input instanceof Request ? input.url : String(input))
      return nativeFetch.call(this, input, init)
    }

    const nativeOpen = XMLHttpRequest.prototype.open
    XMLHttpRequest.prototype.open = function trackedOpen(method, url, ...rest) {
      activity.xhr.push(`${method} ${String(url)}`)
      return nativeOpen.call(this, method, url, ...rest)
    }
  }, { saved: SAVED_STUBS })
  await context.route('https://**/*', async (route) => {
    externalRequests.push(route.request().url())
    await route.abort('blockedbyclient')
  })

  const page = await context.newPage()
  await page.goto(APP_URL)
  await page.locator('.command-area').waitFor({ state: 'visible' })
  const storageBefore = await storageSnapshot(page)

  const createButton = page.getByRole('button', { name: /^Create$/ })
  const studioButton = page.getByRole('button', { name: /^AI Studio$/ })
  const savedButton = page.getByRole('button', { name: /^Saved\b/ })
  const settingsButton = page.getByRole('button', { name: /Settings$/ })

  const createReady = await createButton.evaluate((button) => button.classList.contains('active'))
  await studioButton.click()
  await page.locator('.ai-studio').waitFor({ state: 'visible' })
  const studioReady = await studioButton.evaluate((button) => button.classList.contains('active'))
    && await page.getByRole('heading', { name: /AI Studio/ }).isVisible()
  await savedButton.click()
  await page.locator('.saved-page').waitFor({ state: 'visible' })

  // This is the regression point. Do not focus another control, call scrollTo,
  // or open Settings before the shell-wide snapshot has been captured.
  const savedLayout = await captureSavedLayout(page)
  const savedReady = await savedButton.evaluate((button) => button.classList.contains('active'))
    && await page.getByRole('heading', { name: /Saved names/ }).isVisible()
    && await page.locator('.saved-page .name-card').count() === 3
    && await page.locator('.page-toolbar button').count() === 4
  const toolbarFocusRings = await savedToolbarFocusRings(page)

  await settingsButton.click()
  const dialog = page.getByRole('dialog', { name: 'Settings' })
  await dialog.waitFor({ state: 'visible' })
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'detached' })
  const settingsRestored = await settingsButton.evaluate((button) => document.activeElement === button)
  const tabOrder = await naturalSidebarOrder(page)
  const expectedTabOrder = ['neologism', 'create', 'ai studio', 'saved', 'settings', 'about']
  const naturalOrder = tabOrder.length === expectedTabOrder.length
    && tabOrder.every((label, index) => label.toLowerCase().includes(expectedTabOrder[index]))

  const sidebar = savedLayout.elements.sidebar
  const pageBox = savedLayout.elements.page
  const placementOk = viewport.layout === 'desktop'
    ? Boolean(sidebar && pageBox && sidebar.right <= pageBox.left + 1 && sidebar.height >= viewport.height - 1)
    : Boolean(sidebar && pageBox && sidebar.bottom <= pageBox.top + 1)
  const mobileTargetsOk = viewport.layout !== 'mobile'
    || savedLayout.sidebarButtons.every((button) => button && button.height >= 39.5)
  const mobileToolbarTargetsOk = viewport.layout !== 'mobile'
    || savedLayout.toolbarButtons.every((button) => button && button.width >= 39.5 && button.height >= 39.5)
  const sidebarLabels = savedLayout.sidebarButtons.map((button) => button?.text.toLowerCase() ?? '')
  const expectedSidebarLabels = ['neologism', 'create', 'ai studio', 'saved', 'settings', 'about']
  const labelsVisible = sidebarLabels.length === expectedSidebarLabels.length
    && sidebarLabels.every((label, index) => label.includes(expectedSidebarLabels[index]))
  const toolbarLabels = savedLayout.toolbarButtons.map((button) => button?.text.toLowerCase() ?? '')
  const expectedToolbarLabels = ['copy all', 'txt', 'json', 'share link']
  const toolbarVisible = toolbarLabels.length === expectedToolbarLabels.length
    && toolbarLabels.every((label, index) => label.includes(expectedToolbarLabels[index]))

  check(
    createReady && studioReady && savedReady && settingsRestored && naturalOrder,
    `${viewport.width}px keeps real Create -> AI Studio -> Saved -> Settings navigation and natural sidebar Tab order`,
  )
  check(
    savedLayout.scrollX === 0
      && savedLayout.htmlClientWidth === viewport.width
      && savedLayout.htmlScrollWidth <= viewport.width + 1
      && savedLayout.bodyClientWidth <= viewport.width + 1
      && savedLayout.bodyScrollWidth <= viewport.width + 1
      && savedLayout.maskedOverflow.length === 0,
    `${viewport.width}px fresh Saved navigation has no global horizontal overflow or overflow masking (${JSON.stringify(savedLayout)})`,
  )
  check(
    savedLayout.shellFits && placementOk,
    `${viewport.width}px shell, sidebar, and page stay contained in the expected ${viewport.layout} arrangement`,
  )
  check(
    savedLayout.sidebarButtonsFit
      && !savedLayout.sidebarButtonsOverlap
      && labelsVisible
      && mobileTargetsOk,
    `${viewport.width}px keeps all six sidebar controls visible, separate, ordered, and mobile-safe`,
  )
  check(
    savedLayout.savedFits
      && savedLayout.toolbarButtonsFit
      && !savedLayout.toolbarButtonsOverlap
      && !savedLayout.titleToolbarOverlap
      && mobileToolbarTargetsOk
      && toolbarVisible,
    `${viewport.width}px keeps the Saved title, four toolbar actions, grid, and first card fully visible and mobile-safe`,
  )
  if (!toolbarFocusRings.every((ring) => ring.ok)) {
    console.log(`INFO  ${viewport.width}px Saved toolbar focus rings`, toolbarFocusRings)
  }
  check(
    toolbarFocusRings.length === 4 && toolbarFocusRings.every((ring) => ring.ok),
    `${viewport.width}px gives all four Saved toolbar actions a contained 2px focus ring`,
  )

  storageResults.push({
    viewport: viewport.width,
    unchanged: await storageSnapshot(page) === storageBefore,
  })
  networkResults.push({
    viewport: viewport.width,
    activity: await page.evaluate(() => window.__responsiveShellNetwork),
  })
  await context.close()
}

try {
  for (const viewport of VIEWPORTS) await runScenario(viewport)

  check(
    storageResults.length === VIEWPORTS.length && storageResults.every((result) => result.unchanged),
    `responsive shell navigation leaves browser storage byte-for-byte unchanged (${JSON.stringify(storageResults)})`,
  )
  check(
    externalRequests.length === 0
      && networkResults.length === VIEWPORTS.length
      && networkResults.every(({ activity }) => activity.fetch.length === 0 && activity.xhr.length === 0),
    `responsive shell navigation issues zero fetch/XMLHttpRequest calls or external HTTPS requests (${JSON.stringify({ networkResults, externalRequests })})`,
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
  console.error(`responsive shell browser: ${failures} failure(s), ${checks}/${EXPECTED_CHECKS} checks executed`)
  process.exitCode = 1
} else {
  console.log(`responsive shell browser: ${checks}/${EXPECTED_CHECKS} checks passed`)
}
