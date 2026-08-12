import { useEffect, useRef, useState } from 'react'
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
import { tasteIdentity } from '../lib/taste-identity'
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
  rankedBy?: string
}

interface RankAttempt {
  poolId: number
  metric: Metric
  criterion: string
  label: string
  cacheKey: string
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
  const [rankingStatus, setRankingStatus] = useState('')
  const [activeRank, setActiveRank] = useState<RankAttempt | null>(null)
  const [failedRank, setFailedRank] = useState<RankAttempt | null>(null)
  // Per-metric cache so flipping back to a metric is instant (no re-call).
  const cache = useRef<Map<string, Ranked>>(new Map())
  const operationActive = useRef(false)
  const rankRequestId = useRef(0)
  const poolId = useRef(0)
  const metricButtons = useRef<Map<Metric, HTMLButtonElement>>(new Map())
  const customRankButton = useRef<HTMLButtonElement>(null)

  const ready = isJudgeReady(judgeConfig)
  const favoriteKeys = new Set(favorites.map(tasteIdentity))

  useEffect(() => {
    if (!ready) setRankingStatus('')
  }, [ready])

  const criterionFor = (m: Metric) =>
    m === 'custom' ? custom.trim() : METRICS.find((x) => x.key === m)!.criterion
  const cacheKey = (m: Metric) => (m === 'custom' ? `custom:${custom.trim().toLowerCase()}` : m)
  const metricLabel = (m: Metric) =>
    m === 'custom' ? custom.trim() || 'custom' : METRICS.find((x) => x.key === m)!.label

  const rankAttemptFor = (m: Metric, forPool: number): RankAttempt | null => {
    const criterion = criterionFor(m)
    if (!criterion) return null
    return {
      poolId: forPool,
      metric: m,
      criterion,
      label: metricLabel(m),
      cacheKey: cacheKey(m),
    }
  }

  const focusRankControl = (attempt: RankAttempt) => {
    const target = attempt.metric === 'custom' && !customRankButton.current?.disabled
      ? customRankButton.current
      : metricButtons.current.get(attempt.metric)
    target?.focus()
  }

  const estimateCriterion = activeRank?.criterion
    ?? failedRank?.criterion
    ?? criterionFor(metric)
  const est = pool.length
    ? estimateTokens(pool, { ...judgeConfig, prompt: metricPrompt(estimateCriterion || ' ') })
    : null
  const cost = est ? estimateCost(est, judgeConfig.priceIn, judgeConfig.priceOut) : null
  const costLabel = cost === null ? '$?' : cost === 0 ? '$0' : `≈ $${cost.toFixed(4)}`

  async function rankPool(
    attempt: RankAttempt,
    poolToRank: NameResult[],
    options: { ownsOperation?: boolean; fromRetry?: boolean; displayedRanking?: string } = {},
  ) {
    if (poolToRank.length === 0 || attempt.poolId !== poolId.current) return
    if (!options.ownsOperation) {
      if (operationActive.current) return
      operationActive.current = true
    }
    const requestId = ++rankRequestId.current
    setRankingStatus('')
    const finish = () => {
      if (requestId !== rankRequestId.current) return
      operationActive.current = false
      setActiveRank(null)
      setBusy('idle')
    }
    const cached = cache.current.get(attempt.cacheKey)
    if (cached && cached.ranked.length === poolToRank.length) {
      if (options.fromRetry) focusRankControl(attempt)
      setView(cached)
      setRankingStatus(`${cached.ranked.length} names ranked by ${attempt.label}.`)
      setNotice(null)
      setFailedRank(null)
      finish()
      return
    }
    setBusy('ranking')
    setActiveRank(attempt)
    if (!options.fromRetry) {
      setNotice(null)
      setFailedRank(null)
    }
    const result = await rerank(poolToRank, {
      ...judgeConfig,
      prompt: metricPrompt(attempt.criterion),
    })
    if (requestId !== rankRequestId.current || attempt.poolId !== poolId.current) return
    if (!result) {
      setNotice(options.displayedRanking
        ? `${attempt.label} ranking is unavailable. Still showing the ${options.displayedRanking} ranking.`
        : `${attempt.label} ranking is unavailable. Showing the unranked local pool.`)
      setFailedRank(attempt)
      finish()
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
      rankedBy: attempt.label,
    }
    cache.current.set(attempt.cacheKey, next)
    if (options.fromRetry) focusRankControl(attempt)
    setView(next)
    setRankingStatus(`${next.ranked.length} names ranked by ${attempt.label}.`)
    setNotice(null)
    setFailedRank(null)
    finish()
  }

