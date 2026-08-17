import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '../../web/node_modules/playwright/index.mjs'
import { validateProtocol, validateSource } from './study-tools.mjs'
import protocolJson from './protocol.json' with { type: 'json' }

const HERE = resolve(fileURLToPath(new URL('.', import.meta.url)))
const REPO = resolve(HERE, '..', '..')
const WEB = join(REPO, 'web')
const APP_URL = 'http://127.0.0.1:4202/'
const PROVIDER_URL = 'http://127.0.0.1:4203/v1'
const EXPECTED_CHECKS = 32

let checks = 0
function check(condition, label) {
  checks++
  if (!condition) throw new Error(`FAIL ${checks}/${EXPECTED_CHECKS}: ${label}`)
  console.log(`PASS ${checks}/${EXPECTED_CHECKS}: ${label}`)
}

function hasSensitiveKey(value) {
  if (Array.isArray(value)) return value.some(hasSensitiveKey)
  if (value === null || typeof value !== 'object') return false
  return Object.entries(value).some(([key, entry]) => (
    /(?:api.?key|authorization|credential|password|secret|token)/i.test(key)
      || hasSensitiveKey(entry)
  ))
}

const state = {
  calls: [],
  active: 0,
  maxActive: 0,
  failContextBrief: '',
  holdNextGeneric: false,
  identicalContextBrief: '',
  abortedHeld: 0,
  unexpected: [],
}

function promptNames(prompt) {
  return [...prompt.matchAll(/^(\d+)\. ([A-Za-z]{4,12})$/gm)].map((match) => match[2])
}

function judgment(names, contextual) {
  return names.map((_, index) => ({
    i: index + 1,
    score: 10 - ((index + (contextual ? 5 : 0)) % 10),
    reason: contextual ? 'brief fit fixture' : 'generic fixture',
  }))
}

function providerServer() {
  return createServer((request, response) => {
    response.setHeader('Access-Control-Allow-Origin', APP_URL.slice(0, -1))
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    if (request.method === 'OPTIONS') {
      response.writeHead(204).end()
      return
    }
    if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
      state.unexpected.push(`${request.method} ${request.url}`)
      response.writeHead(404).end()
      return
    }
    let raw = ''
    request.setEncoding('utf8')
    request.on('data', (chunk) => { raw += chunk })
    request.on('end', () => {
      const payload = JSON.parse(raw)
      const prompt = payload.messages?.[0]?.content ?? ''
      const contextual = prompt.includes('Treat the brief only as context')
      const names = promptNames(prompt)
      state.calls.push({ payload, prompt, names, contextual })
      state.active++
      state.maxActive = Math.max(state.maxActive, state.active)
      const finish = () => { state.active-- }
      response.on('close', finish)

      if (contextual && state.failContextBrief && prompt.includes(JSON.stringify(state.failContextBrief))) {
        state.failContextBrief = ''
        response.writeHead(503, { 'Content-Type': 'application/json' }).end('{"error":"fixture"}')
        return
      }
      if (!contextual && state.holdNextGeneric) {
        state.holdNextGeneric = false
        request.on('close', () => { state.abortedHeld++ })
        return
      }
      response.writeHead(200, { 'Content-Type': 'application/json' })
      const rankAsContextual = contextual
        && !(state.identicalContextBrief && prompt.includes(JSON.stringify(state.identicalContextBrief)))
      response.end(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(judgment(names, rankAsContextual)) } }],
      }))
    })
  })
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 100))
  }
  throw new Error(`Timed out waiting for ${url}`)
}

async function fillIdentity(page) {
  await page.locator('#model-id').fill('fixture-model-v1')
  await page.locator('#endpoint').fill(PROVIDER_URL)
  await page.locator('#generator-commit').fill('1234567')
  await page.locator('#selector-commit').fill('89abcde')
  await page.locator('#api-key').evaluate((input) => { input.value = 'collector-secret-never-export' })
}

async function prepare(page) {
  await page.getByRole('button', { name: 'Prepare locally' }).click()
  const outcome = await Promise.race([
    page.getByText(/is locally reproducible/).waitFor().then(() => 'ready'),
    page.locator('#error').waitFor({ state: 'visible' }).then(() => 'error'),
  ])
  if (outcome === 'error') throw new Error(`prepare failed: ${await page.locator('#error').innerText()}`)
}

