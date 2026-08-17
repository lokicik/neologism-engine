import protocolJson from '../protocol.json'
import { generateBatch, type NameResult } from '../../../web/src/lib/engine'
import {
  METRICS,
  buildPrompt,
  estimateTokens,
  isJudgeReady,
  metricPrompt,
  rerank,
  type JudgeConfig,
  type JudgeProvider,
} from '../../../web/src/lib/judge'

interface FrozenBrief {
  id: string
  seed: number
  brief: string
}

interface Protocol {
  schema: string
  primaryCount: number
  poolPolicy: {
    style: 'big_tech'
    variant: 'auto'
    count: 24
    minLength: 4
    maxLength: 12
    temperature: number
    variety: number
    roots: string[]
    description: null
    deterministicDoubleRun: true
  }
  briefs: FrozenBrief[]
}

interface RankingRecord {
  prompt: string
  promptSha256: string
  orderedNames: string[]
}

interface SourceCase {
  briefId: string
  brief: string
  seed: number
  criterion: string
  pool: string[]
  generic: RankingRecord
  contextual: RankingRecord
}

interface FrozenIdentity {
  provider: JudgeProvider
  modelId: string
  endpoint: string
  apiKey: string
  generatorCommit: string
  selectorCommit: string
  artifactSha256?: string
}

interface PreparedCase {
  frozen: FrozenBrief
  pool: NameResult[]
  genericTemplate: string
  contextualTemplate: string
  genericPrompt: string
  contextualPrompt: string
}

const protocol = protocolJson as Protocol
const criterion = METRICS.find((metric) => metric.key === 'brandable')!.criterion
const COMMIT = /^[0-9a-f]{7,40}$/
const SHA256 = /^[0-9a-f]{64}$/
const NAME = /^[A-Za-z]{4,12}$/
const POOL_SIZE = 24

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id)
  if (!found) throw new Error(`Missing collector element #${id}`)
  return found as T
}

const providerInput = element<HTMLSelectElement>('provider')
const modelInput = element<HTMLInputElement>('model-id')
const endpointInput = element<HTMLInputElement>('endpoint')
const apiKeyInput = element<HTMLInputElement>('api-key')
const generatorCommitInput = element<HTMLInputElement>('generator-commit')
const selectorCommitInput = element<HTMLInputElement>('selector-commit')
const artifactShaInput = element<HTMLInputElement>('artifact-sha')
const prepareButton = element<HTMLButtonElement>('prepare-case')
const runButton = element<HTMLButtonElement>('run-case')
const cancelButton = element<HTMLButtonElement>('cancel-case')
const resetButton = element<HTMLButtonElement>('reset-session')
const downloadButton = element<HTMLButtonElement>('download-source')
const poolList = element<HTMLOListElement>('pool')
const status = element<HTMLParagraphElement>('case-status')
const errorBox = element<HTMLParagraphElement>('error')
const estimate = element<HTMLParagraphElement>('estimate')

