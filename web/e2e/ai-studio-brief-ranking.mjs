// Phase 270 browser contract: AI Studio ranks a locally generated pool against
// the brief that created that pool. Draft edits cannot silently redefine an
// existing pool, and Retry reuses the failed pool/brief/request content.
// Run after `npm run build`: node e2e/ai-studio-brief-ranking.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = 4229
const APP_URL = `http://localhost:${PORT}`
const E2E_DIR = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = join(E2E_DIR, '..')
const viteCli = join(WEB_DIR, 'node_modules', 'vite', 'bin', 'vite.js')
const EXPECTED_CHECKS = 15

const server = spawn(process.execPath, [viteCli, 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: WEB_DIR,
  stdio: 'pipe',
})

await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('vite preview did not start')), 20_000)
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
const calls = []
const unexpectedExternal = []
const pageErrors = []

function check(ok, label) {
  checks++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) failures++
}

function requestSnapshot(request) {
  const body = JSON.parse(request.postData() ?? '{}')
  const content = body.messages?.[0]?.content ?? ''
  return {
    body,
    content,
    names: [...content.matchAll(/^\s*\d+\.\s+(.+)$/gm)].map((match) => match[1].trim()),
  }
}

function rankedReply(names, prefix) {
  const rows = names.map((_, index) => ({
    i: index + 1,
    score: 1 + (index * 9) / Math.max(names.length - 1, 1),
    reason: `${prefix}-${index + 1}`,
  }))
  return JSON.stringify({ choices: [{ message: { content: JSON.stringify(rows) } }] })
}

const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
await context.addInitScript(() => {
  localStorage.setItem('neologism:visited', '1')
  localStorage.setItem('neologism:judge', JSON.stringify({
    enabled: true,
    provider: 'openrouter',
    apiKey: 'brief-fixture-key',
    model: 'brief-fixture-model',
  }))
})
await context.route('https://**/*', async (route) => {
  if (!route.request().url().endsWith('/chat/completions')) {
    unexpectedExternal.push(route.request().url())
    await route.abort('blockedbyclient')
    return
  }
  const snapshot = requestSnapshot(route.request())
  calls.push(snapshot)
  if (calls.length === 3) {
    await route.fulfill({ status: 503, body: 'frozen ranking failure' })
    return
  }
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: rankedReply(snapshot.names, `brief-${calls.length}`),
  })
})

const page = await context.newPage()
page.on('pageerror', (error) => pageErrors.push(error.message))

try {
  await page.goto(APP_URL)
  await page.getByRole('button', { name: /^AI Studio$/ }).click()
  const briefInput = page.getByRole('textbox', { name: 'AI Studio project brief' })
  const generate = page.getByRole('button', { name: 'Generate', exact: true })
  const briefA = 'a calm queue monitor for support teams'
  const briefB = 'a playful deployment dashboard for developers'

  const privacy = (await page.locator('.studio-privacy').textContent())?.replace(/\s+/g, ' ').trim() ?? ''
  check(
    privacy.includes('displayed names')
      && privacy.includes('selected criterion')
      && privacy.includes("batch's project brief")
      && privacy.includes('configured model provider'),
    'Studio discloses the complete on-demand ranking payload at the action surface',
  )
  check(await briefInput.getAttribute('maxlength') === '240', 'the provider-bound project brief has an explicit 240-unit UI bound')

  await briefInput.fill(briefA)
  await generate.click()
  await page.waitForFunction(() => document.querySelectorAll('.ai-studio .name-card').length === 24)
  await page.waitForFunction(() => document.querySelector('.studio-ranking-status')?.textContent?.includes('Brandable'))
  check(calls.length === 1, 'the first local pool starts exactly one optional ranking request')
  check(
    calls[0].names.length === 24
      && new Set(calls[0].names.map((name) => name.toLowerCase())).size === 24,
    'the ranking request contains exactly the 24 distinct displayed names',
  )
  check(
    calls[0].content.includes(JSON.stringify(briefA))
      && calls[0].content.includes('Judge both the criterion and how well each name fits that project.')
      && calls[0].content.includes('sounds like a real, distinctive brand'),
    'the initial request binds the frozen project brief to the selected Brandable criterion',
  )

  await briefInput.fill(briefB)
  await page.getByRole('button', { name: 'Premium', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.studio-ranking-status')?.textContent?.includes('Premium'))
  check(calls.length === 2, 'switching metric reranks the same pool exactly once')
  check(
    calls[1].content.includes(JSON.stringify(briefA))
      && !calls[1].content.includes(JSON.stringify(briefB))
      && calls[1].names.join('|') === calls[0].names.join('|'),
    'editing the draft cannot redefine the brief or candidates owned by the displayed pool',
  )

  await page.getByRole('button', { name: 'Playful', exact: true }).click()
  const alert = page.locator('.studio-alert')
  await alert.waitFor({ state: 'visible' })
  check(
    calls.length === 3
      && (await alert.textContent())?.includes('Playful ranking is unavailable. Still showing the Premium ranking.'),
    'a contextual ranking failure preserves the last verified view and exposes Retry',
  )
  await alert.getByRole('button', { name: 'Retry ranking' }).click()
  await page.waitForFunction(() => document.querySelector('.studio-ranking-status')?.textContent?.includes('Playful'))
  check(calls.length === 4, 'Retry starts exactly one fresh provider request')
  check(
    calls[3].content === calls[2].content
      && calls[3].names.join('|') === calls[2].names.join('|')
      && calls[3].content.includes(JSON.stringify(briefA)),
    'Retry preserves the failed criterion, candidate order, and pool-owned brief byte for byte',
  )

  await generate.click()
  await page.waitForFunction(() => document.querySelector('.studio-ranking-status')?.textContent?.includes('Playful'))
  check(calls.length === 5, 'generating from the edited draft creates one new contextual ranking request')
  check(
    calls[4].content.includes(JSON.stringify(briefB))
      && !calls[4].content.includes(JSON.stringify(briefA)),
    'a newly generated pool owns the new brief instead of inheriting the previous context',
  )

  await briefInput.fill('')
  await generate.click()
  await page.waitForFunction(() => document.querySelector('.studio-ranking-status')?.textContent?.includes('Playful'))
  check(
    calls.length === 6
      && !calls[5].content.includes('The names are for this project brief')
      && !calls[5].content.includes('Judge both the criterion'),
    'a blank brief keeps the generic metric-only ranking path',
  )
  check(unexpectedExternal.length === 0, `the fixture observes zero unexpected external requests (${unexpectedExternal.join(' | ')})`)
  check(pageErrors.length === 0, `the complete contextual flow produces zero page errors (${pageErrors.join(' | ')})`)
} finally {
  await context.close()
  await browser.close()
  server.kill()
}

if (checks !== EXPECTED_CHECKS) {
  console.error(`expected ${EXPECTED_CHECKS} checks, ran ${checks}`)
  process.exit(1)
}
if (failures) process.exit(1)
console.log(`\nAI Studio brief-ranking check: ${checks}/${EXPECTED_CHECKS} passed`)