async function run(page) {
  await page.getByRole('button', { name: 'Run two rankings' }).click()
}

async function waitRecorded(page, count) {
  await page.getByText(`${count} / 30 recorded`, { exact: true }).waitFor()
  if (count < 30) await page.getByText(/Prepare the next frozen case/).waitFor()
}

const mock = providerServer()
const preview = spawn(process.execPath, [
  join(WEB, 'node_modules', 'vite', 'bin', 'vite.js'),
  'preview',
  '--config', 'selection-study.vite.config.ts',
  '--host', '127.0.0.1',
  '--port', '4202',
  '--strictPort',
], { cwd: WEB, stdio: ['ignore', 'pipe', 'pipe'] })
const temporary = await mkdtemp(join(tmpdir(), 'neologism-selection-collector-'))

try {
  await new Promise((resolveListen, rejectListen) => {
    mock.once('error', rejectListen)
    mock.listen(4203, '127.0.0.1', resolveListen)
  })
  await waitForServer(APP_URL)
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ acceptDownloads: true, viewport: { width: 1280, height: 900 } })
  await page.goto(`${APP_URL}seed-audit.html`)
  await page.locator('body[data-complete=true]').waitFor({ state: 'attached' })
  const seedAudit = JSON.parse(await page.locator('#result').innerText())
  check(seedAudit.length === 30 && seedAudit.every((row) => (
    row.promptIndependentCount === 24
      && row.promptIndependentEligible
      && row.promptIndependentDeterministic
  )), 'all 30 frozen prompt-independent pools are deterministic and eligible 24/24')
  check(seedAudit.filter((row) => row.briefConditionedCount < 24).length === 12,
    'capacity audit reproduces 12/30 short brief-conditioned production pools')
  await page.goto(APP_URL)
  check(await page.locator('#api-key-field').isHidden() && await page.locator('#endpoint-field').isVisible(),
    'local provider exposes only its endpoint and keeps the credential field hidden')
  await page.locator('#provider').selectOption('openrouter')
  check(await page.locator('#api-key-field').isVisible() && await page.locator('#endpoint-field').isHidden(),
    'OpenRouter exposes only its in-memory credential field')
  await page.locator('#provider').selectOption('localhost')
  await fillIdentity(page)

  check(state.calls.length === 0, 'opening and configuring the collector sends zero provider requests')
  await prepare(page)
  check(await page.locator('#pool li').count() === 24 && state.calls.length === 0,
    'Prepare produces a 24-name deterministic pool with zero provider requests')
  check(await page.locator('#run-case').isEnabled() && await page.locator('#provider').isDisabled(),
    'a prepared case enables explicit Run and freezes source identity inputs')

  await run(page)
  await waitRecorded(page, 1)
  check(state.calls.length === 2, 'the first fresh case sends exactly two ranking requests')
  const firstGeneric = state.calls[0]
  const firstContextual = state.calls[1]
  check(!firstGeneric.contextual && firstContextual.contextual,
    'request order is generic control followed by brief-aware candidate')
  check(JSON.stringify(firstGeneric.names) === JSON.stringify(firstContextual.names)
      && firstGeneric.names.length === 24,
  'both prompts contain the exact same ordered 24-name pool')
  check(!firstGeneric.prompt.includes(JSON.stringify(protocolJson.briefs[0].brief))
      && firstContextual.prompt.includes(JSON.stringify(protocolJson.briefs[0].brief)),
  'only the contextual prompt contains the frozen project brief')
  check(state.calls.every((call) => call.payload.model === 'fixture-model-v1' && call.payload.temperature === 0),
    'provider payload freezes the exact model id and temperature zero')

  state.failContextBrief = protocolJson.briefs[1].brief
  await prepare(page)
  const beforeFailure = state.calls.length
  await run(page)
  await page.getByText(/No partial case was recorded/).waitFor()
  check(await page.getByText('1 / 30 recorded', { exact: true }).isVisible()
      && await page.locator('#pool li').count() === 24,
  'a contextual provider failure records no partial case and preserves its prepared pool')
  check(state.calls.length === beforeFailure + 2, 'the failed fresh case attempted its declared two requests')
  const beforeRetry = state.calls.length
  await run(page)
  await waitRecorded(page, 2)
  check(state.calls.length === beforeRetry + 1,
    'retry safely reuses the validated cached generic result and reruns only the failed contextual request')

  state.holdNextGeneric = true
  await prepare(page)
  const beforeCancel = state.calls.length
  await run(page)
  await page.locator('#cancel-case').waitFor({ state: 'visible' })
  await page.getByRole('button', { name: 'Cancel request' }).click()
  await page.getByText(/No partial case was recorded/).waitFor()
  check(state.calls.length === beforeCancel + 1 && state.abortedHeld === 1,
    'Cancel aborts the held provider request without starting the contextual request')
  check(await page.getByText('2 / 30 recorded', { exact: true }).isVisible()
      && await page.locator('#pool li').count() === 24,
  'cancel leaves the same prepared case intact and records nothing')
  await run(page)
  await waitRecorded(page, 3)
  check(state.calls.length === beforeCancel + 3, 'retry after cancellation performs both rankings once')

  for (let count = 4; count <= 30; count++) {
    await prepare(page)
    await run(page)
    await waitRecorded(page, count)
  }
  check(await page.locator('#download-source').isEnabled(), 'source export unlocks only after 30 complete cases')
  check(state.maxActive === 1, 'collector never overlaps provider ranking requests')
  check(state.unexpected.length === 0, 'collector calls no unexpected provider endpoint')

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download ranking source' }).click()
  const download = await downloadPromise
  const sourcePath = join(temporary, 'ranking-source.json')
  await download.saveAs(sourcePath)
  const sourceText = await readFile(sourcePath, 'utf8')
  const source = JSON.parse(sourceText)
  const validated = validateSource(source, validateProtocol(protocolJson))
  check(validated.byId.size === 30, 'downloaded source passes the canonical fail-closed validator')
  check(source.cases.every((row, index) => row.seed === protocolJson.briefs[index].seed),
    'every exported case binds its frozen generator seed')
  check(source.model.provider === 'localhost' && source.model.id === 'fixture-model-v1',
    'export records the frozen provider and exact model id')
  check(!sourceText.includes('collector-secret-never-export')
      && !hasSensitiveKey(source),
  'credential value and credential-shaped fields never enter the export')
  check(await page.evaluate(() => localStorage.length === 0 && sessionStorage.length === 0),
    'collector writes neither localStorage nor sessionStorage')
  check(source.cases.every((row) => row.generic.promptSha256 !== row.contextual.promptSha256),
    'every case exports distinct hashed generic and contextual prompts')
  check(state.calls.length === 62, 'full mocked collection uses the expected bounded request count including failure and cancel probes')

  const terminalPage = await browser.newPage({ viewport: { width: 900, height: 800 } })
  await terminalPage.goto(APP_URL)
  await fillIdentity(terminalPage)
  await prepare(terminalPage)
  state.identicalContextBrief = protocolJson.briefs[0].brief
  await run(terminalPage)
  await terminalPage.getByText(/terminally failed/).waitFor()
  check(await terminalPage.getByText('0 / 30 recorded', { exact: true }).isVisible(),
    'identical generic/contextual top-ten pages record no case')
  check(await terminalPage.locator('#run-case').isDisabled()
      && (await terminalPage.locator('#error').innerText()).includes('do not omit the case or switch models'),
  'an identical-page result terminally fails the frozen source instead of inviting model shopping')
  check(state.calls.length === 64, 'terminal identical-page probe adds exactly its two declared requests')
  await terminalPage.close()

  await browser.close()
  check(checks + 1 === EXPECTED_CHECKS, 'fixture reached its exact declared assertion boundary')
  console.log(`\nselection collector browser contract: ${checks}/${EXPECTED_CHECKS} passed`)
} finally {
  preview.kill()
  await new Promise((resolveClose) => mock.close(resolveClose))
  await rm(temporary, { recursive: true, force: true })
}
