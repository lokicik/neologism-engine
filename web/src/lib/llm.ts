import type { NameResult } from './engine'

// Phase 28: optional local-LLM re-ranker. The offline engine generates well but
// judges badly (its scores are structural proxies blind to brand quality); a
// local OpenAI-compatible LLM — e.g. llama.cpp at 127.0.0.1:8080 — judges the
// semantic quality the proxies miss. This is an OPT-IN enhancement: every failure
// path (unreachable, CORS-blocked, malformed reply) returns null so the caller
// silently keeps the offline ranking. Mirrors the graceful-fallback pattern in
// domain.ts.

export const DEFAULT_LLM_ENDPOINT = 'http://127.0.0.1:8080'

// Cache rankings within a session so toggling/re-rendering doesn't re-hit the LLM
// for an identical candidate set. Keyed by the sorted candidate names.
const cache = new Map<string, string[]>()

async function detectModel(endpoint: string): Promise<string | null> {
  try {
    const res = await fetch(`${endpoint}/v1/models`)
    if (!res.ok) return null
    const data = (await res.json()) as { data?: { id: string }[] }
    return data.data?.[0]?.id ?? null
  } catch {
    return null
  }
}

function buildPrompt(names: string[]): string {
  let p =
    'Rate each invented tech-company brand name below on brand quality, from 1 ' +
    '(bad: awkward, hard to pronounce, junk-like) to 10 (excellent: memorable, ' +
    'easy to say, distinctive, sounds like a real brand). Respond with ONLY a JSON ' +
    'array of integers in the same order, nothing else.\n\n'
  names.forEach((n, i) => {
    p += `${i + 1}. ${n}\n`
  })
  return p
}

/**
 * Re-rank candidates by local-LLM brand-quality judgment and return the top-N
 * names in ranked order. Returns null on any failure so the caller falls back to
 * the offline ranking.
 */
export async function rerank(
  names: NameResult[],
  topN: number,
  endpoint: string = DEFAULT_LLM_ENDPOINT,
): Promise<string[] | null> {
  if (names.length === 0) return []
  const labels = names.map((n) => n.name)
  const key = `${topN}|${[...labels].sort().join(',')}`
  if (cache.has(key)) return cache.get(key)!

  try {
    const model = (await detectModel(endpoint)) ?? 'local-model'
    const res = await fetch(`${endpoint}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: buildPrompt(labels) }],
        temperature: 0,
      }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    const content = data.choices?.[0]?.message?.content
    if (!content) return null

    // The model occasionally wraps the array in prose; extract the bracketed part.
    const start = content.indexOf('[')
    const end = content.lastIndexOf(']')
    if (start === -1 || end === -1 || end < start) return null
    const scores = JSON.parse(content.slice(start, end + 1)) as unknown
    if (!Array.isArray(scores) || scores.length !== labels.length) return null
    if (!scores.every((s) => typeof s === 'number')) return null

    // Stable sort by descending score (ties keep the engine's offline order).
    const ranked = labels
      .map((name, i) => ({ name, score: scores[i] as number, i }))
      .sort((a, b) => b.score - a.score || a.i - b.i)
      .slice(0, topN)
      .map((x) => x.name)

    cache.set(key, ranked)
    return ranked
  } catch {
    return null
  }
}
