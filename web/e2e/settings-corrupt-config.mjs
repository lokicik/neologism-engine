// Phase 158 browser contract: parseable but invalid AI settings fail closed
// without crashing Settings/Studio or mutating the original local record.
// Run after `npm run build`: node e2e/settings-corrupt-config.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = 4217
const APP_URL = `http://localhost:${PORT}`
const E2E_DIR = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = join(E2E_DIR, '..')
const viteCli = join(WEB_DIR, 'node_modules', 'vite', 'bin', 'vite.js')
const EXPECTED_CHECKS = 63

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

async function contextFor(rawJudge) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await context.addInitScript(({ raw }) => {
    if (sessionStorage.getItem('phase158:seeded') === '1') return
    localStorage.setItem('neologism:visited', '1')
    localStorage.setItem('neologism:judge', raw)
    sessionStorage.setItem('phase158:seeded', '1')
  }, { raw: rawJudge })
  return context
}

try {
  const invalidModelRaw = JSON.stringify({
    enabled: true,
    provider: 'openrouter',
    apiKey: 'must-not-be-used',
    model: 73,
  })
  const modelContext = await contextFor(invalidModelRaw)
  const modelPageErrors = []
  const modelPage = await modelContext.newPage()
  modelPage.on('pageerror', (error) => modelPageErrors.push(error.message))
  await modelPage.goto(APP_URL)
  await modelPage.locator('.sidebar-settings').click()
  const modelDialog = modelPage.locator('.settings-modal[role="dialog"]')
  await modelDialog.waitFor({ state: 'visible' })
  check(await modelDialog.isVisible(), 'invalid model type cannot crash Settings')
  check(
    !(await modelDialog.getByLabel('Enable AI re-rank').isChecked()),
    'invalid model type falls back to the disabled safe config',
  )
  check(
    await modelPage.evaluate(() => localStorage.getItem('neologism:judge')) === invalidModelRaw,
    'invalid model record remains byte-identical until an explicit Save',
  )
  await modelDialog.getByRole('button', { name: 'Save', exact: true }).click()
  await modelDialog.waitFor({ state: 'detached' })
  const repairedModelRaw = await modelPage.evaluate(() => localStorage.getItem('neologism:judge'))
  const repairedModelConfig = JSON.parse(repairedModelRaw)
  check(
    repairedModelConfig.enabled === false
      && repairedModelConfig.provider === 'openrouter'
      && typeof repairedModelConfig.model === 'string',
    'explicit Save replaces the invalid record with a valid safe config',
  )
  await modelPage.reload()
  await modelPage.locator('.sidebar-settings').click()
  check(
    !(await modelPage.locator('.settings-modal').getByLabel('Enable AI re-rank').isChecked()),
    'repaired config remains safe after reload',
  )
  await modelDialog.getByLabel('Enable AI re-rank').click()
  await modelDialog.getByRole('button', { name: 'Save', exact: true }).click()
  const blankKeyDialogOpen = await modelDialog.isVisible()
  const blankKeyDurable = await modelPage.evaluate(() => localStorage.getItem('neologism:judge'))
  if (!(blankKeyDialogOpen && blankKeyDurable === repairedModelRaw)) console.log(
    'INFO  blank key persistence',
    { blankKeyDialogOpen, blankKeyDurable, repairedModelRaw },
  )
  check(
    blankKeyDialogOpen && blankKeyDurable === repairedModelRaw,
    'blank OpenRouter key keeps Settings open and preserves the prior durable config',
  )
  if (blankKeyDialogOpen) {
    const apiKeyInput = modelDialog.getByLabel('API key')
    await modelPage.waitForFunction(() => (
      document.activeElement instanceof HTMLInputElement
        && document.activeElement.getAttribute('aria-invalid') === 'true'
    ))
    const apiKeyErrorId = await apiKeyInput.getAttribute('aria-describedby')
    check(
      await apiKeyInput.getAttribute('aria-invalid') === 'true'
        && apiKeyErrorId !== null
        && await modelDialog.locator(`#${apiKeyErrorId}`).getAttribute('role') === 'alert'
        && (await modelDialog.locator(`#${apiKeyErrorId}`).textContent())?.trim()
          === 'Enter an OpenRouter API key before enabling AI re-rank.'
        && await apiKeyInput.evaluate((input) => (
          document.activeElement === input && input.matches(':focus-visible')
        )),
      'blank OpenRouter key identifies and visibly focuses its exact field',
    )
    await apiKeyInput.fill('fixture-key')
    check(
      await apiKeyInput.getAttribute('aria-invalid') === null
        && await apiKeyInput.getAttribute('aria-describedby') === null
        && await modelDialog.getByRole('alert').count() === 0,
      'typing an API key clears stale validation semantics before retry',
    )
    await modelDialog.getByRole('button', { name: 'Save', exact: true }).click()
    const recoveredKeyConfig = await modelPage.evaluate(() => JSON.parse(
      localStorage.getItem('neologism:judge') ?? '{}',
    ))
    check(
      await modelDialog.count() === 0
        && recoveredKeyConfig.enabled === true
        && recoveredKeyConfig.provider === 'openrouter'
        && recoveredKeyConfig.apiKey === 'fixture-key',
      'a valid API-key retry closes Settings and persists the enabled config',
    )
  } else {
    check(false, 'blank OpenRouter key identifies and visibly focuses its exact field')
    check(false, 'typing an API key clears stale validation semantics before retry')
    check(false, 'a valid API-key retry closes Settings and persists the enabled config')
  }
  check(modelPageErrors.length === 0, `invalid model recovery produces no page error (${modelPageErrors.join(' | ')})`)
  await modelContext.close()

  const priorSafeModelRaw = JSON.stringify({
    enabled: true,
    provider: 'openrouter',
    apiKey: 'fixture-key',
    model: 'fixture-model',
  })
  const unsafeModelWriteContext = await contextFor(priorSafeModelRaw)
  const unsafeModelWriteErrors = []
  const unsafeModelWritePage = await unsafeModelWriteContext.newPage()
  unsafeModelWritePage.on('pageerror', (error) => unsafeModelWriteErrors.push(error.message))
  await unsafeModelWritePage.goto(APP_URL)
  await unsafeModelWritePage.locator('.sidebar-settings').click()
  const unsafeModelWriteDialog = unsafeModelWritePage.locator('.settings-modal[role="dialog"]')
  const unsafeModelInput = unsafeModelWriteDialog.getByRole('combobox', { name: 'Model' })
  await unsafeModelInput.evaluate((input) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(input, 'fixture\u0001model')
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
  })
  await unsafeModelWriteDialog.getByRole('button', { name: 'Save', exact: true }).click()
  const unsafeModelDialogVisible = await unsafeModelWriteDialog.isVisible().catch(() => false)
  check(
    unsafeModelDialogVisible
      && await unsafeModelWritePage.evaluate(() => localStorage.getItem('neologism:judge')) === priorSafeModelRaw,
    'control-character model Save keeps Settings open and preserves the prior durable config',
  )
  if (unsafeModelDialogVisible) {
    await unsafeModelWritePage.waitForFunction(() => {
      const input = document.querySelector('.settings-modal [role="combobox"][aria-invalid="true"]')
      return document.activeElement === input
    })
  }
  const unsafeModelErrorId = unsafeModelDialogVisible
    ? await unsafeModelInput.getAttribute('aria-describedby').catch(() => null)
    : null
  check(
    unsafeModelErrorId !== null
      && await unsafeModelWriteDialog.locator(`#${unsafeModelErrorId}`).getAttribute('role').catch(() => null)
        === 'alert'
      && await unsafeModelWriteDialog.locator(`#${unsafeModelErrorId}`).textContent().catch(() => null)
        === 'Remove invalid Unicode, line breaks, or control characters from the model id.'
      && await unsafeModelInput.evaluate((input) => (
        document.activeElement === input && input.matches(':focus-visible')
      )).catch(() => false),
    'control-character model Save exposes and focuses its exact field-owned validation error',
  )
  check(
    unsafeModelWriteErrors.length === 0,
    `control-character model Save produces no page error (${unsafeModelWriteErrors.join(' | ')})`,
  )
  await unsafeModelWriteContext.close()

  const unsafeStoredModelRaw = JSON.stringify({
    enabled: true,
    provider: 'openrouter',
    apiKey: 'fixture-key',
    model: 'fixture\u0001model',
  })
  const unsafeStoredModelContext = await contextFor(unsafeStoredModelRaw)
  const unsafeStoredModelErrors = []
  const unsafeStoredModelPage = await unsafeStoredModelContext.newPage()
  unsafeStoredModelPage.on('pageerror', (error) => unsafeStoredModelErrors.push(error.message))
  await unsafeStoredModelPage.goto(APP_URL)
  await unsafeStoredModelPage.locator('.sidebar-settings').click()
  const unsafeStoredModelDialog = unsafeStoredModelPage.locator('.settings-modal[role="dialog"]')
  check(
    !(await unsafeStoredModelDialog.getByLabel('Enable AI re-rank').isChecked()),
    'persisted enabled config with a control-character model id fails closed',
  )
  check(
    await unsafeStoredModelPage.evaluate(() => localStorage.getItem('neologism:judge')) === unsafeStoredModelRaw,
    'control-character model record is not silently repaired on read',
  )
  check(
    unsafeStoredModelErrors.length === 0,
    `control-character model record produces no page error (${unsafeStoredModelErrors.join(' | ')})`,
  )
  await unsafeStoredModelContext.close()

  const missingKeyRaw = JSON.stringify({
    enabled: true,
    provider: 'openrouter',
    apiKey: '   ',
    model: 'fixture-model',
  })
  const missingKeyContext = await contextFor(missingKeyRaw)
  const missingKeyPageErrors = []
  const missingKeyPage = await missingKeyContext.newPage()
  missingKeyPage.on('pageerror', (error) => missingKeyPageErrors.push(error.message))
  await missingKeyPage.goto(APP_URL)
  await missingKeyPage.locator('.sidebar-settings').click()
  const missingKeyDialog = missingKeyPage.locator('.settings-modal[role="dialog"]')
  check(
    !(await missingKeyDialog.getByLabel('Enable AI re-rank').isChecked()),
    'persisted enabled OpenRouter config with a whitespace-only key fails closed',
  )
  check(
    await missingKeyPage.evaluate(() => localStorage.getItem('neologism:judge')) === missingKeyRaw,
    'whitespace-key record is not silently repaired on read',
  )
  check(
    missingKeyPageErrors.length === 0,
    `whitespace-key record produces no page error (${missingKeyPageErrors.join(' | ')})`,
  )
  await missingKeyContext.close()

  const priorSafeKeyRaw = JSON.stringify({
    enabled: true,
    provider: 'openrouter',
    apiKey: 'fixture-key',
    model: 'fixture-model',
  })
  const unsafeKeyWriteContext = await contextFor(priorSafeKeyRaw)
  const unsafeKeyWriteErrors = []
  const unsafeKeyWritePage = await unsafeKeyWriteContext.newPage()
  unsafeKeyWritePage.on('pageerror', (error) => unsafeKeyWriteErrors.push(error.message))
  await unsafeKeyWritePage.goto(APP_URL)
  await unsafeKeyWritePage.locator('.sidebar-settings').click()
  const unsafeKeyWriteDialog = unsafeKeyWritePage.locator('.settings-modal[role="dialog"]')
  const unsafeKeyInput = unsafeKeyWriteDialog.getByLabel('API key')
  await unsafeKeyInput.evaluate((input) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(input, 'fixture\u0001key')
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
  })
  await unsafeKeyWriteDialog.getByRole('button', { name: 'Save', exact: true }).click()
  check(
    await unsafeKeyWriteDialog.isVisible().catch(() => false)
      && await unsafeKeyWritePage.evaluate(() => localStorage.getItem('neologism:judge')) === priorSafeKeyRaw,
    'control-character API-key Save keeps Settings open and preserves the prior durable config',
  )
  if (await unsafeKeyWriteDialog.isVisible().catch(() => false)) {
    await unsafeKeyWritePage.waitForFunction(() => {
      const input = document.querySelector('.settings-modal input[type="password"]')
      return document.activeElement === input && input?.getAttribute('aria-invalid') === 'true'
    })
  }
  const unsafeKeyErrorId = await unsafeKeyInput.getAttribute('aria-describedby').catch(() => null)
  check(
    unsafeKeyErrorId !== null
      && await unsafeKeyWriteDialog.locator(`#${unsafeKeyErrorId}`).getAttribute('role').catch(() => null) === 'alert'
      && await unsafeKeyWriteDialog.locator(`#${unsafeKeyErrorId}`).textContent().catch(() => null)
        === 'Remove invalid Unicode, line breaks, or control characters from the OpenRouter API key.'
      && await unsafeKeyInput.evaluate((input) => (
        document.activeElement === input && input.matches(':focus-visible')
      )).catch(() => false),
    'control-character API-key Save exposes and focuses its exact field-owned validation error',
  )
  check(
    unsafeKeyWriteErrors.length === 0,
    `control-character API-key Save produces no page error (${unsafeKeyWriteErrors.join(' | ')})`,
  )
  await unsafeKeyWriteContext.close()

  const unsafeStoredKeyRaw = JSON.stringify({
    enabled: true,
    provider: 'openrouter',
    apiKey: 'fixture\u0001key',
    model: 'fixture-model',
  })
  const unsafeStoredKeyContext = await contextFor(unsafeStoredKeyRaw)
  const unsafeStoredKeyErrors = []
  const unsafeStoredKeyPage = await unsafeStoredKeyContext.newPage()
  unsafeStoredKeyPage.on('pageerror', (error) => unsafeStoredKeyErrors.push(error.message))
  await unsafeStoredKeyPage.goto(APP_URL)
  await unsafeStoredKeyPage.locator('.sidebar-settings').click()
  const unsafeStoredKeyDialog = unsafeStoredKeyPage.locator('.settings-modal[role="dialog"]')
  check(
    !(await unsafeStoredKeyDialog.getByLabel('Enable AI re-rank').isChecked()),
    'persisted enabled OpenRouter config with a control-character key fails closed',
  )
  check(
    await unsafeStoredKeyPage.evaluate(() => localStorage.getItem('neologism:judge')) === unsafeStoredKeyRaw,
    'control-character key record is not silently repaired on read',
  )
  check(
    unsafeStoredKeyErrors.length === 0,
    `control-character key record produces no page error (${unsafeStoredKeyErrors.join(' | ')})`,
  )
  await unsafeStoredKeyContext.close()

  const priorSafeEndpointRaw = JSON.stringify({
    enabled: true,
    provider: 'localhost',
    endpoint: 'http://127.0.0.1:8080/v1',
    model: 'fixture-model',
  })
  const rewrittenEndpointWriteContext = await contextFor(priorSafeEndpointRaw)
  const rewrittenEndpointWriteErrors = []
  const rewrittenEndpointWritePage = await rewrittenEndpointWriteContext.newPage()
  rewrittenEndpointWritePage.on('pageerror', (error) => rewrittenEndpointWriteErrors.push(error.message))
  await rewrittenEndpointWritePage.goto(APP_URL)
  await rewrittenEndpointWritePage.locator('.sidebar-settings').click()
  const rewrittenEndpointWriteDialog = rewrittenEndpointWritePage.locator('.settings-modal[role="dialog"]')
  const rewrittenEndpointInput = rewrittenEndpointWriteDialog.getByLabel('Endpoint')
  await rewrittenEndpointInput.evaluate((input) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(input, 'http:\\\\127.0.0.1:8080\\v1')
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
  })
  await rewrittenEndpointWriteDialog.getByRole('button', { name: 'Save', exact: true }).click()
  const rewrittenEndpointDialogVisible = await rewrittenEndpointWriteDialog.isVisible().catch(() => false)
  check(
    rewrittenEndpointDialogVisible
      && await rewrittenEndpointWritePage.evaluate(() => localStorage.getItem('neologism:judge'))
        === priorSafeEndpointRaw,
    'parser-rewritten endpoint Save keeps Settings open and preserves the prior durable config',
  )
  if (rewrittenEndpointDialogVisible) {
    await rewrittenEndpointWritePage.waitForFunction(() => {
      const input = document.querySelector('.settings-modal input[aria-invalid="true"]')
      return document.activeElement === input && input?.getAttribute('type') === 'text'
    })
  }
  const rewrittenEndpointErrorId = rewrittenEndpointDialogVisible
    ? await rewrittenEndpointInput.getAttribute('aria-describedby').catch(() => null)
    : null
  check(
    rewrittenEndpointErrorId !== null
      && await rewrittenEndpointWriteDialog.locator(`#${rewrittenEndpointErrorId}`).getAttribute('role').catch(() => null)
        === 'alert'
      && await rewrittenEndpointWriteDialog.locator(`#${rewrittenEndpointErrorId}`).textContent().catch(() => null)
        === 'Enter a complete http:// or https:// endpoint without credentials, control characters, backslashes, dot path segments, a query, or a fragment.'
      && await rewrittenEndpointInput.evaluate((input) => (
        document.activeElement === input && input.matches(':focus-visible')
      )).catch(() => false),
    'parser-rewritten endpoint Save exposes and focuses its exact field-owned validation error',
  )
  check(
    rewrittenEndpointWriteErrors.length === 0,
    `parser-rewritten endpoint Save produces no page error (${rewrittenEndpointWriteErrors.join(' | ')})`,
  )
  await rewrittenEndpointWriteContext.close()

  const rewrittenStoredEndpointRaw = JSON.stringify({
    enabled: true,
    provider: 'localhost',
    endpoint: 'http://127.0.0.1:8\t080/v1',
    model: 'fixture-model',
  })
  const rewrittenStoredEndpointContext = await contextFor(rewrittenStoredEndpointRaw)
  const rewrittenStoredEndpointErrors = []
  const rewrittenStoredEndpointPage = await rewrittenStoredEndpointContext.newPage()
  rewrittenStoredEndpointPage.on('pageerror', (error) => rewrittenStoredEndpointErrors.push(error.message))
  await rewrittenStoredEndpointPage.goto(APP_URL)
  await rewrittenStoredEndpointPage.locator('.sidebar-settings').click()
  const rewrittenStoredEndpointDialog = rewrittenStoredEndpointPage.locator('.settings-modal[role="dialog"]')
  check(
    !(await rewrittenStoredEndpointDialog.getByLabel('Enable AI re-rank').isChecked()),
    'persisted enabled localhost config with a parser-rewritten endpoint fails closed',
  )
  check(
    await rewrittenStoredEndpointPage.evaluate(() => localStorage.getItem('neologism:judge'))
      === rewrittenStoredEndpointRaw,
    'parser-rewritten endpoint record is not silently repaired on read',
  )
  check(
    rewrittenStoredEndpointErrors.length === 0,
    `parser-rewritten endpoint record produces no page error (${rewrittenStoredEndpointErrors.join(' | ')})`,
  )
  await rewrittenStoredEndpointContext.close()

  const dotSegmentWriteContext = await contextFor(priorSafeEndpointRaw)
  const dotSegmentWriteErrors = []
  const dotSegmentWritePage = await dotSegmentWriteContext.newPage()
  dotSegmentWritePage.on('pageerror', (error) => dotSegmentWriteErrors.push(error.message))
  await dotSegmentWritePage.goto(APP_URL)
  await dotSegmentWritePage.locator('.sidebar-settings').click()
  const dotSegmentWriteDialog = dotSegmentWritePage.locator('.settings-modal[role="dialog"]')
  const dotSegmentInput = dotSegmentWriteDialog.getByLabel('Endpoint')
  await dotSegmentInput.fill('http://127.0.0.1:8080/v1/../admin')
  await dotSegmentWriteDialog.getByRole('button', { name: 'Save', exact: true }).click()
  const dotSegmentDialogVisible = await dotSegmentWriteDialog.isVisible().catch(() => false)
  check(
    dotSegmentDialogVisible
      && await dotSegmentWritePage.evaluate(() => localStorage.getItem('neologism:judge'))
        === priorSafeEndpointRaw,
    'dot-segment endpoint Save keeps Settings open and preserves the prior durable config',
  )
  const dotSegmentErrorId = dotSegmentDialogVisible
    ? await dotSegmentInput.getAttribute('aria-describedby').catch(() => null)
    : null
  check(
    dotSegmentErrorId !== null
      && await dotSegmentWriteDialog.locator(`#${dotSegmentErrorId}`).getAttribute('role').catch(() => null)
        === 'alert'
      && await dotSegmentWriteDialog.locator(`#${dotSegmentErrorId}`).textContent().catch(() => null)
        === 'Enter a complete http:// or https:// endpoint without credentials, control characters, backslashes, dot path segments, a query, or a fragment.'
      && await dotSegmentInput.evaluate((input) => (
        document.activeElement === input && input.matches(':focus-visible')
      )).catch(() => false),
    'dot-segment endpoint Save exposes and focuses its field-owned validation error',
  )
  check(
    dotSegmentWriteErrors.length === 0,
    `dot-segment endpoint Save produces no page error (${dotSegmentWriteErrors.join(' | ')})`,
  )
  await dotSegmentWriteContext.close()

  const encodedDotEndpointRaw = JSON.stringify({
    enabled: true,
    provider: 'localhost',
    endpoint: 'http://127.0.0.1:8080/v1/%2e%2e/admin',
    model: 'fixture-model',
  })
  const encodedDotContext = await contextFor(encodedDotEndpointRaw)
  const encodedDotErrors = []
  const encodedDotPage = await encodedDotContext.newPage()
  encodedDotPage.on('pageerror', (error) => encodedDotErrors.push(error.message))
  await encodedDotPage.goto(APP_URL)
  await encodedDotPage.locator('.sidebar-settings').click()
  const encodedDotDialog = encodedDotPage.locator('.settings-modal[role="dialog"]')
  check(
    !(await encodedDotDialog.getByLabel('Enable AI re-rank').isChecked()),
    'persisted encoded dot-segment endpoint fails closed',
  )
  check(
    await encodedDotPage.evaluate(() => localStorage.getItem('neologism:judge'))
      === encodedDotEndpointRaw,
    'encoded dot-segment endpoint record is not silently repaired on read',
  )
  check(
    encodedDotErrors.length === 0,
    `encoded dot-segment endpoint produces no page error (${encodedDotErrors.join(' | ')})`,
  )
  await encodedDotContext.close()

  const invalidEndpointRaw = JSON.stringify({
    enabled: true,
    provider: 'localhost',
    endpoint: 11434,
  })
  const endpointContext = await contextFor(invalidEndpointRaw)
  const endpointPageErrors = []
  const endpointPage = await endpointContext.newPage()
  endpointPage.on('pageerror', (error) => endpointPageErrors.push(error.message))
  await endpointPage.goto(APP_URL)
  await endpointPage.getByRole('button', { name: 'AI Studio' }).click()
  check(
    await endpointPage.getByRole('button', { name: 'Open Settings' }).isVisible(),
    'invalid endpoint type cannot crash AI Studio and leaves it unconfigured',
  )
  check(
    await endpointPage.evaluate(() => localStorage.getItem('neologism:judge')) === invalidEndpointRaw,
    'invalid endpoint record is not silently repaired on read',
  )
  check(endpointPageErrors.length === 0, `invalid endpoint type produces no page error (${endpointPageErrors.join(' | ')})`)
  await endpointContext.close()

  const illFormedEndpointRaw = JSON.stringify({
    enabled: true,
    provider: 'localhost',
    endpoint: 'http://127.0.0.1:8080/v1\uD83D',
  })
  const illFormedContext = await contextFor(illFormedEndpointRaw)
  const illFormedPageErrors = []
  const illFormedPage = await illFormedContext.newPage()
  illFormedPage.on('pageerror', (error) => illFormedPageErrors.push(error.message))
  await illFormedPage.goto(APP_URL)
  await illFormedPage.getByRole('button', { name: 'AI Studio' }).click()
  check(
    await illFormedPage.getByRole('button', { name: 'Open Settings' }).isVisible(),
    'ill-formed endpoint Unicode leaves AI Studio safely unconfigured',
  )
  check(
    await illFormedPage.evaluate(() => localStorage.getItem('neologism:judge')) === illFormedEndpointRaw,
    'ill-formed endpoint record is not silently repaired on read',
  )
  check(
    illFormedPageErrors.length === 0,
    `ill-formed endpoint produces no page error (${illFormedPageErrors.join(' | ')})`,
  )
  await illFormedContext.close()

  const unsafeEndpointRaw = JSON.stringify({
    enabled: true,
    provider: 'localhost',
    endpoint: 'javascript:alert(1)',
  })
  const unsafeContext = await contextFor(unsafeEndpointRaw)
  const unsafePageErrors = []
  const unsafePage = await unsafeContext.newPage()
  unsafePage.on('pageerror', (error) => unsafePageErrors.push(error.message))
  await unsafePage.goto(APP_URL)
  await unsafePage.getByRole('button', { name: 'AI Studio' }).click()
  check(
    await unsafePage.getByRole('button', { name: 'Open Settings' }).isVisible(),
    'non-HTTP endpoint leaves AI Studio safely unconfigured',
  )
  check(
    await unsafePage.evaluate(() => localStorage.getItem('neologism:judge')) === unsafeEndpointRaw,
    'non-HTTP endpoint record is not silently repaired on read',
  )
  check(
    unsafePageErrors.length === 0,
    `non-HTTP endpoint produces no page error (${unsafePageErrors.join(' | ')})`,
  )
  await unsafeContext.close()

  const invalidArrayRaw = JSON.stringify(['openrouter', true])
  const arrayContext = await contextFor(invalidArrayRaw)
  const arrayPageErrors = []
  const arrayPage = await arrayContext.newPage()
  arrayPage.on('pageerror', (error) => arrayPageErrors.push(error.message))
  await arrayPage.goto(APP_URL)
  await arrayPage.locator('.sidebar-settings').click()
  const arrayDialog = arrayPage.locator('.settings-modal[role="dialog"]')
  check(
    !(await arrayDialog.getByLabel('Enable AI re-rank').isChecked()),
    'parseable non-object config also falls back safely',
  )
  check(
    await arrayPage.evaluate(() => localStorage.getItem('neologism:judge')) === invalidArrayRaw,
    'parseable non-object record remains byte-identical on read',
  )
  check(arrayPageErrors.length === 0, `parseable non-object config produces no page error (${arrayPageErrors.join(' | ')})`)
  await arrayContext.close()

  const validPartialRaw = JSON.stringify({
    enabled: true,
    provider: 'localhost',
    endpoint: 'http://127.0.0.1:8080/v1',
    prompt: 'legacy unused prompt {{names}}',
    unknownFutureField: 'preserved only in raw storage',
  })
  const validContext = await contextFor(validPartialRaw)
  const validPageErrors = []
  const validPage = await validContext.newPage()
  validPage.on('pageerror', (error) => validPageErrors.push(error.message))
  await validPage.goto(APP_URL)
  await validPage.locator('.sidebar-settings').click()
  const validDialog = validPage.locator('.settings-modal[role="dialog"]')
  check(await validDialog.getByLabel('Enable AI re-rank').isChecked(), 'valid legacy partial config remains enabled')
  check(
    await validDialog.getByLabel('Endpoint').inputValue() === 'http://127.0.0.1:8080/v1',
    'valid legacy endpoint survives normalization',
  )
  check(
    await validDialog.getByLabel(/Judge prompt/).count() === 0
      && await validDialog.getByRole('button', { name: 'Reset to default' }).count() === 0,
    'legacy prompt data does not resurrect the retired Settings control',
  )
  check(
    await validPage.evaluate(() => localStorage.getItem('neologism:judge')) === validPartialRaw,
    'valid partial record and unknown future field remain untouched on read',
  )
  await validDialog.getByLabel('Endpoint').evaluate((input) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(input, 'http://127.0.0.1:8080/v1\uD83D')
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
  })
  await validDialog.getByRole('button', { name: 'Save', exact: true }).click()
  check(await validDialog.isVisible(), 'ill-formed endpoint write keeps Settings open')
  check(
    await validDialog.getByRole('alert').isVisible(),
    'ill-formed endpoint write exposes the existing visible save failure',
  )
  check(
    await validPage.evaluate(() => localStorage.getItem('neologism:judge')) === validPartialRaw,
    'ill-formed endpoint write preserves the prior durable settings exactly',
  )
  await validDialog.getByLabel('Endpoint').evaluate((input) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(input, 'javascript:alert(1)')
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
  })
  await validDialog.getByRole('button', { name: 'Save', exact: true }).click()
  const endpointAlert = validDialog.getByRole('alert')
  check(await validDialog.isVisible(), 'non-HTTP endpoint write keeps Settings open')
  check(
    await endpointAlert.count() === 1
      && (await endpointAlert.textContent())?.trim()
        === 'Enter a complete http:// or https:// endpoint without credentials, control characters, backslashes, dot path segments, a query, or a fragment.',
    'non-HTTP endpoint write exposes an exact validation error',
  )
  check(
    await validPage.evaluate(() => localStorage.getItem('neologism:judge')) === validPartialRaw,
    'non-HTTP endpoint write preserves the prior durable settings exactly',
  )
  const endpointInput = validDialog.getByLabel('Endpoint')
  await validPage.waitForFunction(() => (
    document.activeElement instanceof HTMLInputElement
      && document.activeElement.getAttribute('aria-invalid') === 'true'
  ))
  const endpointErrorId = await endpointInput.getAttribute('aria-describedby')
  const endpointRecovery = {
    invalid: await endpointInput.getAttribute('aria-invalid'),
    endpointErrorId,
    role: endpointErrorId === null
      ? null
      : await validDialog.locator(`#${endpointErrorId}`).getAttribute('role'),
    focus: await endpointInput.evaluate((input) => {
      const rect = input.getBoundingClientRect()
      return {
        active: document.activeElement === input,
        visible: input.matches(':focus-visible'),
        fits: rect.left >= -1
          && rect.right <= innerWidth + 1
          && rect.top >= -1
          && rect.bottom <= innerHeight + 1,
      }
    }),
  }
  if (!(endpointRecovery.invalid === 'true'
    && endpointRecovery.endpointErrorId !== null
    && endpointRecovery.role === 'alert'
    && endpointRecovery.focus.active
    && endpointRecovery.focus.visible
    && endpointRecovery.focus.fits)) console.log('INFO  endpoint recovery', endpointRecovery)
  check(
    endpointRecovery.invalid === 'true'
      && endpointRecovery.endpointErrorId !== null
      && endpointRecovery.role === 'alert'
      && endpointRecovery.focus.active
      && endpointRecovery.focus.visible
      && endpointRecovery.focus.fits,
    'invalid endpoint recovery identifies and visibly focuses its exact field',
  )
  await endpointInput.fill('http://127.0.0.1:9090/v1')
  check(
    await endpointInput.getAttribute('aria-invalid') === null
      && await endpointInput.getAttribute('aria-describedby') === null
      && await validDialog.getByRole('alert').count() === 0,
    'editing the endpoint clears stale validation semantics before retry',
  )
  await validDialog.getByRole('button', { name: 'Save', exact: true }).click()
  const recoveredEndpoint = await validPage.evaluate(() => JSON.parse(
    localStorage.getItem('neologism:judge') ?? '{}',
  ).endpoint)
  check(
    await validDialog.count() === 0 && recoveredEndpoint === 'http://127.0.0.1:9090/v1',
    'a valid focused retry closes Settings and persists the exact replacement endpoint',
  )
  check(validPageErrors.length === 0, `valid partial config produces no page error (${validPageErrors.join(' | ')})`)
  await validContext.close()
} finally {
  await browser.close()
  server.kill()
}

if (checks !== EXPECTED_CHECKS) {
  console.error(`FAIL  expected ${EXPECTED_CHECKS} checks, executed ${checks}`)
  process.exit(1)
}
if (failures > 0) process.exit(1)
console.log(`\ncorrupt settings config: all checks passed (${checks}/${EXPECTED_CHECKS})`)
