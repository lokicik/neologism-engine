import type { NameResult } from './engine'
import { isWellFormedUnicode } from './unicode.ts'

// Optional "Sharpen with AI" judge. The offline engine generates well but judges
// badly — its scores are structural proxies blind to brand taste/meaning (proven
// in Phase 27, r=0.25). A real LLM judges the semantic quality the proxies miss.
// This is strictly OPT-IN: every failure path (disabled, unreachable, CORS, bad
// key, rate-limited, malformed reply) returns null so the caller silently keeps
// the offline ranking — the graceful-fallback pattern from domain.ts.
//
// OpenRouter and a local server (Ollama/llama.cpp/LM Studio) are both OpenAI-
// compatible, so they share ONE request path; the provider only changes the base
// URL and headers. (Resurrects + generalizes the Phase 28 web/src/lib/llm.ts.)

export type JudgeProvider = 'openrouter' | 'localhost'

export interface JudgeConfig {
  enabled: boolean
  provider: JudgeProvider
  /// OpenRouter only — the user's own key, stored locally (see SettingsModal warning).
  apiKey?: string
  /// Model id. OpenRouter: e.g. a ":free" model. Localhost: auto-detected if blank.
  model?: string
  /// Localhost OpenAI-compatible base, e.g. http://localhost:11434/v1 (Ollama).
  endpoint?: string
  /// Judge prompt template; "{{names}}" is replaced with the numbered candidate list.
  prompt?: string
  /// USD per token for the selected model — captured when picked from the live
  /// list so the UI can show a cost estimate without re-fetching. Undefined for
  /// a hand-typed model id (cost then shows as unknown).
  priceIn?: number
  priceOut?: number
}

export interface RankedJudgment {
  name: string
  score: number
  reason: string
}

export const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'
export const DEFAULT_LOCAL_ENDPOINT = 'http://localhost:11434/v1'
export const DEFAULT_OPENROUTER_MODEL = 'meta-llama/llama-3.3-70b-instruct:free'

export function normalizeLocalEndpoint(endpoint?: string): string {
  return (endpoint ?? DEFAULT_LOCAL_ENDPOINT).trim().replace(/\/+$/, '')
}

export function isValidLocalEndpoint(endpoint?: string): boolean {
  const normalized = normalizeLocalEndpoint(endpoint)
  if (!isWellFormedUnicode(normalized)) return false
  try {
    const url = new URL(normalized)
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && url.username === ''
      && url.password === ''
      && url.search === ''
      && url.hash === ''
  } catch {
    return false
  }
}

// Free ids drift over time — these are editable in the UI; this is just the list
// the model dropdown seeds with.
export const OPENROUTER_FREE_MODELS = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'deepseek/deepseek-r1:free',
  'google/gemini-2.0-flash-exp:free',
]

export const DEFAULT_JUDGE_PROMPT = `You are a branding expert judging invented startup/product names.
Rate each name from 1 (bad: awkward, hard to say, junk-like, or unfortunate connotations) to 10 (excellent: memorable, easy to pronounce, distinctive, sounds like a real brand).
Respond with ONLY a JSON array, one object per name, in the SAME order as the input:
[{"i": 1, "score": 8, "reason": "short reason, max 8 words"}]
No prose before or after the array.

Names:
{{names}}`

// AI Studio metrics (Phase 56) — each is just a ranking criterion fed to the
// same rerank() path via a tailored prompt. Add/edit freely; "Custom" is the
// user's own free-text criterion.
export const METRICS = [
  { key: 'brandable', label: 'Brandable', criterion: 'sounds like a real, distinctive brand — memorable, easy to say, not junk' },
  { key: 'memorable', label: 'Memorable', criterion: 'is memorable and sticky — easy to recall after hearing once' },
  { key: 'premium', label: 'Premium', criterion: 'sounds premium, high-end and expensive' },
  { key: 'playful', label: 'Playful', criterion: 'sounds playful, fun and approachable' },
  { key: 'technical', label: 'Technical', criterion: 'fits a developer tool or technical product — credible to engineers' },
  { key: 'trustworthy', label: 'Trustworthy', criterion: 'sounds trustworthy, serious and credible' },
  { key: 'short', label: 'Short & punchy', criterion: 'is short and punchy' },
] as const

export type MetricKey = (typeof METRICS)[number]['key']

// Build a judge prompt that scores names on a single criterion, reusing the
// exact JSON-array output contract rerank() already parses.
export function metricPrompt(criterion: string): string {
  return `You are a branding expert judging invented startup/product names.
Rate each name from 1 (poor) to 10 (excellent) on ONE criterion: how much each name ${criterion}.
Respond with ONLY a JSON array, one object per name, in the SAME order as the input:
[{"i": 1, "score": 8, "reason": "short reason, max 8 words"}]
No prose before or after the array.

Names:
{{names}}`
}

