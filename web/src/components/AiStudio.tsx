import { useRef, useState } from 'react'
import { generateBatch, type NameResult } from '../lib/engine'
import {
  METRICS,
  metricPrompt,
  rerank,
  isJudgeReady,
  estimateTokens,
  estimateCost,
  type JudgeConfig,
  type MetricKey,
} from '../lib/judge'
import { NameCard } from './NameCard'

interface Props {
  judgeConfig: JudgeConfig
  favorites: NameResult[]
  onToggleFavorite: (r: NameResult) => void
  onOpenSettings: () => void
}

type Metric = MetricKey | 'custom'
interface Ranked {
  ranked: NameResult[]
  reasons: Map<string, string>
  pick?: string
}

const POOL_SIZE = 24

// Phase 56: AI Studio — generate a pool offline, then let the configured model
// rank it by a metric you pick (or a custom criterion). A "metric" is just a
// judge prompt fed to the same rerank() Create uses.
export function AiStudio({ judgeConfig, favorites, onToggleFavorite, onOpenSettings }: Props) {
  const [prompt, setPrompt] = useState('')
  const [pool, setPool] = useState<NameResult[]>([])
  const [metric, setMetric] = useState<Metric>('brandable')
  const [custom, setCustom] = useState('')
  const [view, setView] = useState<Ranked>({ ranked: [], reasons: new Map() })
  const [busy, setBusy] = useState<'idle' | 'generating' | 'ranking'>('idle')
  const [notice, setNotice] = useState<string | null>(null)
  // Per-metric cache so flipping back to a metric is instant (no re-call).
  const cache = useRef<Map<string, Ranked>>(new Map())

  const ready = isJudgeReady(judgeConfig)
  const favSet = new Set(favorites.map((f) => f.name))

  const criterionFor = (m: Metric) =>
    m === 'custom' ? custom.trim() : METRICS.find((x) => x.key === m)!.criterion
  const cacheKey = (m: Metric) => (m === 'custom' ? `custom:${custom.trim().toLowerCase()}` : m)
  const metricLabel = (m: Metric) =>
    m === 'custom' ? custom.trim() || 'custom' : METRICS.find((x) => x.key === m)!.label

  const est = pool.length
    ? estimateTokens(pool, { ...judgeConfig, prompt: metricPrompt(criterionFor(metric) || ' ') })
    : null
  const cost = est ? estimateCost(est, judgeConfig.priceIn, judgeConfig.priceOut) : null
  const costLabel = cost === null ? '$?' : cost === 0 ? '$0' : `≈ $${cost.toFixed(4)}`

  async function rankPool(m: Metric, poolToRank: NameResult[]) {
    const crit = criterionFor(m)
    if (!crit || poolToRank.length === 0) return
    const key = cacheKey(m)
    const cached = cache.current.get(key)
    if (cached && cached.ranked.length === poolToRank.length) {
      setView(cached)
      return
    }
    setBusy('ranking')
    setNotice(null)
    const result = await rerank(poolToRank, { ...judgeConfig, prompt: metricPrompt(crit) })
    if (!result) {
      setNotice('Ranking unavailable — check your model in Settings.')
      setBusy('idle')
      return
    }
    const order = new Map(result.map((r, i) => [r.name, i]))
    const ranked = [...poolToRank].sort(
      (a, b) => (order.get(a.name) ?? Infinity) - (order.get(b.name) ?? Infinity),
    )
    const next: Ranked = {
      ranked,
      reasons: new Map(result.map((r) => [r.name, r.reason])),
      pick: result[0]?.name,
    }
    cache.current.set(key, next)
    setView(next)
    setBusy('idle')
  }

  async function generate() {
    if (!ready) {
      onOpenSettings()
      return
    }
    setBusy('generating')
    setNotice(null)
    cache.current.clear()
    setView({ ranked: [], reasons: new Map() })
    try {
      const p = await generateBatch({
        style: 'big_tech',
        count: POOL_SIZE,
        min_len: 4,
        max_len: 12,
        temperature: 0.85,
        variety: 0.4,
        roots: [],
        variant: 'auto',
        description: prompt.trim() || undefined,
      })
      setPool(p)
      await rankPool(metric, p)
    } catch {
      setNotice('Generation failed.')
      setBusy('idle')
    }
  }

  function selectMetric(m: Metric) {
    setMetric(m)
    if (pool.length && m !== 'custom') void rankPool(m, pool)
  }

  return (
    <div className="ai-studio">
      <header className="page-header">
        <h1 className="page-title">✨ AI Studio</h1>
      </header>
      <p className="studio-sub">
        Generate a batch, then rank it by what matters — the engine creates the names, your
        configured model ranks them and says why.
      </p>

      {!ready ? (
        <div className="studio-setup">
          <p>Set up an AI model to rank by metric — OpenRouter (your key) or a local server.</p>
          <button className="command-go" onClick={onOpenSettings}>Open Settings</button>
        </div>
      ) : (
        <>
          <div className="command-bar">
            <span className="command-glyph">⌕</span>
            <input
              className="command-input"
              type="text"
              placeholder="What are you naming? (optional)"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && busy === 'idle') void generate()
              }}
            />
            <button className="command-go" onClick={() => void generate()} disabled={busy !== 'idle'}>
              {busy === 'generating' ? 'Generating…' : 'Generate'}
            </button>
          </div>

          <div className="metric-chips" role="group" aria-label="Rank by">
            <span className="metric-label">Rank by</span>
            {METRICS.map((m) => (
              <button
                key={m.key}
                type="button"
                className={`metric-chip${metric === m.key ? ' selected' : ''}`}
                title={`how much each name ${m.criterion}`}
                onClick={() => selectMetric(m.key)}
              >
                {m.label}
              </button>
            ))}
            <button
              type="button"
              className={`metric-chip${metric === 'custom' ? ' selected' : ''}`}
              onClick={() => selectMetric('custom')}
            >
              + Custom
            </button>
          </div>

          {metric === 'custom' && (
            <div className="metric-custom">
              <input
                className="command-input"
                type="text"
                placeholder="rank by how … they sound (e.g. calm and minimal)"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && pool.length && custom.trim() && busy === 'idle') {
                    void rankPool('custom', pool)
                  }
                }}
              />
              <button
                className="command-go"
                onClick={() => void rankPool('custom', pool)}
                disabled={!pool.length || !custom.trim() || busy !== 'idle'}
              >
                Rank
              </button>
            </div>
          )}

          {(view.ranked.length > 0 || busy === 'ranking') && (
            <p className="studio-meta">
              Ranked by <strong>{metricLabel(metric)}</strong>
              {busy === 'ranking' && ' · ranking…'}
              {est && (
                <span className="studio-est">
                  {' · '}≈ {est.total.toLocaleString()} tok · {costLabel}
                </span>
              )}
              {notice && <span className="sort-notice">{' · '}{notice}</span>}
            </p>
          )}

          {view.ranked.length > 0 ? (
            <section className="results-grid">
              {view.ranked.map((r, i) => (
                <NameCard
                  key={r.name}
                  result={r}
                  isFavorite={favSet.has(r.name)}
                  onToggleFavorite={onToggleFavorite}
                  reason={view.reasons.get(r.name)}
                  isAiPick={r.name === view.pick}
                  appearDelay={(i % POOL_SIZE) * 35}
                />
              ))}
            </section>
          ) : (
            busy === 'idle' && (
              <div className="empty-state">
                <p>Generate a batch, then rank it by the metric that matters.</p>
              </div>
            )
          )}
        </>
      )}
    </div>
  )
}
