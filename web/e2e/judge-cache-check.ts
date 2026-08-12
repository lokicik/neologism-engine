// Phase 204/205/211/212/213 pure contract: judge result identity and local model
// discovery stay aligned with the current request configuration.
// Run with: node --experimental-strip-types e2e/judge-cache-check.ts
import type { NameResult } from '../src/lib/engine.ts'
import { fetchModels, rerank, type JudgeConfig } from '../src/lib/judge.ts'

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
const canonicalEndpointUrls: string[] = []
globalThis.fetch = async (input, init) => {
  const url = String(input)
  if (url.includes(':9030/')) canonicalEndpointUrls.push(url)
  if (url.endsWith('/models')) {
    if (url.includes(':9020/')) {
      discoveryLookups++
      return new Response(JSON.stringify({ data: [{ id: discoveryModel }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (url === 'https://openrouter.ai/api/v1/models') {
      openRouterLookups++
      return new Response(JSON.stringify({ data: [{ id: 'remote-catalog-model' }] }), {
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
  const judgments = [
    { i: 1, score: secondWins ? 2 : 9, reason: `${reasonPrefix}-first` },
    { i: 2, score: secondWins ? 9 : 2, reason: `${reasonPrefix}-second` },
  ]
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
    && remoteCatalog[0]?.id === 'remote-catalog-model'
    && JSON.stringify(remoteCatalogAgain) === JSON.stringify(remoteCatalog),
  'unchanged OpenRouter model discovery retains the existing session cache',
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

if (checks !== 9 || failures > 0) {
  console.error(`judge cache check: ${failures} failure(s), ${checks}/9 checks executed`)
  process.exitCode = 1
} else {
  console.log('judge cache check: 9/9 checks passed')
}
