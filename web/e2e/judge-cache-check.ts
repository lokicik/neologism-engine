// Phase 204/205/211/212/213/215/217 pure contract: judge result identity and local model
// discovery stay aligned with the current request configuration.
// Run with: node --experimental-strip-types e2e/judge-cache-check.ts
import type { NameResult } from '../src/lib/engine.ts'
import {
  estimateCost,
  fetchModels,
  isJudgeReady,
  isValidLocalEndpoint,
  rerank,
  type JudgeConfig,
} from '../src/lib/judge.ts'

let checks = 0
let failures = 0
const check = (ok: boolean, label: string): void => {
  checks++
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
}

const names = (prefix: string): NameResult[] => ['Alpha', 'Beta'].map((suffix) => ({
  name: `${prefix}${suffix}`,
  style: 'big_tech',
  sourceMode: 'brandable',
  syllables: 2,
  score_pronounce: 90,
  score_novelty: 90,
  score_memorability: 90,
  connotations: [],
}))

const calls: Array<{ url: string; prompt: string; model: string }> = []
let modelLookups = 0
let autoModel = 'auto-model-a'
let discoveryModel = 'discovery-model-a'
let discoveryLookups = 0
let openRouterLookups = 0
let mixedResolutionLookups = 0
const canonicalEndpointUrls: string[] = []
let modelResolutionAbortObserved = false
let abortedResolutionChatCalls = 0
let settingsDiscoveryAbortObserved = false
let fetchCalls = 0
globalThis.fetch = async (input, init) => {
  fetchCalls++
  const url = String(input)
  if (url.includes(':9050/')) {
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        settingsDiscoveryAbortObserved = true
        reject(new DOMException('fixture aborted', 'AbortError'))
      }, { once: true })
    })
  }
  if (url.includes(':9040/')) {
    if (url.endsWith('/models')) {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          modelResolutionAbortObserved = true
          reject(new DOMException('fixture aborted', 'AbortError'))
        }, { once: true })
      })
    }
    abortedResolutionChatCalls++
  }
  if (url.includes(':9030/')) canonicalEndpointUrls.push(url)
  if (url.endsWith('/models')) {
    if (url.includes(':9070/')) {
      mixedResolutionLookups++
      return new Response(JSON.stringify({ data: [
        { id: 17 },
        { id: 'broken\uD83D' },
        { id: '   ' },
        { id: '  valid-auto-model  ' },
      ] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (url.includes(':9020/')) {
      discoveryLookups++
      return new Response(JSON.stringify({ data: [{ id: discoveryModel }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (url === 'https://openrouter.ai/api/v1/models') {
      openRouterLookups++
      return new Response(JSON.stringify({ data: [
        {
          id: 'explicit-free',
          name: 'Explicit Free',
          context_length: 32_000,
          pricing: { prompt: '0', completion: '0' },
        },
        {
          id: 'explicit-paid',
          name: 'Explicit Paid',
          context_length: 128_000,
          pricing: { prompt: '0.000002', completion: '0.000003' },
        },
        { id: 'suffix-priced:free', pricing: { prompt: '0.1', completion: '0.2' } },
        { id: 'remote-catalog-model' },
        { id: 'malformed-price', pricing: { prompt: 'not-a-price', completion: '0' } },
        { id: 17 },
        { id: 'broken\uD83D' },
      ] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    modelLookups++
    return new Response(JSON.stringify({ data: [{ id: autoModel }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const body = JSON.parse(String(init?.body ?? '{}')) as {
    model?: string
    messages?: Array<{ content?: string }>
  }
  const prompt = body.messages?.[0]?.content ?? ''
  calls.push({ url, prompt, model: body.model ?? '' })

  const secondWins = prompt.includes('Criterion B') || url.includes(':9002/') || body.model === 'auto-model-b'
  const reasonPrefix = body.model?.startsWith('auto-model-')
    ? body.model
    : prompt.includes('Criterion B')
    ? 'criterion-b'
    : url.includes(':9002/') ? 'endpoint-9002' : url.includes(':9001/') ? 'endpoint-9001' : 'criterion-a'
  const judgments: Array<{ i: unknown; score: number; reason: string }> = [
    { i: 1, score: secondWins ? 2 : 9, reason: `${reasonPrefix}-first` },
    { i: 2, score: secondWins ? 9 : 2, reason: `${reasonPrefix}-second` },
  ]
  if (prompt.includes('Invalid score')) judgments[0].score = 11
  if (prompt.includes('Invalid index')) judgments[0].i = '1'
  if (prompt.includes('Missing reason')) judgments[0].reason = ''
  if (prompt.includes('Long reason')) judgments[0].reason = 'one two three four five six seven eight nine'
  if (prompt.includes('Eight word reason')) judgments[0].reason = 'one two three four five six seven eight'
  if (prompt.includes('Oversized reason')) judgments[0].reason = 'x'.repeat(161)
  if (prompt.includes('Boundary reason')) judgments[0].reason = 'x'.repeat(160)
  if (prompt.includes('Malformed reason')) judgments[0].reason = '\uD83D'
  if (prompt.includes('Extra duplicate')) judgments.push({ i: 2, score: 10, reason: 'duplicate override' })
  if (prompt.includes('Extra invalid')) judgments.push({ i: 99, score: 10, reason: 'out of range' })
  return new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify(judgments) } }],
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

const openRouterBase: JudgeConfig = {
  enabled: true,
  provider: 'openrouter',
  apiKey: 'fixture-key',
  model: 'fixture-model',
}
const promptA = 'Criterion A {{names}}'
const promptB = 'Criterion B {{names}}'
check(promptA.length === promptB.length, 'the two cache-separation prompts have identical length')

const promptNames = names('Prompt')
const firstA = await rerank(promptNames, { ...openRouterBase, prompt: promptA })
const secondA = await rerank(promptNames, { ...openRouterBase, prompt: promptA })
check(
  calls.length === 1
    && firstA?.[0]?.name === 'PromptAlpha'
    && JSON.stringify(secondA) === JSON.stringify(firstA),
  'an identical provider, model, prompt, and ordered name list reuses one cached ranking',
)

const resultB = await rerank(promptNames, { ...openRouterBase, prompt: promptB })
check(
  calls.length === 2
    && resultB?.[0]?.name === 'PromptBeta'
    && resultB[0]?.reason === 'criterion-b-second',
  'same-length different prompt content performs a fresh truthful ranking',
)

const endpointNames = names('Endpoint')
const localBase: JudgeConfig = {
  enabled: true,
  provider: 'localhost',
  model: 'fixture-model',
  prompt: promptA,
}
const endpointOne = await rerank(endpointNames, { ...localBase, endpoint: 'http://127.0.0.1:9001/v1' })
const endpointTwo = await rerank(endpointNames, { ...localBase, endpoint: 'http://127.0.0.1:9002/v1' })
check(
  calls.length === 4
    && calls[2]?.url === 'http://127.0.0.1:9001/v1/chat/completions'
    && calls[3]?.url === 'http://127.0.0.1:9002/v1/chat/completions'
    && endpointOne?.[0]?.reason === 'endpoint-9001-first'
    && endpointTwo?.[0]?.reason === 'endpoint-9002-second',
  'different localhost endpoints cannot reuse each other\'s cached ranking',
)

const orderNames = names('Order')
const ordered = await rerank(orderNames, { ...openRouterBase, prompt: promptA })
const reversed = await rerank([...orderNames].reverse(), { ...openRouterBase, prompt: promptA })
check(
  calls.length === 6
    && calls[4]?.prompt.includes('1. OrderAlpha\n2. OrderBeta')
    && calls[5]?.prompt.includes('1. OrderBeta\n2. OrderAlpha')
    && ordered?.[0]?.name === 'OrderAlpha'
    && reversed?.[0]?.name === 'OrderBeta',
  'the ordered candidate list remains part of the cache identity and provider prompt',
)

const autoNames = names('AutoModel')
const autoConfig: JudgeConfig = {
  enabled: true,
  provider: 'localhost',
  endpoint: 'http://127.0.0.1:9010/v1',
  prompt: promptA,
}
const autoA = await rerank(autoNames, autoConfig)
autoModel = 'auto-model-b'
const autoB = await rerank(autoNames, autoConfig)
const autoBAgain = await rerank(autoNames, autoConfig)
check(
  modelLookups === 3
    && calls.length === 8
    && calls[6]?.model === 'auto-model-a'
    && calls[7]?.model === 'auto-model-b'
    && autoA?.[0]?.reason === 'auto-model-a-first'
    && autoB?.[0]?.reason === 'auto-model-b-second'
    && JSON.stringify(autoBAgain) === JSON.stringify(autoB),
  'localhost auto-detection resolves the active model before exact-result cache reuse',
)

const callsBeforeMixedResolution = calls.length
const mixedResolution = await rerank(names('MixedResolution'), {
  enabled: true,
  provider: 'localhost',
  endpoint: 'http://127.0.0.1:9070/v1',
  prompt: promptA,
})
check(
  mixedResolutionLookups === 1
    && calls.length === callsBeforeMixedResolution + 1
    && calls.at(-1)?.model === 'valid-auto-model'
    && mixedResolution?.length === 2,
  'localhost auto-resolution skips malformed leading rows and sends the first valid normalized model id',
)

const discoveryConfig: JudgeConfig = {
  enabled: true,
  provider: 'localhost',
  endpoint: 'http://127.0.0.1:9020/v1',
}
const discoveredA = await fetchModels(discoveryConfig)
discoveryModel = 'discovery-model-b'
const discoveredB = await fetchModels(discoveryConfig)
check(
  discoveryLookups === 2
    && discoveredA[0]?.id === 'discovery-model-a'
    && discoveredB[0]?.id === 'discovery-model-b',
  'localhost model discovery rechecks one stable endpoint instead of serving a stale session list',
)

const remoteConfig: JudgeConfig = {
  enabled: true,
  provider: 'openrouter',
  apiKey: 'fixture-key',
}
const remoteCatalog = await fetchModels(remoteConfig)
const remoteCatalogAgain = await fetchModels(remoteConfig)
check(
  openRouterLookups === 1
    && JSON.stringify(remoteCatalogAgain) === JSON.stringify(remoteCatalog),
  'unchanged OpenRouter model discovery retains the existing session cache',
)
check(
  remoteCatalog.map((model) => model.id).join('|')
    === 'explicit-free|suffix-priced:free|explicit-paid|malformed-price|remote-catalog-model',
  'malformed catalog rows are skipped without hiding independently valid model choices',
)
const remoteById = new Map(remoteCatalog.map((model) => [model.id, model]))
check(
  remoteById.get('explicit-free')?.free === true
    && remoteById.get('explicit-free')?.priceIn === 0
    && remoteById.get('explicit-free')?.priceOut === 0
    && remoteById.get('explicit-paid')?.free === false
    && remoteById.get('suffix-priced:free')?.free === true
    && remoteById.get('suffix-priced:free')?.priceIn === 0
    && remoteById.get('suffix-priced:free')?.priceOut === 0
    && remoteById.get('remote-catalog-model')?.free === false
    && remoteById.get('remote-catalog-model')?.priceIn === -1
    && remoteById.get('remote-catalog-model')?.priceOut === -1
    && remoteById.get('malformed-price')?.free === false
    && remoteById.get('malformed-price')?.priceIn === -1,
  'only a free-suffix model or explicit zero pricing is free while unknown prices stay unknown',
)
check(
  estimateCost({ input: 100, output: 50, total: 150 }, -1, 0) === null
    && estimateCost({ input: 100, output: 50, total: 150 }, 0, 0) === 0
    && estimateCost({ input: 100, output: 50, total: 150 }, 0.001, 0.002) === 0.2,
  'unknown price sentinels never render a negative estimate while zero and paid estimates remain exact',
)

const paddedEndpointConfig: JudgeConfig = {
  enabled: true,
  provider: 'localhost',
  endpoint: '  http://127.0.0.1:9030/v1///  ',
  model: 'fixture-model',
  prompt: promptA,
}
await fetchModels(paddedEndpointConfig)
await rerank(names('CanonicalEndpoint'), paddedEndpointConfig)
check(
  JSON.stringify(canonicalEndpointUrls) === JSON.stringify([
    'http://127.0.0.1:9030/v1/models',
    'http://127.0.0.1:9030/v1/chat/completions',
  ]),
  'localhost discovery and ranking share one trimmed trailing-slash-free request base',
)

const abortController = new AbortController()
const abortedResolution = rerank(names('AbortResolution'), {
  enabled: true,
  provider: 'localhost',
  endpoint: 'http://127.0.0.1:9040/v1',
  prompt: promptA,
}, abortController.signal)
abortController.abort()
check(
  await abortedResolution === null
    && modelResolutionAbortObserved
    && abortedResolutionChatCalls === 0,
  'cancelling a blank-model localhost ranking aborts model resolution before chat starts',
)

const discoveryAbortController = new AbortController()
const abortedDiscovery = fetchModels({
  enabled: true,
  provider: 'localhost',
  endpoint: 'http://127.0.0.1:9050/v1',
}, discoveryAbortController.signal)
discoveryAbortController.abort()
check(
  (await abortedDiscovery).length === 0 && settingsDiscoveryAbortObserved,
  'cancelling Settings model discovery aborts its request and preserves the empty fallback',
)

check(
  [
    undefined,
    'http://localhost:11434/v1',
    'https://192.168.1.20:8080/openai/v1',
    '  http://127.0.0.1:8080/v1///  ',
  ].every(isValidLocalEndpoint)
    && [
      '',
      'javascript:alert(1)',
      'ftp://127.0.0.1:8080/v1',
      'http://user:secret@127.0.0.1:8080/v1',
      'http://127.0.0.1:8080/v1?tenant=a',
      'http://127.0.0.1:8080/v1#models',
      'http://127.0.0.1:8080/v1\uD83D',
    ].every((endpoint) => !isValidLocalEndpoint(endpoint)),
  'local endpoint validation accepts exact HTTP bases and rejects ambiguous or unsafe URL forms',
)

const fetchCallsBeforeInvalid = fetchCalls
const invalidNetworkConfig: JudgeConfig = {
  enabled: true,
  provider: 'localhost',
  endpoint: 'javascript:alert(1)',
  model: 'fixture-model',
}
const invalidDiscovery = await fetchModels(invalidNetworkConfig)
const invalidRanking = await rerank(names('InvalidEndpoint'), invalidNetworkConfig)
check(
  !isJudgeReady(invalidNetworkConfig)
    && invalidDiscovery.length === 0
    && invalidRanking === null
    && fetchCalls === fetchCallsBeforeInvalid,
  'invalid local endpoints stay unready and cannot start discovery or ranking requests',
)

const invalidResponseNames = names('InvalidResponse')
check(
  await rerank(invalidResponseNames, { ...openRouterBase, prompt: 'Invalid score {{names}}' }) === null,
  'a provider score outside the requested 1-10 range rejects the complete ranking',
)
check(
  await rerank(invalidResponseNames, { ...openRouterBase, prompt: 'Invalid index {{names}}' }) === null,
  'an explicitly malformed provider index cannot silently become positional',
)
check(
  await rerank(invalidResponseNames, { ...openRouterBase, prompt: 'Missing reason {{names}}' }) === null,
  'a missing provider reason rejects the complete ranking instead of inventing an explanation',
)
check(
  await rerank(invalidResponseNames, { ...openRouterBase, prompt: 'Long reason {{names}}' }) === null,
  'a provider reason beyond the requested eight-word limit rejects the complete ranking',
)
check(
  await rerank(invalidResponseNames, { ...openRouterBase, prompt: 'Oversized reason {{names}}' }) === null,
  'a single oversized provider reason cannot enter the rendered ranking',
)
check(
  await rerank(invalidResponseNames, { ...openRouterBase, prompt: 'Malformed reason {{names}}' }) === null,
  'an ill-formed Unicode provider reason fails closed before it reaches the UI',
)
check(
  await rerank(invalidResponseNames, { ...openRouterBase, prompt: 'Extra duplicate {{names}}' }) === null,
  'an extra duplicate row cannot overwrite one otherwise complete provider ranking',
)
check(
  await rerank(invalidResponseNames, { ...openRouterBase, prompt: 'Extra invalid {{names}}' }) === null,
  'an extra out-of-range row cannot be ignored beside an otherwise complete provider ranking',
)
check(
  (await rerank(invalidResponseNames, { ...openRouterBase, prompt: 'Eight word reason {{names}}' }))?.[0]?.reason
    === 'one two three four five six seven eight',
  'an exact eight-word provider reason remains valid',
)
check(
  (await rerank(invalidResponseNames, { ...openRouterBase, prompt: 'Boundary reason {{names}}' }))?.[0]?.reason.length
    === 160,
  'an exact 160-unit provider reason remains valid without truncation',
)

const cacheCallsBeforeBound = calls.length
for (let index = 0; index < 128; index++) {
  await rerank(names(`CacheBound${index}`), {
    ...openRouterBase,
    prompt: `Cache bound ${index} {{names}}`,
  })
}
await rerank(names('CacheBound0'), { ...openRouterBase, prompt: 'Cache bound 0 {{names}}' })
await rerank(names('CacheBound128'), { ...openRouterBase, prompt: 'Cache bound 128 {{names}}' })
await rerank(names('CacheBound0'), { ...openRouterBase, prompt: 'Cache bound 0 {{names}}' })
await rerank(names('CacheBound1'), { ...openRouterBase, prompt: 'Cache bound 1 {{names}}' })
check(
  calls.length === cacheCallsBeforeBound + 130,
  'the 128-entry ranking cache refreshes exact-repeat recency and evicts its least-recent request',
)

if (checks !== 28 || failures > 0) {
  console.error(`judge cache check: ${failures} failure(s), ${checks}/28 checks executed`)
  process.exitCode = 1
} else {
  console.log('judge cache check: 28/28 checks passed')
}
