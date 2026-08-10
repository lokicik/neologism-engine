// Phase 149 browser contract: Create command chips are nonmodal disclosures
// with observable state, deliberate focus restoration, and natural exits.
// Run after `npm run build`: node e2e/command-chips-keyboard.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PORT = 4199
const APP_URL = `http://localhost:${PORT}`
const E2E_DIR = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = join(E2E_DIR, '..')
const viteCli = join(WEB_DIR, 'node_modules', 'vite', 'bin', 'vite.js')
const EXPECTED_CHECKS = 46

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

async function activeElementIs(locator) {
  return locator.evaluate((element) => document.activeElement === element)
}

async function hasVisibleKeyboardFocus(locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element)
    return element.matches(':focus-visible')
      && style.outlineStyle !== 'none'
      && Number.parseFloat(style.outlineWidth) >= 1
  })
}

async function storageSnapshot(page) {
  return page.evaluate(() => Object.fromEntries(
    Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
      .filter((key) => key !== null)
      .sort()
      .map((key) => [key, localStorage.getItem(key)]),
  ))
}

async function pressedMap(panel) {
  return panel.locator('.menu-item').evaluateAll((items) => Object.fromEntries(items.map((item) => [
    item.querySelector('.menu-label')?.textContent?.trim() ?? '',
    item.getAttribute('aria-pressed'),
  ])))
}

async function viewportFit(page, panel) {
  return panel.evaluate((element) => {
    const active = document.activeElement
    const panelRect = element.getBoundingClientRect()
    const activeRect = active instanceof HTMLElement ? active.getBoundingClientRect() : null
    const style = active instanceof HTMLElement ? getComputedStyle(active) : null
    const outlineWidth = style ? Number.parseFloat(style.outlineWidth) || 0 : 0
    const outlineOffset = style ? Math.max(0, Number.parseFloat(style.outlineOffset) || 0) : 0
    const clearance = outlineWidth + outlineOffset
    return {
      fits: window.scrollX === 0
        && panelRect.left >= 0
        && panelRect.right <= window.innerWidth
        && activeRect !== null
        && activeRect.left - clearance >= 0
        && activeRect.right + clearance <= window.innerWidth,
      focusFitsVertically: activeRect !== null
        && activeRect.top - clearance >= 0
        && activeRect.bottom + clearance <= window.innerHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      scrollWidth: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
      viewportHeight: window.innerHeight,
      panel: [panelRect.left, panelRect.right],
      active: activeRect ? [activeRect.left, activeRect.right] : null,
      activeBlock: activeRect ? [activeRect.top, activeRect.bottom] : null,
      clearance,
    }
  })
}

