// Phase 148/212/214/217 browser contract: Settings is a real keyboard-contained modal,
// its model picker follows the aria-activedescendant combobox pattern, and a
// reopened or retargeted localhost picker reflects only its current URL.
// Run after `npm run build`: node e2e/settings-keyboard.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PORT = 4198
const APP_URL = `http://localhost:${PORT}`
const E2E_DIR = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = join(E2E_DIR, '..')
const viteCli = join(WEB_DIR, 'node_modules', 'vite', 'bin', 'vite.js')
const EXPECTED_CHECKS = 63
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')
const MOCK_MODELS = Array.from({ length: 65 }, (_, index) => {
  const suffix = String(index).padStart(2, '0')
  return {
    id: `mock/model-${suffix}`,
    name: `Model ${suffix}`,
    context_length: 8192 + index * 1024,
    ...(index === 64
      ? {}
      : index === 63
        ? { pricing: { prompt: String(Number.MAX_VALUE), completion: String(Number.MAX_VALUE) } }
        : { pricing: { prompt: '0', completion: '0' } }),
  }
})
const FIRST_MODEL = MOCK_MODELS[0].id
const EXTREME_PRICE_MODEL = MOCK_MODELS[63].id
const TYPED_MODEL = MOCK_MODELS[64].id
const PASS_STUB = {
  name: 'FixturePass',
  style: 'big_tech',
  sourceMode: 'brandable',
  tasteContext: {
    id: JSON.stringify(['big_tech', 'fixture project', []]),
    description: 'fixture project',
    roots: [],
  },
  syllables: 3,
  score_pronounce: 80,
  score_novelty: 80,
  score_memorability: 80,
  connotations: [],
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

const deferred = () => {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

async function activeElementIs(locator) {
  return locator.evaluate((element) => document.activeElement === element)
}

async function waitForFocus(page, selector) {
  await page.waitForFunction((candidate) => document.activeElement?.matches(candidate), selector)
}

async function activeModelText(input) {
  return input.evaluate((element) => {
    const id = element.getAttribute('aria-activedescendant')
    return id ? document.getElementById(id)?.textContent?.trim() ?? '' : ''
  })
}

async function keyboardFocusState(dialog) {
  return dialog.evaluate((modal) => {
    const active = document.activeElement
    if (!(active instanceof HTMLElement)) return { inside: false, indicator: false }
    const style = getComputedStyle(active)
    return {
      inside: modal.contains(active),
      indicator: active.matches(':focus-visible')
        && style.outlineStyle !== 'none'
        && Number.parseFloat(style.outlineWidth) >= 1,
    }
  })
}

async function openSettingsByKeyboard(page, trigger, dialog) {
  await trigger.focus()
  await page.keyboard.press('Enter')
  await dialog.waitFor({ state: 'visible' })
}

let modelRequests = 0
let openRouterModelAuthorization = null
let localModelRequests = 0
let localModel = 'local/model-a'
let replacementEndpointRequests = 0
const replacementEndpointResponse = deferred()
let closingEndpointRequests = 0
let closingRouteAbortObserved = false
const closingEndpointResponse = deferred()

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await context.addInitScript(({ firstModel, passStub }) => {
    localStorage.setItem('neologism:visited', '1')
    localStorage.setItem('neologism:judge', JSON.stringify({
      enabled: true,
      provider: 'openrouter',
      apiKey: 'fixture-key',
      model: firstModel,
    }))
    localStorage.setItem('neologism:rejected', JSON.stringify([passStub]))
  }, { firstModel: FIRST_MODEL, passStub: PASS_STUB })
  await context.route('https://openrouter.ai/api/v1/models', async (route) => {
    modelRequests++
    openRouterModelAuthorization = route.request().headers().authorization ?? null
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ data: [...MOCK_MODELS, { id: 17 }, { id: 'broken\uD83D' }] }),
    })
  })
  await context.route('http://127.0.0.1:9020/v1/models', async (route) => {
    localModelRequests++
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ data: [{ id: localModel }] }),
    })
  })
  await context.route('http://127.0.0.1:9021/v1/models', async (route) => {
    replacementEndpointRequests++
    await replacementEndpointResponse.promise
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ data: [{ id: 'local/model-c' }] }),
    })
  })
  await context.route('http://127.0.0.1:9022/v1/models', async (route) => {
    closingEndpointRequests++
    await closingEndpointResponse.promise
    try {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ data: [{ id: 'local/model-d' }] }),
      })
    } catch {
      closingRouteAbortObserved = true
    }
  })

  const page = await context.newPage()
  let failedClosingRequests = 0
  page.on('requestfailed', (request) => {
    if (request.url() === 'http://127.0.0.1:9022/v1/models') failedClosingRequests++
  })
  await page.goto(APP_URL)

  const trigger = page.locator('.sidebar-settings')
  const dialog = page.locator('.settings-modal[role="dialog"]')
  await trigger.focus()
  check(await activeElementIs(trigger), 'Settings trigger can receive keyboard focus')

  await page.keyboard.press('Enter')
  await dialog.waitFor({ state: 'visible' })
  check(await dialog.isVisible(), 'Enter on the Settings trigger opens the dialog')
  check(await dialog.getAttribute('aria-modal') === 'true', 'dialog exposes aria-modal=true')

  const labelledBy = await dialog.getAttribute('aria-labelledby')
  const describedBy = await dialog.getAttribute('aria-describedby')
  check(
    Boolean(labelledBy)
      && await dialog.locator(`#${labelledBy}`).textContent() === 'Settings',
    'dialog name is provided by its Settings heading',
  )
  check(
    Boolean(describedBy)
      && ((await dialog.locator(`#${describedBy}`).textContent()) ?? '').trim().length > 0,
    'dialog description resolves to visible introductory copy',
  )
  check(
    ((await dialog.locator(`#${describedBy}`).textContent()) ?? '').replace(/\s+/g, ' ').trim()
      === 'Configure the model the AI Studio uses to rank your names — OpenRouter (your key) or a local server. Ranking runs only in AI Studio, on demand. When AI is enabled, Settings requests model choices from the selected provider.',
    'intro distinguishes on-demand Studio ranking from Settings model discovery',
  )
  check(
    (await dialog.locator('.settings-hint').first().textContent())?.replace(/\s+/g, ' ').trim()
      === 'Free :free models work well here. Get a key at openrouter.ai/keys. Your key is stored in this browser only. Settings model-list requests do not include it; AI Studio sends it straight to OpenRouter only when you rank.',
    'OpenRouter hint distinguishes catalog discovery from key-bearing ranking',
  )

  const close = dialog.getByRole('button', { name: 'Close settings' })
  await waitForFocus(page, '.settings-head button[aria-label="Close settings"]')
  check(await activeElementIs(close), 'focus starts on the named Close settings button')
  const initialFocus = await keyboardFocusState(dialog)
  check(initialFocus.indicator, 'initial keyboard focus has a visible :focus-visible outline')

  const save = dialog.getByRole('button', { name: 'Save', exact: true })
  await page.keyboard.press('Shift+Tab')
  check(await activeElementIs(save), 'Shift+Tab from Close wraps to Save')
  await page.keyboard.press('Tab')
  check(await activeElementIs(close), 'Tab from Save wraps back to Close')

  const tabStops = dialog.locator(FOCUSABLE)
  const tabStopCount = await tabStops.count()
  const forwardStates = []
  for (let index = 0; index < tabStopCount * 2; index++) {
    forwardStates.push(await keyboardFocusState(dialog))
    await page.keyboard.press('Tab')
  }
  check(
    forwardStates.length === tabStopCount * 2 && forwardStates.every((state) => state.inside),
    'two full forward Tab cycles never reach the sidebar or page',
  )
  check(
    forwardStates.every((state) => state.indicator),
    'every enabled control visited forward has a visible focus indicator',
  )

  const backwardStates = []
  for (let index = 0; index < tabStopCount * 2; index++) {
    await page.keyboard.press('Shift+Tab')
    backwardStates.push(await keyboardFocusState(dialog))
  }
  check(
    backwardStates.length === tabStopCount * 2 && backwardStates.every((state) => state.inside),
    'two full reverse Tab cycles never reach the sidebar or page',
  )
  check(
    backwardStates.every((state) => state.indicator),
    'every enabled control visited backward has a visible focus indicator',
  )

  const controls = dialog.locator('button, input, textarea, select, a[href]')
  const unnamedControls = []
  for (let index = 0; index < await controls.count(); index++) {
    const snapshot = (await controls.nth(index).ariaSnapshot()).trim().split('\n')[0] ?? ''
    if (!/"[^"]+"/.test(snapshot)) unnamedControls.push(snapshot || `control ${index}`)
  }
  check(
    unnamedControls.length === 0,
    `every rendered Settings control has an accessible name${unnamedControls.length ? ` (${unnamedControls.join(', ')})` : ''}`,
  )
  check(
    await dialog.getByLabel(/Judge prompt/).count() === 0
      && await dialog.getByRole('button', { name: 'Reset to default' }).count() === 0,
    'Settings exposes no editable prompt that AI Studio would silently replace',
  )

  const passedToggle = dialog.getByRole('button', { name: /Review passed names/ })
  check(
    await passedToggle.isEnabled()
      && await passedToggle.getAttribute('aria-expanded') === 'false',
    'one-pass disclosure starts keyboard-enabled and collapsed',
  )
  await passedToggle.focus()
  await page.keyboard.press('Enter')
  const undoPass = dialog.getByRole('button', { name: /Undo pass on FixturePass/ })
  check(
    await passedToggle.getAttribute('aria-expanded') === 'true'
      && await undoPass.isVisible(),
    'one-pass disclosure opens from the keyboard',
  )
  await undoPass.focus()
  await page.keyboard.press('Enter')
  await dialog.getByText('No passed names remain.').waitFor({ state: 'visible' })
  await waitForFocus(page, '.settings-passed-toggle')
  check(
    await passedToggle.getAttribute('aria-expanded') === 'true'
      && await passedToggle.isEnabled()
      && await activeElementIs(passedToggle),
    'undoing the final pass keeps its open disclosure and focuses the toggle',
  )
  await page.keyboard.press('Enter')
  const cancel = dialog.getByRole('button', { name: 'Cancel', exact: true })
  check(
    await passedToggle.getAttribute('aria-expanded') === 'false'
      && await passedToggle.isDisabled()
      && await activeElementIs(cancel),
    'collapsing the dynamic zero state disables its toggle and moves focus to Cancel',
  )
  await page.keyboard.press('Tab')
  check(
    await activeElementIs(save)
      && await dialog.evaluate((modal) => modal.contains(document.activeElement)),
    'next Tab after dynamic zero collapse remains owned by the modal',
  )

  const combo = dialog.locator('.model-combo input')
  check(await combo.getAttribute('role') === 'combobox', 'model input exposes role=combobox')
  check(await combo.getAttribute('aria-autocomplete') === 'list', 'combobox exposes aria-autocomplete=list')
  check(
    await combo.getAttribute('aria-expanded') === 'false'
      && Boolean(await combo.getAttribute('aria-controls')),
    'collapsed combobox exposes expanded state and a controlled popup id',
  )

  await combo.focus()
  const listbox = dialog.getByRole('listbox', { name: 'Available models' })
  await listbox.waitFor({ state: 'visible' })
  await dialog.getByRole('option', { name: new RegExp(FIRST_MODEL) }).waitFor({ state: 'visible' })
  check(
    await combo.getAttribute('aria-expanded') === 'true'
      && await combo.getAttribute('aria-controls') === await listbox.getAttribute('id'),
    'focusing the combobox opens the controlled listbox',
  )

  const options = dialog.getByRole('option')
  const optionNames = (await options.allTextContents()).map((name) => name.trim())
  check(
    optionNames.length === 60
      && [FIRST_MODEL, MOCK_MODELS[17].id, MOCK_MODELS[59].id]
        .every((name) => optionNames.some((option) => option.includes(name))),
    '65 mocked models render as a capped list of 60 named options',
  )
  check(
    !optionNames.some((option) => option.includes(TYPED_MODEL)),
    'source model beyond index 59 starts outside the capped rendered list',
  )
  check(
    (await options.evaluateAll((items) => items.map((item) => item.getAttribute('aria-selected'))))
      .every((value) => value === 'true' || value === 'false'),
    'every model option exposes aria-selected',
  )
  check(
    await activeElementIs(combo)
      && Boolean(await combo.getAttribute('aria-activedescendant')),
    'combobox retains DOM focus and identifies its active option',
  )

  await page.keyboard.press('ArrowDown')
  check((await activeModelText(combo)).includes('mock/model-01'), 'ArrowDown advances the active option')
  await page.keyboard.press('ArrowUp')
  check((await activeModelText(combo)).includes(FIRST_MODEL), 'ArrowUp returns to the previous option')

  const activeBeforeEnd = await combo.getAttribute('aria-activedescendant')
  await page.keyboard.press('End')
  check(
    await combo.getAttribute('aria-activedescendant') === activeBeforeEnd
      && await combo.inputValue() === FIRST_MODEL
      && await combo.evaluate((element) => element.selectionStart === element.value.length),
    'End keeps native text-caret behavior without navigating model options',
  )
  await page.keyboard.press('Home')
  check(
    await combo.getAttribute('aria-activedescendant') === activeBeforeEnd
      && await combo.inputValue() === FIRST_MODEL
      && await combo.evaluate((element) => element.selectionStart === 0),
    'Home keeps native text-caret behavior without navigating model options',
  )

  for (let index = 0; index < 18; index++) await page.keyboard.press('ArrowDown')
  check((await activeModelText(combo)).includes('mock/model-18'), 'repeated ArrowDown reaches an off-screen option')
  await page.waitForFunction(() => {
    const input = document.querySelector('.model-combo input')
    const list = document.querySelector('.model-menu')
    const id = input?.getAttribute('aria-activedescendant')
    const option = id ? document.getElementById(id) : null
    if (!list || !option) return false
    const listRect = list.getBoundingClientRect()
    const optionRect = option.getBoundingClientRect()
    return optionRect.top >= listRect.top && optionRect.bottom <= listRect.bottom
  })
  check(true, 'active option remains visible after keyboard scrolling')

  await page.keyboard.press('Control+A')
  await page.keyboard.type(TYPED_MODEL)
  check(await combo.inputValue() === TYPED_MODEL, 'editable combobox accepts an exact non-first model id')
  const typedOptionNames = (await options.allTextContents()).map((name) => name.trim())
  check(
    typedOptionNames.length === 60
      && typedOptionNames.some((option) => option.includes(TYPED_MODEL)),
    'exact source model beyond index 59 is substituted into the capped rendered list',
  )
  check(
    typedOptionNames.some((option) => option.includes(TYPED_MODEL) && option.includes('variable')),
    'a selected OpenRouter model with missing pricing is labeled variable rather than free',
  )
  check((await activeModelText(combo)).includes(TYPED_MODEL), 'exact typed model becomes the active option')
  const typedOptionVisible = await combo.evaluate((element) => {
    const listId = element.getAttribute('aria-controls')
    const optionId = element.getAttribute('aria-activedescendant')
    const list = listId ? document.getElementById(listId) : null
    const option = optionId ? document.getElementById(optionId) : null
    if (!list || !option) return false
    const listRect = list.getBoundingClientRect()
    const optionRect = option.getBoundingClientRect()
    return optionRect.top >= listRect.top && optionRect.bottom <= listRect.bottom
  })
  check(typedOptionVisible, 'exact typed active option is scrolled into view')

  await page.keyboard.press('Enter')
  check(
    await combo.inputValue() === TYPED_MODEL
      && await combo.getAttribute('aria-expanded') === 'false'
      && await listbox.count() === 0,
    'Enter preserves and selects the exact typed model id, then closes the listbox',
  )
  check(await activeElementIs(combo), 'combobox keeps focus after keyboard selection')

  await combo.click()
  await page.keyboard.press('Control+A')
  await page.keyboard.type(EXTREME_PRICE_MODEL)
  const extremePriceOption = dialog.getByRole('option', { name: new RegExp(EXTREME_PRICE_MODEL) })
  await extremePriceOption.waitFor({ state: 'visible' })
  const extremePriceText = (await extremePriceOption.textContent()) ?? ''
  check(
    extremePriceText.includes('$?/M') && !extremePriceText.includes('Infinity'),
    'an overflowed per-million catalog price is labeled unknown instead of Infinity',
  )
  await page.keyboard.press('Enter')

  await combo.click()
  await listbox.waitFor({ state: 'visible' })
  await dialog.getByRole('option', { name: new RegExp(MOCK_MODELS[5].id) }).click()
  check(
    await combo.inputValue() === MOCK_MODELS[5].id
      && await combo.getAttribute('aria-expanded') === 'false'
      && await activeElementIs(combo),
    'mouse selection still picks an option, closes the listbox, and keeps input focus',
  )

  await page.keyboard.press('ArrowDown')
  await listbox.waitFor({ state: 'visible' })
  await page.keyboard.press('Escape')
  await listbox.waitFor({ state: 'detached' })
  check(
    await dialog.isVisible()
      && await combo.getAttribute('aria-expanded') === 'false'
      && await activeElementIs(combo),
    'first Escape closes only the model menu and keeps focus in the dialog input',
  )

  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'detached' })
  check(await dialog.count() === 0, 'second Escape closes the Settings dialog')
  await waitForFocus(page, '.sidebar-settings')
  check(await activeElementIs(trigger), 'Escape close restores the exact Settings trigger')

  await openSettingsByKeyboard(page, trigger, dialog)
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
  await waitForFocus(page, '.sidebar-settings')
  check(await activeElementIs(trigger), 'Cancel close restores the exact Settings trigger')

  await openSettingsByKeyboard(page, trigger, dialog)
  await page.locator('.modal-overlay').click({ position: { x: 4, y: 4 } })
  await dialog.waitFor({ state: 'detached' })
  await waitForFocus(page, '.sidebar-settings')
  check(await activeElementIs(trigger), 'overlay close restores the exact Settings trigger')

  await openSettingsByKeyboard(page, trigger, dialog)
  await dialog.getByRole('button', { name: 'Close settings' }).click()
  await dialog.waitFor({ state: 'detached' })
  await waitForFocus(page, '.sidebar-settings')
  check(await activeElementIs(trigger), 'Close settings restores the exact Settings trigger')

  await openSettingsByKeyboard(page, trigger, dialog)
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
  await waitForFocus(page, '.sidebar-settings')
  check(await activeElementIs(trigger), 'Save close restores the exact Settings trigger')

  check(modelRequests === 1, 'fixture uses exactly one intercepted OpenRouter models request')
  check(
    openRouterModelAuthorization === null,
    'the automatic OpenRouter model-catalog request carries no API-key authorization header',
  )

  await openSettingsByKeyboard(page, trigger, dialog)
  await dialog.getByRole('radio', { name: 'Localhost (Ollama / llama.cpp)' }).check()
  check(
    (await dialog.locator('.settings-hint').first().textContent())?.replace(/\s+/g, ' ').trim()
      === `Ollama: http://localhost:11434/v1 · llama.cpp: http://127.0.0.1:8080/v1. The browser needs CORS allowed. For Ollama, add this app origin instead of *: OLLAMA_ORIGINS=${APP_URL}. Restart Ollama after changing it.`,
    'localhost guidance scopes Ollama CORS to the exact current app origin instead of a wildcard',
  )
  await page.setViewportSize({ width: 390, height: 844 })
  check(
    await dialog.evaluate((modal) => modal.scrollWidth <= modal.clientWidth + 1),
    'origin-scoped Ollama guidance keeps the 390px Settings modal free of horizontal overflow',
  )
  await page.setViewportSize({ width: 1440, height: 1000 })
  await dialog.getByRole('textbox', { name: 'Endpoint' }).fill('http://127.0.0.1:9020/v1')
  const localCombo = dialog.getByRole('combobox', { name: 'Model' })
  await localCombo.focus()
  await dialog.getByRole('option', { name: /local\/model-a/ }).waitFor({ state: 'visible' })
  check(
    localModelRequests === 1
      && await dialog.getByRole('option', { name: /local\/model-a/ }).count() === 1,
    'the first localhost visit discovers the model currently loaded at that endpoint',
  )
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await dialog.waitFor({ state: 'detached' })

  localModel = 'local/model-b'
  await openSettingsByKeyboard(page, trigger, dialog)
  const refreshedLocalCombo = dialog.getByRole('combobox', { name: 'Model' })
  await refreshedLocalCombo.focus()
  const refreshedOption = dialog.getByRole('option', { name: /local\/model-b/ })
  await refreshedOption.waitFor({ state: 'visible' })
  check(
    localModelRequests === 2
      && await refreshedOption.count() === 1
      && await dialog.getByRole('option', { name: /local\/model-a/ }).count() === 0,
    'reopening Settings rechecks the same localhost URL and replaces its stale model list',
  )
  await refreshedOption.click()
  check(
    await refreshedLocalCombo.inputValue() === 'local/model-b'
      && await refreshedLocalCombo.getAttribute('aria-expanded') === 'false',
    'the newly discovered localhost model remains selectable through the existing combobox',
  )

  await refreshedLocalCombo.fill('')
  await page.keyboard.press('Escape')
  await dialog.getByRole('textbox', { name: 'Endpoint' }).fill('http://127.0.0.1:9021/v1')
  await refreshedLocalCombo.focus()
  await dialog.locator('.model-empty[role="status"]').filter({ hasText: 'Loading models' }).waitFor({ state: 'visible' })
  while (replacementEndpointRequests < 1) await page.waitForTimeout(20)
  check(
    replacementEndpointRequests === 1
      && await dialog.getByRole('option', { name: /local\/model-b/ }).count() === 0,
    'switching localhost endpoints hides the prior endpoint model while discovery is pending',
  )
  replacementEndpointResponse.resolve()
  const replacementOption = dialog.getByRole('option', { name: /local\/model-c/ })
  await replacementOption.waitFor({ state: 'visible' })
  check(
    replacementEndpointRequests === 1
      && await replacementOption.count() === 1
      && await dialog.getByRole('option', { name: /local\/model-b/ }).count() === 0,
    'the completed replacement-endpoint discovery exposes only its own model list',
  )
  await replacementOption.click()
  check(
    await refreshedLocalCombo.inputValue() === 'local/model-c'
      && await refreshedLocalCombo.getAttribute('aria-expanded') === 'false',
    'the replacement endpoint model is selectable after the pending state clears',
  )

  await refreshedLocalCombo.fill('')
  await page.keyboard.press('Escape')
  await dialog.getByRole('textbox', { name: 'Endpoint' }).fill('http://127.0.0.1:9022/v1')
  await refreshedLocalCombo.focus()
  await dialog.locator('.model-empty[role="status"]').filter({ hasText: 'Loading models' }).waitFor({ state: 'visible' })
  while (closingEndpointRequests < 1) await page.waitForTimeout(20)
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
  closingEndpointResponse.resolve()
  await page.waitForTimeout(100)
  check(
    await activeElementIs(trigger)
      && (failedClosingRequests === 1 || closingRouteAbortObserved),
    'closing Settings restores its opener and aborts the owned pending model discovery request',
  )

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
  console.error(`settings keyboard browser: ${failures} failure(s), ${checks}/${EXPECTED_CHECKS} checks executed`)
  process.exitCode = 1
} else {
  console.log(`settings keyboard browser: ${checks}/${EXPECTED_CHECKS} checks passed`)
}
