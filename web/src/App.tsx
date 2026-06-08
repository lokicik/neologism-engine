import { useState, useCallback, useRef } from 'react'
import { generateNames, batchMetrics, type BatchMetrics, type Config, type NameResult } from './lib/engine'
import { rerank } from './lib/llm'
import { recommendations } from './lib/recommend'
import { buildProfile, rankByPreference } from './lib/preferences'
import { loadFavorites, toggleFavorite, loadRecent, saveRecent } from './lib/storage'
import { Controls } from './components/Controls'
import { NameCard } from './components/NameCard'
import { StatsPanel } from './components/StatsPanel'
import { Favorites } from './components/Favorites'

const DEFAULT_CONFIG: Config = {
  style: 'big_tech',
  count: 10,
  min_len: 4,
  max_len: 12,
  temperature: 0.7,
  variety: 0.3,
  roots: [],
}

// Don't repeat names the user has seen recently. A name can't recur within this
// many shown names (~50 batches of 10) — kills the "same name again" feeling.
// Persisted across reloads, and well under the ~2.3k-name space so it won't starve.
const RECENT_WINDOW = 500

export default function App() {
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG)
  const [results, setResults] = useState<NameResult[]>([])
  const [metrics, setMetrics] = useState<BatchMetrics | null>(null)
  const [favorites, setFavorites] = useState<NameResult[]>(loadFavorites)
  const [tuned, setTuned] = useState(false)
  const [aiRank, setAiRank] = useState(false)
  const [loading, setLoading] = useState(false)
  const [ranking, setRanking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recentRef = useRef<string[]>(loadRecent())

  const markSeen = (names: NameResult[]) => {
    recentRef.current = [...recentRef.current, ...names.map((n) => n.name)].slice(-RECENT_WINDOW)
    saveRecent(recentRef.current)
  }

  const handleGenerate = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const topN = config.count ?? 10
      // With AI rank on, over-generate a broad pool for the LLM to choose from;
      // otherwise just the requested count. 30 balances candidate breadth against
      // re-rank latency (the local model's verbose reasoning makes the call scale
      // with name count — ~30s at 30 names, ~50s at 50).
      const poolCount = aiRank ? Math.max(topN, 30) : topN
      const pool = await generateNames({ ...config, count: poolCount, exclude: recentRef.current })

      // Show the offline-ranked top-N immediately — the LLM reorders after.
      const offlineTop = pool.slice(0, topN)
      setResults(offlineTop)
      markSeen(offlineTop)
      setMetrics(offlineTop.length > 0 ? await batchMetrics(offlineTop) : null)
      setLoading(false)

      // Opt-in second stage: local LLM re-ranks the pool, surfaces its top picks.
      // Any failure (unreachable/CORS/malformed) leaves the offline results as-is.
      if (aiRank && pool.length > 0) {
        setRanking(true)
        try {
          const ranked = await rerank(pool, topN)
          if (ranked && ranked.length > 0) {
            const byName = new Map(pool.map((r) => [r.name, r]))
            const reordered = ranked
              .map((n) => byName.get(n))
              .filter((r): r is NameResult => !!r)
            if (reordered.length > 0) {
              setResults(reordered)
              markSeen(reordered)
              setMetrics(await batchMetrics(reordered))
            }
          }
        } finally {
          setRanking(false)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setLoading(false)
    }
  }, [config, aiRank])

  const handleToggleFavorite = useCallback((item: NameResult) => {
    setFavorites((prev) => toggleFavorite(prev, item))
  }, [])

  const favoriteNames = new Set(favorites.map((f) => f.name))

  // Preference profile learned from favorites (Namelix-style); needs ≥3.
  const profile = buildProfile(favorites)
  const displayResults = tuned && profile ? rankByPreference(results, profile) : results

  // Standout names by metric (compared by name, so re-ranking doesn't break badges).
  const bestName = metrics && results.length >= 2 ? results[metrics.stats.best_index]?.name : undefined
  const origName = results.length >= 2
    ? results.reduce((m, r) => (r.score_novelty > m.score_novelty ? r : m)).name : undefined
  const easyName = results.length >= 2
    ? results.reduce((m, r) => (r.score_pronounce > m.score_pronounce ? r : m)).name : undefined

  const badgesFor = (r: NameResult): string[] => {
    const b: string[] = []
    if (r.name === bestName) b.push('👑 Best')
    if (r.name === origName) b.push('✦ Original')
    if (r.name === easyName) b.push('🔊 Easy say')
    return b
  }

  const tips = metrics ? recommendations(metrics.stats, config, results) : []

  return (
    <div className="app">
      <header className="app-header">
        <h1>Neologism Engine</h1>
        <p className="tagline">Invented names for big-tech brands, sci-fi worlds, and fantasy realms.</p>
      </header>

      <main className="app-main">
        <Controls
          config={config}
          onChange={setConfig}
          onGenerate={handleGenerate}
          loading={loading}
        />

        <label className="tuned-toggle" title="Re-rank results with a local LLM (llama.cpp at 127.0.0.1:8080). Falls back silently to offline ranking if unavailable.">
          <input
            type="checkbox"
            checked={aiRank}
            onChange={(e) => setAiRank(e.target.checked)}
            disabled={loading || ranking}
          />
          <span>✨ AI rank (local LLM){ranking ? ' — ranking…' : ''}</span>
        </label>

        {error && <div className="error-banner">{error}</div>}

        {metrics && <StatsPanel stats={metrics.stats} tips={tips} />}

        {results.length > 0 && profile && (
          <label className="tuned-toggle">
            <input type="checkbox" checked={tuned} onChange={(e) => setTuned(e.target.checked)} />
            <span>Tuned to your favorites</span>
          </label>
        )}

        {displayResults.length > 0 && (
          <section className="results-grid">
            {displayResults.map((r) => (
              <NameCard
                key={r.name}
                result={r}
                isFavorite={favoriteNames.has(r.name)}
                onToggleFavorite={handleToggleFavorite}
                badges={badgesFor(r)}
              />
            ))}
          </section>
        )}

        {results.length === 0 && !loading && (
          <div className="empty-state">
            Choose a style and hit Generate.
          </div>
        )}
      </main>

      <Favorites favorites={favorites} onRemove={handleToggleFavorite} />
    </div>
  )
}