const externalRequests = []

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await context.addInitScript(() => {
    localStorage.setItem('neologism:visited', '1')

    const activity = { fetch: [], xhr: [] }
    Object.defineProperty(window, '__commandChipNetwork', {
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
  })
  await context.route('https://**/*', async (route) => {
    externalRequests.push(route.request().url())
    await route.abort('blockedbyclient')
  })

  const page = await context.newPage()
  await page.goto(APP_URL)
  await page.locator('.command-area').waitFor({ state: 'visible' })
  const storedBefore = await storageSnapshot(page)

  const chipWraps = page.locator('.chips-row .chip-wrap')
  const lengthWrap = chipWraps.nth(0)
  const creativityWrap = chipWraps.nth(1)
  const advancedWrap = chipWraps.nth(2)
  const lengthTrigger = lengthWrap.locator(':scope > .chip')
  const creativityTrigger = creativityWrap.locator(':scope > .chip')
  const advancedTrigger = advancedWrap.locator(':scope > .chip')
  const creativityPanel = creativityWrap.getByRole('group', { name: 'Creativity choices' })

  check(
    await lengthTrigger.getAttribute('aria-label') === 'Length: Any length'
      && await creativityTrigger.getAttribute('aria-label') === 'Creativity: Balanced'
      && await advancedTrigger.getAttribute('aria-label') === 'Advanced filters',
    'all three disclosure triggers expose stable category names',
  )
  check(
    (await Promise.all([
      lengthTrigger.getAttribute('aria-expanded'),
      creativityTrigger.getAttribute('aria-expanded'),
      advancedTrigger.getAttribute('aria-expanded'),
    ])).every((value) => value === 'false'),
    'all command disclosures start collapsed',
  )
  const controlledIds = await Promise.all([
    lengthTrigger.getAttribute('aria-controls'),
    creativityTrigger.getAttribute('aria-controls'),
    advancedTrigger.getAttribute('aria-controls'),
  ])
  check(
    controlledIds.every(Boolean) && new Set(controlledIds).size === 3,
    'the three triggers expose distinct non-empty controlled panel ids',
  )
  check(await page.locator('.chip-menu').count() === 0, 'no command popup is rendered before an explicit action')

  await lengthTrigger.focus()
  await page.keyboard.press('Enter')
  const lengthPanel = lengthWrap.getByRole('group', { name: 'Length choices' })
  await lengthPanel.waitFor({ state: 'visible' })
  check(
    await lengthTrigger.getAttribute('aria-expanded') === 'true'
      && await lengthTrigger.getAttribute('aria-controls') === await lengthPanel.getAttribute('id'),
    'keyboard opening exposes the controlled Length choices group',
  )
  check(await activeElementIs(lengthTrigger), 'opening Length keeps DOM focus on its trigger')
  check(
    (await lengthPanel.locator('.menu-label').allTextContents()).map((label) => label.trim()).join('|')
      === 'Short|Medium|Long|Any length',
    'Length choices retain their exact category names and order',
  )
  const initialLengthPressed = await pressedMap(lengthPanel)
  check(
    initialLengthPressed['Any length'] === 'true'
      && ['Short', 'Medium', 'Long'].every((label) => initialLengthPressed[label] === 'false'),
    'Length aria-pressed marks only the current Any length choice',
  )

  await page.keyboard.press('Tab')
  const shortChoice = lengthPanel.getByRole('button', { name: /^Short\b/ })
  check(await activeElementIs(shortChoice), 'Tab from the Length trigger reaches the first choice')
  check(await hasVisibleKeyboardFocus(shortChoice), 'the focused Length choice has a visible keyboard focus indicator')
  await page.keyboard.press('Escape')
  check(
    await lengthTrigger.getAttribute('aria-expanded') === 'false'
      && await lengthPanel.count() === 0,
    'Escape collapses the Length disclosure',
  )
  check(await activeElementIs(lengthTrigger), 'Escape restores the exact Length trigger')
  check(await hasVisibleKeyboardFocus(lengthTrigger), 'the restored Length trigger has a visible focus indicator')

  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')
  check(
    await lengthTrigger.getAttribute('aria-label') === 'Length: Short'
      && await lengthTrigger.getAttribute('aria-expanded') === 'false',
    'keyboard selection changes the Length value and collapses its panel',
  )
  check(await activeElementIs(lengthTrigger), 'keyboard selection restores the Length trigger')
  check(await hasVisibleKeyboardFocus(lengthTrigger), 'keyboard selection leaves a visible focus indicator on Length')

  await page.keyboard.press('Enter')
  const selectedLengthPressed = await pressedMap(lengthPanel)
  check(
    selectedLengthPressed.Short === 'true'
      && selectedLengthPressed['Any length'] === 'false',
    'reopening Length exposes the updated Short aria-pressed state',
  )
  for (let index = 0; index < 5; index++) await page.keyboard.press('Tab')
  check(
    await lengthTrigger.getAttribute('aria-expanded') === 'false'
      && await lengthPanel.count() === 0
      && await activeElementIs(creativityTrigger),
    'Tab past the last Length choice closes it and preserves natural focus on Creativity',
  )
  check(await hasVisibleKeyboardFocus(creativityTrigger), 'the natural forward focus target remains visibly focused')

  await page.keyboard.press('Space')
  await creativityPanel.waitFor({ state: 'visible' })
  check(
    await creativityTrigger.getAttribute('aria-expanded') === 'true'
      && await creativityTrigger.getAttribute('aria-controls') === await creativityPanel.getAttribute('id'),
    'Space opens the focused Creativity disclosure and exposes its controlled group',
  )
  await lengthTrigger.click()
  check(await page.locator('.chip-menu').count() === 1, 'switching disclosures never leaves more than one popup open')
  check(
    await lengthTrigger.getAttribute('aria-expanded') === 'true'
      && await creativityTrigger.getAttribute('aria-expanded') === 'false',
    'opening Length by pointer closes the previously open Creativity disclosure',
  )

  const promptInput = page.getByPlaceholder('What are you building? (optional)')
  await promptInput.click()
  check(
    await page.locator('.chip-menu').count() === 0
      && await lengthTrigger.getAttribute('aria-expanded') === 'false'
      && await activeElementIs(promptInput),
    'an outside pointer action closes the popup without stealing its target focus',
  )

  await creativityTrigger.click()
  await creativityPanel.getByRole('button', { name: 'Wild', exact: true }).click()
  check(
    await creativityTrigger.getAttribute('aria-label') === 'Creativity: Wild'
      && await creativityTrigger.getAttribute('aria-expanded') === 'false',
    'pointer selection changes Creativity and collapses its panel',
  )
  check(await activeElementIs(creativityTrigger), 'pointer selection restores the Creativity trigger')

  await creativityTrigger.click()
  check(
    (await creativityPanel.locator('.menu-label').allTextContents()).map((label) => label.trim()).join('|')
      === 'Safe|Balanced|Wild',
    'Creativity choices retain their exact category names and order',
  )
  const creativityPressed = await pressedMap(creativityPanel)
  check(
    creativityPressed.Wild === 'true'
      && creativityPressed.Safe === 'false'
      && creativityPressed.Balanced === 'false',
    'Creativity aria-pressed marks only the selected Wild choice',
  )

  await advancedTrigger.click()
  const advancedPanel = advancedWrap.getByRole('group', { name: 'Advanced filters' })
  await advancedPanel.waitFor({ state: 'visible' })
  check(
    await page.locator('.chip-menu').count() === 1
      && await creativityTrigger.getAttribute('aria-expanded') === 'false'
      && await advancedTrigger.getAttribute('aria-expanded') === 'true',
    'switching to Advanced leaves exactly its one disclosure open',
  )
  check(
    await advancedPanel.getAttribute('role') === 'group'
      && await page.getByRole('menu').count() === 0,
    'Advanced is a named non-menu group suitable for real form fields',
  )
  check(
    await advancedTrigger.getAttribute('aria-controls') === await advancedPanel.getAttribute('id'),
    'Advanced controls resolves to its visible named group',
  )

  const referenceInput = advancedPanel.getByPlaceholder('Vercel, Linear, Notion')
  const seedWordsInput = advancedPanel.getByLabel(/Seed words/)
  const startsWithInput = advancedPanel.getByLabel('Starts with', { exact: true })
  await referenceInput.focus()
  await page.keyboard.press('Tab')
  check(
    await seedWordsInput.isDisabled()
      && await activeElementIs(startsWithInput),
    'Auto disables Seed words and forward Tab skips it for the next enabled Advanced field',
  )
  await startsWithInput.fill('z')
  check(
    await activeElementIs(startsWithInput)
      && await startsWithInput.inputValue() === 'z'
      && await advancedTrigger.getAttribute('aria-expanded') === 'true'
      && await advancedTrigger.getAttribute('aria-label') === 'Advanced filters, applied',
    'typing a storage-neutral Advanced filter keeps its nonmodal group open',
  )
  await page.keyboard.press('Escape')
  check(
    await advancedTrigger.getAttribute('aria-expanded') === 'false'
      && await advancedPanel.count() === 0
      && await activeElementIs(advancedTrigger),
    'Escape from an Advanced field closes the group and restores its trigger',
  )
  check(await hasVisibleKeyboardFocus(advancedTrigger), 'the restored Advanced trigger has a visible focus indicator')

  await page.keyboard.press('Enter')
  check(
    await startsWithInput.inputValue() === 'z'
      && await advancedTrigger.getAttribute('aria-expanded') === 'true',
    'the storage-neutral Starts with value survives Escape and reopening Advanced',
  )
  await page.keyboard.press('Tab')
  await page.keyboard.press('Shift+Tab')
  check(
    await activeElementIs(advancedTrigger)
      && await advancedTrigger.getAttribute('aria-expanded') === 'true',
    'reverse Tab from the first Advanced field returns to its trigger without closing',
  )
  await page.keyboard.press('Shift+Tab')
  check(
    await advancedTrigger.getAttribute('aria-expanded') === 'false'
      && await advancedPanel.count() === 0
      && await activeElementIs(creativityTrigger),
    'reverse Tab out of Advanced closes it and preserves the natural Creativity target',
  )

  await advancedTrigger.focus()
  await page.keyboard.press('Enter')
  const advancedEnabledFields = advancedPanel.locator('input:not([disabled])')
  const advancedEnabledFieldCount = await advancedEnabledFields.count()
  for (let index = 0; index <= advancedEnabledFieldCount; index++) await page.keyboard.press('Tab')
  check(
    await advancedTrigger.getAttribute('aria-expanded') === 'false'
      && await advancedPanel.count() === 0
      && await page.evaluate(() => document.activeElement !== document.body)
      && !await advancedWrap.evaluate((wrapper) => wrapper.contains(document.activeElement)),
    'forward Tab past the last enabled Advanced field closes it on a natural non-BODY target',
  )

  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 700 }]) {
    await page.setViewportSize(viewport)
    await page.evaluate(() => window.scrollTo(0, 0))
    await advancedTrigger.focus()
    await page.keyboard.press('Enter')
    await advancedPanel.waitFor({ state: 'visible' })
    await referenceInput.focus()
    const fit = await viewportFit(page, advancedPanel)
    check(
      fit.fits && fit.focusFitsVertically,
      `${viewport.width}px Advanced panel stays horizontally contained and the focused ring stays fully visible (${JSON.stringify(fit)})`,
    )
    if (viewport.width === 320) {
      const containsInput = advancedPanel.getByLabel('Contains', { exact: true })
      for (const [label, field] of [['Starts with', startsWithInput], ['Contains', containsInput]]) {
        await page.keyboard.press('Tab')
        const focusedFit = await viewportFit(page, advancedPanel)
        check(
          await activeElementIs(field) && focusedFit.fits && focusedFit.focusFitsVertically,
          `320px ${label} focus and full ring scroll inside the viewport (${JSON.stringify(focusedFit)})`,
        )
      }
    }
    await page.keyboard.press('Escape')
  }

  check(
    await page.locator('.results-grid .name-card, .skeleton-card').count() === 0
      && await page.locator('.empty-state').isVisible(),
    'command disclosure interactions do not start generation or render results',
  )
  const storedAfter = await storageSnapshot(page)
  check(
    JSON.stringify(storedAfter) === JSON.stringify(storedBefore),
    'command disclosure interactions leave browser storage byte-for-byte unchanged',
  )
  const networkActivity = await page.evaluate(() => window.__commandChipNetwork)
  check(
    networkActivity.fetch.length === 0 && networkActivity.xhr.length === 0,
    'command disclosure interactions issue zero fetch or XMLHttpRequest calls',
  )
  check(externalRequests.length === 0, 'no external request escapes the deterministic fixture')

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
  console.error(`command chips keyboard browser: ${failures} failure(s), ${checks}/${EXPECTED_CHECKS} checks executed`)
  process.exitCode = 1
} else {
  console.log(`command chips keyboard browser: ${checks}/${EXPECTED_CHECKS} checks passed`)
}