let records: SourceCase[] = []
let prepared: PreparedCase | null = null
let identity: FrozenIdentity | null = null
let requestController: AbortController | null = null
let busy = false
let terminalSourceFailure = false

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => (
      `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`
    )).join(',')}}`
  }
  return JSON.stringify(value)
}

async function sha256Text(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function showError(message: string): void {
  errorBox.textContent = message
  errorBox.hidden = false
}

function clearError(): void {
  errorBox.textContent = ''
  errorBox.hidden = true
}

function providerChanged(): void {
  const openRouter = providerInput.value === 'openrouter'
  element<HTMLElement>('api-key-field').hidden = !openRouter
  element<HTMLElement>('endpoint-field').hidden = openRouter
}

function currentFrozenBrief(): FrozenBrief | undefined {
  return protocol.briefs[records.length]
}

function validateIdentity(): FrozenIdentity {
  const provider = providerInput.value as JudgeProvider
  const modelId = modelInput.value.trim()
  const endpoint = endpointInput.value.trim()
  const apiKey = apiKeyInput.value
  const generatorCommit = generatorCommitInput.value.trim()
  const selectorCommit = selectorCommitInput.value.trim()
  const artifactSha256 = artifactShaInput.value.trim()
  if (provider !== 'localhost' && provider !== 'openrouter') throw new Error('Choose a supported provider.')
  if (!modelId || /[\u0000-\u001f\u007f]/.test(modelId)) throw new Error('Enter one exact model ID.')
  if (!COMMIT.test(generatorCommit) || !COMMIT.test(selectorCommit)) {
    throw new Error('Generator and selector commits must be 7–40 lowercase hex characters.')
  }
  if (artifactSha256 && !SHA256.test(artifactSha256)) {
    throw new Error('Model artifact SHA-256 must be 64 lowercase hex characters.')
  }
  const config: JudgeConfig = {
    enabled: true,
    provider,
    model: modelId,
    endpoint,
    apiKey,
  }
  if (!isJudgeReady(config)) {
    throw new Error(provider === 'openrouter'
      ? 'Enter a valid in-memory OpenRouter API key.'
      : 'Enter a valid http(s) local OpenAI-compatible endpoint.')
  }
  return {
    provider,
    modelId,
    endpoint,
    apiKey,
    generatorCommit,
    selectorCommit,
    ...(artifactSha256 ? { artifactSha256 } : {}),
  }
}

function sameIdentity(left: FrozenIdentity, right: FrozenIdentity): boolean {
  return stableJson(left) === stableJson(right)
}

function lockInputs(locked: boolean): void {
  for (const input of [
    providerInput,
    modelInput,
    endpointInput,
    apiKeyInput,
    generatorCommitInput,
    selectorCommitInput,
    artifactShaInput,
  ]) input.disabled = locked
}

function renderPool(names: string[]): void {
  poolList.replaceChildren(...names.map((name) => {
    const item = document.createElement('li')
    item.textContent = name
    return item
  }))
}

function render(): void {
  const frozen = currentFrozenBrief()
  element<HTMLElement>('progress').textContent = `${records.length} / ${protocol.primaryCount} recorded`
  element<HTMLElement>('case-id').textContent = frozen
    ? `${frozen.id} · seed ${frozen.seed}`
    : 'Complete'
  element<HTMLElement>('brief').textContent = frozen?.brief ?? 'All frozen cases are recorded.'
  prepareButton.disabled = busy || prepared !== null || !frozen
  runButton.disabled = busy || prepared === null || terminalSourceFailure
  cancelButton.hidden = !busy
  resetButton.disabled = busy
  downloadButton.disabled = busy || records.length !== protocol.primaryCount
  if (!prepared) {
    renderPool([])
    estimate.hidden = true
    estimate.textContent = ''
  }
}

function poolNames(pool: NameResult[]): string[] {
  const names = pool.map((result) => result.name)
  if (names.length !== POOL_SIZE || names.some((name) => !NAME.test(name))) {
    throw new Error('The frozen generator did not produce 24 valid 4–12 letter names.')
  }
  if (new Set(names.map((name) => name.toLowerCase())).size !== POOL_SIZE) {
    throw new Error('The frozen generator produced a duplicate name; case not prepared.')
  }
  return names
}

function judgeConfig(frozen: FrozenIdentity, prompt: string): JudgeConfig {
  return {
    enabled: true,
    provider: frozen.provider,
    model: frozen.modelId,
    endpoint: frozen.endpoint,
    apiKey: frozen.apiKey,
    prompt,
  }
}

async function prepareCase(): Promise<void> {
  if (busy || prepared || !currentFrozenBrief()) return
  clearError()
  try {
    const nextIdentity = validateIdentity()
    if (identity && !sameIdentity(identity, nextIdentity)) {
      throw new Error('Source identity changed. Reset the session before using a different model or commit.')
    }
    const frozen = currentFrozenBrief()!
    terminalSourceFailure = false
    busy = true
    status.textContent = `Generating ${frozen.id} twice locally to verify its frozen seed…`
    render()
    const config = {
      style: protocol.poolPolicy.style,
      count: protocol.poolPolicy.count,
      min_len: protocol.poolPolicy.minLength,
      max_len: protocol.poolPolicy.maxLength,
      temperature: protocol.poolPolicy.temperature,
      variety: protocol.poolPolicy.variety,
      roots: protocol.poolPolicy.roots,
      variant: protocol.poolPolicy.variant,
      seed: frozen.seed,
    }
    const first = await generateBatch(config)
    const second = await generateBatch(config)
    const names = poolNames(first)
    if (stableJson(names) !== stableJson(poolNames(second))) {
      throw new Error('The same brief and seed did not reproduce the same ordered pool.')
    }
    identity = identity ?? nextIdentity
    lockInputs(true)
    const genericTemplate = metricPrompt(criterion)
    const contextualTemplate = metricPrompt(criterion, frozen.brief)
    const genericPrompt = buildPrompt(genericTemplate, names)
    const contextualPrompt = buildPrompt(contextualTemplate, names)
    prepared = {
      frozen,
      pool: first,
      genericTemplate,
      contextualTemplate,
      genericPrompt,
      contextualPrompt,
    }
    const genericTokens = estimateTokens(first, judgeConfig(identity, genericTemplate))
    const contextualTokens = estimateTokens(first, judgeConfig(identity, contextualTemplate))
    estimate.textContent = `Next action may send two ranking requests (≈ ${genericTokens.total + contextualTokens.total} combined tokens). Provider pricing and retention terms apply.`
    estimate.hidden = false
    renderPool(names)
    status.textContent = `${frozen.id} is locally reproducible. Review the pool, then explicitly run its two rankings.`
  } catch (error) {
    prepared = null
    showError(error instanceof Error ? error.message : String(error))
    status.textContent = 'No provider request was sent.'
  } finally {
    busy = false
    render()
  }
}

async function rankingRecord(
  pool: NameResult[],
  template: string,
  prompt: string,
  frozenIdentity: FrozenIdentity,
  signal: AbortSignal,
): Promise<RankingRecord> {
  const result = await rerank(pool, judgeConfig(frozenIdentity, template), signal)
  if (!result || result.length !== pool.length) throw new Error('Provider ranking failed validation.')
  const orderedNames = result.map((row) => row.name)
  const expected = new Set(pool.map((row) => row.name.toLowerCase()))
  if (new Set(orderedNames.map((name) => name.toLowerCase())).size !== expected.size
    || orderedNames.some((name) => !expected.has(name.toLowerCase()))) {
    throw new Error('Provider ranking is not an exact permutation of the local pool.')
  }
  return { prompt, promptSha256: await sha256Text(prompt), orderedNames }
}

async function runCase(): Promise<void> {
  if (busy || !prepared || !identity) return
  clearError()
  busy = true
  requestController = new AbortController()
  const active = prepared
  const frozenIdentity = identity
  status.textContent = `Sending ${active.frozen.id} generic ranking (request 1 of 2)…`
  render()
  try {
    const generic = await rankingRecord(
      active.pool,
      active.genericTemplate,
      active.genericPrompt,
      frozenIdentity,
      requestController.signal,
    )
    if (requestController.signal.aborted) throw new DOMException('Cancelled', 'AbortError')
    status.textContent = `Sending ${active.frozen.id} brief-aware ranking (request 2 of 2)…`
    const contextual = await rankingRecord(
      active.pool,
      active.contextualTemplate,
      active.contextualPrompt,
      frozenIdentity,
      requestController.signal,
    )
    if (generic.orderedNames.slice(0, 10).join('\n') === contextual.orderedNames.slice(0, 10).join('\n')) {
      terminalSourceFailure = true
      throw new Error('The frozen model produced identical generic and brief-aware top-ten pages. This source has failed the preregistered mechanism gate; do not omit the case or switch models after inspection.')
    }
    records.push({
      briefId: active.frozen.id,
      brief: active.frozen.brief,
      seed: active.frozen.seed,
      criterion,
      pool: poolNames(active.pool),
      generic,
      contextual,
    })
    prepared = null
    status.textContent = `${active.frozen.id} recorded. Prepare the next frozen case.`
  } catch (error) {
    const cancelled = requestController.signal.aborted
    showError(cancelled
      ? 'Ranking request cancelled. Nothing was recorded; the prepared local pool is unchanged.'
      : error instanceof Error ? error.message : String(error))
    status.textContent = terminalSourceFailure
      ? 'Source collection is terminally failed. Reset only to discard this study attempt.'
      : cancelled
      ? 'No partial case was recorded.'
      : 'No partial case was recorded. Retry the same prepared pool when the provider is ready.'
  } finally {
    requestController = null
    busy = false
    render()
  }
}

async function downloadSource(): Promise<void> {
  if (!identity || records.length !== protocol.primaryCount || busy) return
  clearError()
  const source = {
    schema: 'neologism-ranking-source-v1',
    protocolSha256: await sha256Text(stableJson(protocol)),
    poolPolicy: protocol.poolPolicy,
    model: {
      provider: identity.provider,
      id: identity.modelId,
      ...(identity.artifactSha256 ? { artifactSha256: identity.artifactSha256 } : {}),
    },
    generatorCommit: identity.generatorCommit,
    selectorCommit: identity.selectorCommit,
    cases: records,
  }
  const serialized = `${JSON.stringify(source, null, 2)}\n`
  if (serialized.includes(identity.apiKey) && identity.apiKey !== '') {
    showError('Credential exclusion failed; refusing to export.')
    return
  }
  const url = URL.createObjectURL(new Blob([serialized], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'ranking-source.json'
  anchor.click()
  URL.revokeObjectURL(url)
  status.textContent = 'Complete source downloaded. Validate it with study-tools.mjs before preparing the blind package.'
}

function resetSession(): void {
  if (busy) return
  if ((records.length > 0 || prepared) && !window.confirm('Discard every in-memory case and prepared pool?')) return
  records = []
  prepared = null
  identity = null
  requestController = null
  terminalSourceFailure = false
  apiKeyInput.value = ''
  lockInputs(false)
  providerChanged()
  clearError()
  status.textContent = 'Configure the frozen source identity, then prepare the first case.'
  render()
}

providerInput.addEventListener('change', providerChanged)
prepareButton.addEventListener('click', () => void prepareCase())
runButton.addEventListener('click', () => void runCase())
cancelButton.addEventListener('click', () => requestController?.abort())
resetButton.addEventListener('click', resetSession)
downloadButton.addEventListener('click', () => void downloadSource())
window.addEventListener('beforeunload', (event) => {
  if (records.length === 0 && !prepared) return
  event.preventDefault()
})

element<HTMLElement>('criterion').textContent = criterion
providerChanged()
render()