export function defaultJudgeConfig(): JudgeConfig {
  return {
    enabled: false,
    provider: 'openrouter',
    model: DEFAULT_OPENROUTER_MODEL,
    endpoint: DEFAULT_LOCAL_ENDPOINT,
    prompt: DEFAULT_JUDGE_PROMPT,
  }
}

// Whether a config has the minimum to attempt a call (used to decide if the
// "Sharpen" button should act or open Settings first).
export function isJudgeReady(cfg: JudgeConfig): boolean {
  if (!cfg.enabled) return false
  if (cfg.provider === 'openrouter') return Boolean(cfg.apiKey?.trim())
  return isValidLocalEndpoint(cfg.endpoint)
}

const cache = new Map<string, RankedJudgment[]>()
const MAX_JUDGE_REASON_UNITS = 160

function baseAndHeaders(cfg: JudgeConfig): { base: string; headers: Record<string, string> } {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (cfg.provider === 'openrouter') {
    headers['Authorization'] = `Bearer ${cfg.apiKey ?? ''}`
    headers['X-Title'] = 'neologism'
    return { base: OPENROUTER_BASE, headers }
  }
  return { base: normalizeLocalEndpoint(cfg.endpoint), headers }
}

// Localhost servers often expose a single loaded model; auto-detect it so the
// user doesn't have to type the id. OpenRouter requires an explicit model.
async function resolveModel(
  cfg: JudgeConfig,
  base: string,
  headers: Record<string, string>,
  signal?: AbortSignal,
): Promise<string | null> {
  if (cfg.model?.trim()) return cfg.model.trim()
  if (cfg.provider === 'openrouter') return DEFAULT_OPENROUTER_MODEL
  try {
    const res = await fetch(`${base}/models`, { headers, signal })
    if (!res.ok) return null
    const data = (await res.json()) as { data?: { id: string }[] }
    return data.data?.[0]?.id ?? null
  } catch {
    return null
  }
}

export function buildPrompt(template: string, labels: string[]): string {
  const list = labels.map((n, i) => `${i + 1}. ${n}`).join('\n')
  return (template || DEFAULT_JUDGE_PROMPT).replace('{{names}}', list)
}

// ---- Model discovery + token/cost estimate (Phase 52) ----

export interface ModelInfo {
  id: string
  name?: string
  priceIn: number // USD per input token
  priceOut: number // USD per output token
  contextLength?: number
  free: boolean
}