  async function generate() {
    if (operationActive.current) return
    if (!ready) {
      onOpenSettings()
      return
    }
    operationActive.current = true
    ++rankRequestId.current
    const metricSnapshot = metric
    const criterionSnapshot = criterionFor(metricSnapshot)
    const labelSnapshot = metricLabel(metricSnapshot)
    const cacheKeySnapshot = cacheKey(metricSnapshot)
    setBusy('generating')
    setNotice(null)
    setRankingStatus('')
    setFailedRank(null)
    setActiveRank(null)
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
      const nextPoolId = ++poolId.current
      cache.current.clear()
      setPool(p)
      setView({ ranked: p, reasons: new Map() })
      if (!criterionSnapshot) {
        setRankingStatus(`${p.length} unranked local names shown.`)
        operationActive.current = false
        setBusy('idle')
        return
      }
      await rankPool({
        poolId: nextPoolId,
        metric: metricSnapshot,
        criterion: criterionSnapshot,
        label: labelSnapshot,
        cacheKey: cacheKeySnapshot,
      }, p, { ownsOperation: true })
    } catch {
      operationActive.current = false
      setActiveRank(null)
      setNotice(view.ranked.length
        ? 'Generation failed. The displayed names are unchanged.'
        : 'Generation failed. Try again.')
      setBusy('idle')
    }
  }

  function selectMetric(m: Metric) {
    if (operationActive.current) return
    setMetric(m)
    const attempt = rankAttemptFor(m, poolId.current)
    if (pool.length && m !== 'custom' && attempt) {
      void rankPool(attempt, pool, { displayedRanking: view.rankedBy })
    }
  }

  function rankCustom() {
    if (operationActive.current) return
    const attempt = rankAttemptFor('custom', poolId.current)
    if (pool.length && attempt) {
      void rankPool(attempt, pool, { displayedRanking: view.rankedBy })
    }
  }

  function retryRanking() {
    if (!failedRank || operationActive.current) return
    void rankPool(failedRank, pool, {
      fromRetry: true,
      displayedRanking: view.rankedBy,
    })
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
      <div
        className="visually-hidden studio-ranking-status"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {ready ? rankingStatus : ''}
      </div>

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
              aria-label="AI Studio project brief"
              placeholder="What are you naming? (optional)"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && busy === 'idle') void generate()
              }}
            />
            <button
              type="button"
              className="command-go"
              onClick={() => void generate()}
              aria-disabled={busy !== 'idle'}
              aria-busy={busy !== 'idle'}
            >
              {busy === 'generating' ? 'Generating…' : 'Generate'}
            </button>
          </div>

          <div className="metric-chips" role="group" aria-label="Rank by">
            <span className="metric-label">Rank by</span>
            {METRICS.map((m) => (
              <button
                key={m.key}
                ref={(node) => {
                  if (node) metricButtons.current.set(m.key, node)
                  else metricButtons.current.delete(m.key)
                }}
                type="button"
                className={`metric-chip${metric === m.key ? ' selected' : ''}`}
                title={`how much each name ${m.criterion}`}
                onClick={() => selectMetric(m.key)}
                aria-pressed={metric === m.key}
                aria-disabled={busy !== 'idle'}
              >
                {m.label}
              </button>
            ))}
            <button
              ref={(node) => {
                if (node) metricButtons.current.set('custom', node)
                else metricButtons.current.delete('custom')
              }}
              type="button"
              className={`metric-chip${metric === 'custom' ? ' selected' : ''}`}
              onClick={() => selectMetric('custom')}
              aria-pressed={metric === 'custom'}
              aria-disabled={busy !== 'idle'}
            >
              + Custom
            </button>
          </div>

          {metric === 'custom' && (
            <div className="metric-custom">
              <input
                className="command-input"
                type="text"
                aria-label="Custom ranking criterion"
                placeholder="rank by how … they sound (e.g. calm and minimal)"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && pool.length && custom.trim() && busy === 'idle') {
                    rankCustom()
                  }
                }}
              />
              <button
                ref={customRankButton}
                className="command-go"
                onClick={rankCustom}
                disabled={!pool.length || !custom.trim()}
                aria-disabled={busy !== 'idle'}
                aria-busy={busy === 'ranking' && activeRank?.metric === 'custom'}
              >
                Rank
              </button>
            </div>
          )}

          {view.ranked.length > 0 && (
            <p className="studio-meta">
              {view.rankedBy
                ? <>Ranked by <strong>{view.rankedBy}</strong></>
                : <strong>Unranked local pool</strong>}
              {busy === 'ranking' && activeRank && (
                <> {' · '}ranking by <strong>{activeRank.label}</strong>…</>
              )}
              {est && (
                <span className="studio-est">
                  {' · '}≈ {est.total.toLocaleString()} tok · {costLabel}
                </span>
              )}
            </p>
          )}

          {notice && (
            <div className="studio-alert" role="alert" aria-busy={busy === 'ranking'}>
              <p>{notice}</p>
              {failedRank && (
                <div className="studio-recovery">
                  <button
                    type="button"
                    className="command-go"
                    onClick={retryRanking}
                    aria-disabled={busy !== 'idle'}
                    aria-busy={busy === 'ranking'}
                  >
                    {busy === 'ranking' ? 'Retrying…' : 'Retry ranking'}
                  </button>
                  <button
                    type="button"
                    className="toolbar-btn"
                    onClick={() => {
                      if (!operationActive.current) onOpenSettings()
                    }}
                    aria-disabled={busy !== 'idle'}
                  >
                    Open Settings
                  </button>
                </div>
              )}
            </div>
          )}

          {view.ranked.length > 0 ? (
            <section className="results-grid">
              {view.ranked.map((r, i) => (
                <NameCard
                  key={r.name}
                  result={r}
                  isFavorite={favoriteKeys.has(tasteIdentity(r))}
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
