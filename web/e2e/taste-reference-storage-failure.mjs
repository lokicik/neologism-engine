// Phase 159 browser contract: reference names become active only after their
// local write succeeds; rejection is visible, focus-safe, and retryable.
// Run after `npm run build`: node e2e/taste-reference-storage-failure.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = 4218
const APP_URL = `http://localhost:${PORT}`
const E2E_DIR = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = join(E2E_DIR, '..')
const SHOTS = join(E2E_DIR, 'shots')
const viteCli = join(WEB_DIR, 'node_modules', 'vite', 'bin', 'vite.js')
const EXPECTED_CHECKS = 18
const OLD_REFERENCES = 'Vercel, Linear🚀'
const NEW_REFERENCES = 'Vercel, Linear🚀, Notion'

mkdirSync(SHOTS, { recursive: true })
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
const external = []
const check = (ok, label) => {
  checks++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) failures++
}

async function dispatchInput(input, value) {
  await input.evaluate((element, next) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(element, next)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  }, value)
}

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await context.addInitScript(({ oldReferences }) => {
    const nativeSetItem = Storage.prototype.setItem
    if (localStorage.getItem('phase159:seeded') !== '1') {
      nativeSetItem.call(localStorage, 'neologism:visited', '1')
      nativeSetItem.call(localStorage, 'neologism:taste-references', oldReferences)
      nativeSetItem.call(localStorage, 'phase159:sentinel', 'unchanged')
      nativeSetItem.call(localStorage, 'phase159:seeded', '1')
    }
    const state = {
      writes: 0,
      remainingFailures: sessionStorage.getItem('phase159:failure-used') === '1' ? 0 : 1,
    }
    window.__phase159Storage = state
    Storage.prototype.setItem = function (key, value) {
      if (this === localStorage && key === 'neologism:taste-references') {
        state.writes++
        if (state.remainingFailures > 0) {
          state.remainingFailures--
          sessionStorage.setItem('phase159:failure-used', '1')
          throw new DOMException('fixture quota rejection', 'QuotaExceededError')
        }
      }
      return nativeSetItem.call(this, key, value)
    }
  }, { oldReferences: OLD_REFERENCES })
  await context.route('https://**/*', async (route) => {
    external.push(route.request().url())
    await route.abort()
  })

  const page = await context.newPage()
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.goto(APP_URL)
  const storageBefore = await page.evaluate(() => JSON.stringify(
    Object.fromEntries(Object.entries(localStorage).filter(([key]) => key !== 'neologism:taste-references')),
  ))
  const advanced = page.getByRole('button', { name: /Advanced filters/ })
  await advanced.click()
  const panel = page.getByRole('group', { name: 'Advanced filters' })
  const input = panel.getByPlaceholder('Vercel, Linear, Notion')
  check(
    await input.inputValue() === OLD_REFERENCES
      && (await panel.locator('.menu-progress').textContent())?.trim() === '2/3',
    'two persisted references start active before editing',
  )

  await input.fill(NEW_REFERENCES)
  const alert = panel.getByRole('alert')
  await alert.waitFor({ state: 'visible' })
  check(
    (await alert.textContent())?.trim() === 'Could not save reference names. Browser storage kept the previous names active.',
    'rejected reference write exposes the exact active-state error',
  )
  check(
    await input.inputValue() === OLD_REFERENCES
      && (await panel.locator('.menu-progress').textContent())?.trim() === '2/3'
      && ((await panel.locator('#taste-reference-help').textContent()) ?? '').includes('Add 1 more name'),
    'failed edit leaves the previous input and profile progress active',
  )
  const failedState = await page.evaluate(() => ({
    value: localStorage.getItem('neologism:taste-references'),
    writes: window.__phase159Storage.writes,
  }))
  check(
    failedState.value === OLD_REFERENCES && failedState.writes === 1,
    `failed edit leaves the prior durable references intact (${JSON.stringify(failedState)})`,
  )
  check(await input.evaluate((element) => document.activeElement === element), 'failed edit preserves input focus')
  check(
    await panel.evaluate((group) => {
      const boundary = group.getBoundingClientRect()
      const error = group.querySelector('[role="alert"]')?.getBoundingClientRect()
      const active = document.activeElement?.getBoundingClientRect()
      const style = document.activeElement instanceof HTMLElement ? getComputedStyle(document.activeElement) : null
      return Boolean(error && active && style)
        && error.left >= boundary.left - 1
        && error.right <= boundary.right + 1
        && active.left - 4 >= boundary.left - 1
        && active.right + 4 <= boundary.right + 1
        && style.outlineStyle !== 'none'
        && Number.parseFloat(style.outlineWidth) >= 2
    }),
    '390px error and focused input ring remain contained in Advanced',
  )
  await panel.screenshot({ path: join(SHOTS, 'taste-reference-storage-failure-390.png') })

  await input.fill(NEW_REFERENCES)
  await alert.waitFor({ state: 'detached' })
  const recoveredState = await page.evaluate(() => ({
    value: localStorage.getItem('neologism:taste-references'),
    writes: window.__phase159Storage.writes,
  }))
  check(
    recoveredState.value === NEW_REFERENCES
      && recoveredState.writes === 2
      && await input.inputValue() === NEW_REFERENCES,
    `successful retry persists and activates the edited references (${JSON.stringify(recoveredState)})`,
  )
  check(
    (await panel.locator('.menu-progress').textContent())?.trim() === '3/3'
      && ((await panel.locator('#taste-reference-help').textContent()) ?? '').includes('Guiding the larger local candidate pool'),
    'successful retry activates the three-reference local-ranking state',
  )
  check(await input.evaluate((element) => document.activeElement === element), 'successful retry keeps input focus')

  await page.reload()
  await page.getByRole('button', { name: /Advanced filters/ }).click()
  check(
    await page.getByRole('group', { name: 'Advanced filters' })
      .getByPlaceholder('Vercel, Linear, Notion').inputValue() === NEW_REFERENCES,
    'reload restores the successfully persisted references',
  )

  const reloadedPanel = page.getByRole('group', { name: 'Advanced filters' })
  const reloadedInput = reloadedPanel.getByPlaceholder('Vercel, Linear, Notion')
  const validBoundary = `${'V'.repeat(238)}🚀`
  await dispatchInput(reloadedInput, validBoundary)
  check(
    validBoundary.length === 240
      && await reloadedInput.inputValue() === validBoundary
      && await page.evaluate(() => localStorage.getItem('neologism:taste-references')) === validBoundary,
    'a valid astral pair ending exactly at the 240-unit boundary persists intact',
  )

  const splitBoundary = `${'V'.repeat(239)}🚀`
  await dispatchInput(reloadedInput, splitBoundary)
  check(
    splitBoundary.length === 241
      && await reloadedInput.inputValue() === validBoundary
      && await page.evaluate(() => localStorage.getItem('neologism:taste-references')) === validBoundary
      && await reloadedPanel.getByRole('alert').count() === 1,
    'an over-limit astral edit is rejected without splitting persistence or active state',
  )

  await dispatchInput(reloadedInput, 'Vercel\uD83D')
  check(
    await reloadedInput.inputValue() === validBoundary
      && await page.evaluate(() => localStorage.getItem('neologism:taste-references')) === validBoundary
      && await reloadedPanel.getByRole('alert').count() === 1,
    'an ill-formed edit is rejected before persistence or active state can change',
  )

  const storageAfter = await page.evaluate(() => JSON.stringify(
    Object.fromEntries(Object.entries(localStorage).filter(([key]) => key !== 'neologism:taste-references')),
  ))
  check(storageAfter === storageBefore, 'reference failure and retry leave every other local key byte-identical')

  const corruptContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await corruptContext.addInitScript(() => {
    if (localStorage.getItem('phase236:seeded') !== '1') {
      localStorage.setItem('neologism:visited', '1')
      localStorage.setItem('neologism:taste-references', 'Vercel\uD83D')
      localStorage.setItem('phase236:seeded', '1')
    }
  })
  await corruptContext.route('https://**/*', async (route) => {
    external.push(route.request().url())
    await route.abort()
  })
  const corruptPage = await corruptContext.newPage()
  corruptPage.on('pageerror', (error) => pageErrors.push(error.message))
  await corruptPage.goto(APP_URL)
  await corruptPage.getByRole('button', { name: /Advanced filters/ }).click()
  const corruptInput = corruptPage.getByRole('group', { name: 'Advanced filters' })
    .getByPlaceholder('Vercel, Linear, Notion')
  check(
    await corruptInput.inputValue() === ''
      && (await corruptPage.locator('.menu-progress').textContent())?.trim() === '0/3'
      && await corruptPage.evaluate(() => localStorage.getItem('neologism:taste-references')) === 'Vercel\uD83D',
    'an ill-formed persisted reference fails closed without rewriting its raw recovery copy',
  )

  const oversizedReferences = 'V'.repeat(241)
  await corruptPage.evaluate((value) => {
    localStorage.setItem('neologism:taste-references', value)
  }, oversizedReferences)
  await corruptPage.reload()
  await corruptPage.getByRole('button', { name: /Advanced filters/ }).click()
  check(
    await corruptPage.getByRole('group', { name: 'Advanced filters' })
      .getByPlaceholder('Vercel, Linear, Notion').inputValue() === ''
      && await corruptPage.evaluate(() => localStorage.getItem('neologism:taste-references')) === oversizedReferences,
    'an oversized persisted reference fails closed at the write limit without destructive truncation',
  )
  await corruptContext.close()

  check(external.length === 0, `reference editing produces zero external HTTPS requests (${external.join(' | ')})`)
  check(pageErrors.length === 0, `reference failure and retry produce no page errors (${pageErrors.join(' | ')})`)
} finally {
  await browser.close()
  server.kill()
}

if (checks !== EXPECTED_CHECKS) {
  console.error(`FAIL  expected ${EXPECTED_CHECKS} checks, executed ${checks}`)
  process.exit(1)
}
if (failures > 0) process.exit(1)
console.log(`\nreference storage failure: all checks passed (${checks}/${EXPECTED_CHECKS})`)