function catalogPrice(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (typeof value === 'string' && value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function modelInfoFromUnknown(value: unknown, provider: JudgeProvider): ModelInfo | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  if (typeof row.id !== 'string' || !isWellFormedUnicode(row.id)) return null
  const id = row.id.trim()
  if (!id) return null

  const pricing = row.pricing !== null && typeof row.pricing === 'object' && !Array.isArray(row.pricing)
    ? row.pricing as Record<string, unknown>
    : null
  const rawIn = catalogPrice(pricing?.prompt)
  const rawOut = catalogPrice(pricing?.completion)
  const freeId = provider === 'openrouter' && id.endsWith(':free')
  const fallback = provider === 'localhost' || freeId ? 0 : -1
  const completePricing = rawIn !== null && rawOut !== null
  const variablePricing = completePricing && (rawIn < 0 || rawOut < 0)
  const priceIn = !freeId && completePricing && !variablePricing ? rawIn : fallback
  const priceOut = !freeId && completePricing && !variablePricing ? rawOut : fallback

  return {
    id,
    name: typeof row.name === 'string' && isWellFormedUnicode(row.name) ? row.name : undefined,
    priceIn,
    priceOut,
    contextLength: typeof row.context_length === 'number'
      && Number.isFinite(row.context_length)
      && row.context_length > 0
      ? row.context_length
      : undefined,
    free: freeId || (priceIn === 0 && priceOut === 0),
  }
}

const modelCache = new Map<string, ModelInfo[]>()

// Live model list. OpenRouter's /models is public (no key needed); a local
// server exposes its loaded models at {endpoint}/models. Returns [] on ANY
// failure (incl. CORS) so the UI falls back to the curated list + manual entry.
// Keep the large remote catalog cached for the session, but always recheck a
// local endpoint: desktop model servers can replace their one loaded model
// without changing URL while Settings is open or between modal visits.
export async function fetchModels(cfg: JudgeConfig, signal?: AbortSignal): Promise<ModelInfo[]> {
  if (cfg.provider === 'localhost' && !isValidLocalEndpoint(cfg.endpoint)) return []
  const url =
    cfg.provider === 'openrouter'
      ? `${OPENROUTER_BASE}/models`
      : `${normalizeLocalEndpoint(cfg.endpoint)}/models`
  if (cfg.provider === 'openrouter' && modelCache.has(url)) return modelCache.get(url)!
  try {
    const res = await fetch(url, { signal })
    if (!res.ok) return []
    const data = (await res.json()) as { data?: unknown }
    const models: ModelInfo[] = (Array.isArray(data.data) ? data.data : [])
      .map((model) => modelInfoFromUnknown(model, cfg.provider))
      .filter((model): model is ModelInfo => model !== null)
    // Free first, then cheapest, then alphabetical. Negative/sentinel prices
    // (e.g. openrouter/auto reports -1 for variable pricing) sort to the bottom
    // of the paid group rather than above genuinely cheap models.
    const sortPrice = (m: ModelInfo) =>
      m.priceIn < 0 || m.priceOut < 0 ? Infinity : m.priceIn + m.priceOut
    models.sort(
      (a, b) =>
        Number(b.free) - Number(a.free) || sortPrice(a) - sortPrice(b) || a.id.localeCompare(b.id),
    )
    if (cfg.provider === 'openrouter') modelCache.set(url, models)
    return models
  } catch {
    return []
  }
}

export interface TokenEstimate {
  input: number
  output: number
  total: number
}

// Rough, tokenizer-free estimate: ~chars/4 for the prompt, ~15 tokens per name
// for the {i,score,reason} output. Enough to show the order of cost (label "≈").
export function estimateTokens(names: NameResult[], cfg: JudgeConfig): TokenEstimate {
  const prompt = buildPrompt(cfg.prompt || DEFAULT_JUDGE_PROMPT, names.map((n) => n.name))
  const input = Math.ceil(prompt.length / 4)
  const output = names.length * 15
  return { input, output, total: input + output }
}

// USD cost for an estimate at the given per-token prices, or null if unknown.
export function estimateCost(est: TokenEstimate, priceIn?: number, priceOut?: number): number | null {
  if (priceIn === undefined || priceOut === undefined || priceIn < 0 || priceOut < 0) return null
  return est.input * priceIn + est.output * priceOut
}

// Pull the first top-level JSON array out of a reply that may be wrapped in prose
// or ```json fences.
function extractArray(content: string): unknown | null {
  const start = content.indexOf('[')
  const end = content.lastIndexOf(']')
  if (start === -1 || end === -1 || end < start) return null
  try {
    return JSON.parse(content.slice(start, end + 1))
  } catch {
    return null
  }
}

/**
 * Re-rank candidates by LLM brand-quality judgment, best first, with a short
 * reason per name. Returns null on ANY failure so the caller falls back to the
 * offline order. Pure read-only network call; nothing is mutated.
 */
export async function rerank(
  names: NameResult[],
  cfg: JudgeConfig,
  signal?: AbortSignal,
): Promise<RankedJudgment[] | null> {
  if (!isJudgeReady(cfg)) return null
  if (names.length === 0) return []

  const labels = names.map((n) => n.name)
  const template = cfg.prompt || DEFAULT_JUDGE_PROMPT
  const { base, headers } = baseAndHeaders(cfg)

  try {
    const model = await resolveModel(cfg, base, headers, signal)
    if (!model) return null
    const key = JSON.stringify([
      cfg.provider,
      base,
      model,
      template,
      labels,
    ])
    if (cache.has(key)) return cache.get(key)!

    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers,
      signal,
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: buildPrompt(template, labels) }],
        temperature: 0,
      }),
    })
    if (!res.ok) return null

    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const content = data.choices?.[0]?.message?.content
    if (!content) return null

    const arr = extractArray(content)
    if (!Array.isArray(arr) || arr.length === 0) return null

    // Map each judgment to its input name. Prefer an explicit 1-based "i";
    // fall back to array position when the array lines up with the input.
    const byIndex = new Map<number, { score: number; reason: string }>()
    arr.forEach((item, pos) => {
      const o = item as { i?: unknown; score?: unknown; reason?: unknown }
      const idx = o.i === undefined ? pos : typeof o.i === 'number' ? o.i - 1 : NaN
      const score = typeof o.score === 'number' ? o.score : NaN
      const reason = typeof o.reason === 'string' ? o.reason.trim() : ''
      if (
        !Number.isInteger(idx)
        || idx < 0
        || idx >= labels.length
        || !Number.isFinite(score)
        || score < 1
        || score > 10
        || !reason
        || reason.length > MAX_JUDGE_REASON_UNITS
        || !isWellFormedUnicode(reason)
        || reason.split(/\s+/u).length > 8
      ) return
      byIndex.set(idx, { score, reason })
    })
    // Require coverage of every candidate — a partial reply is treated as failure.
    if (byIndex.size !== labels.length) return null

    const ranked: RankedJudgment[] = labels
      .map((name, i) => ({ name, score: byIndex.get(i)!.score, reason: byIndex.get(i)!.reason, i }))
      .sort((a, b) => b.score - a.score || a.i - b.i)
      .map(({ name, score, reason }) => ({ name, score, reason }))

    cache.set(key, ranked)
    return ranked
  } catch {
    return null
  }
}
