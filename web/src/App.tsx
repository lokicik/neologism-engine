import { useState, useCallback, useRef, useEffect } from 'react'
import { generateNames, batchMetrics, type BatchMetrics, type Config, type NameResult, type Style } from './lib/engine'
import { rerank } from './lib/llm'
import { recommendations } from './lib/recommend'
import { buildProfile, rankByPreference } from './lib/preferences'
import { loadFavorites, toggleFavorite, saveFavorites, loadRecent, saveRecent, hasVisited, markVisited } from './lib/storage'
import { decodeShareUrl } from './lib/share'
import { Controls } from './components/Controls'
import { NameCard } from './components/NameCard'
import { StatsPanel } from './components/StatsPanel'
import { Favorites } from './components/Favorites'
import { Landing } from './components/Landing'

// Defaults match the UI's "Any" length and "Balanced" creativity segments.
const DEFAULT_CONFIG: Config = {
  style: 'big_tech',
  count: 10,
  min_len: 4,
  max_len: 12,
  temperature: 0.85,
  variety: 0.3,
  roots: [],
}

// Don't repeat names the user has seen recently. A name can't recur within this
// many shown names (~2,000 batches of 10) — effectively "never repeats" for any
// real session. Persisted across reloads; ~200 KB through the JSON boundary per
// call, negligible. Safe to scale: since Phase 35 the engine applies exact-match
// exclusion to the whole list but windows the fuzzy/stem layers internally
// (fuzzy_window=2000), so a large list can't starve generation — the distinct
// big-tech vocabulary measured at 57k+ (100k-generation sweep).
const RECENT_WINDOW = 20000

export default function App() {
  // First visit shows the landing; share-URL visitors skip it (they came for
  // shared favorites). Entering the app is remembered across reloads.
  const [view, setView] = useState<'landing' | 'app'>(() =>
    hasVisited() || location.hash.startsWith('#names=') ? 'app' : 'landing',
  )
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG)
  const [results, setResults] = useState<NameResult[]>([])
  const [metrics, setMetrics] = useState<BatchMetrics | null>(null)
  const [favorites, setFavorites] = useState<NameResult[]>(loadFavorites)
  const [aiRank, setAiRank] = useState(false)
  const [loading, setLoading] = useState(false)
  const [ranking, setRanking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recentRef = useRef<string[]>(loadRecent())
  // Mirror of `results` for the append path — handleGenerate is memoized on
  // [config, aiRank], so reading state directly there would be stale.
  const resultsRef = useRef<NameResult[]>([])
  useEffect(() => {
    resultsRef.current = results
  }, [results])

  // On mount: if a #names= share URL is present, union those names into favorites.
  useEffect(() => {
    const shared = decodeShareUrl()
    if (shared.length === 0) return
    setFavorites((prev) => {
      const existing = new Set(prev.map((f) => f.name))
      const stubs: NameResult[] = shared
        .filter((p) => !existing.has(p.name))
        .map((p) => ({
          name: p.name,
          style: p.style as Style,
          score_pronounce: 0,
          score_novelty: 0,
          score_memorability: 0,
          connotations: [],
          syllables: 0,
        }))
      if (stubs.length === 0) return prev
      const merged = [...prev, ...stubs]
      saveFavorites(merged)
      return merged
    })
    // Clear the hash so the URL is clean after loading.
    history.replaceState(null, '', location.pathname)
  }, [])

  const markSeen = (names: NameResult[]) => {
    recentRef.current = [...recentRef.current, ...names.map((n) => n.name)].slice(-RECENT_WINDOW)
    saveRecent(recentRef.current)
  }

  // `append` = the "More names" button: the new batch joins the existing grid
  // (the exclude-recent window guarantees it's all fresh names).
  const handleGenerate = useCallback(async (append = false) => {
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
      const shown = append ? [...resultsRef.current, ...offlineTop] : offlineTop
      setResults(shown)
      markSeen(offlineTop)
      setMetrics(shown.length > 0 ? await batchMetrics(shown) : null)
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
              const base = append ? resultsRef.current.slice(0, -offlineTop.length) : []
              const next = [...base, ...reordered]
              setResults(next)
              markSeen(reordered)
              setMetrics(await batchMetrics(next))
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
  // Phase 37: applied automatically once it exists — no toggle.
  const profile = buildProfile(favorites)
  const displayResults = profile ? rankByPreference(results, profile) : results

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

  if (view === 'landing') {
    return (
      <Landing
        onEnter={() => {
          markVisited()
          setView('app')
        }}
      />
    )
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1
          className="app-title-link"
          onClick={() => setView('landing')}
          title="About — back to the landing page"
        >
          Neologism Engine
        </h1>
        <p className="tagline">Startup & project name generator — brandable, real-word, respelled and compound names with instant availability checks.</p>
      </header>

      <main className="app-main">
        <Controls
          config={config}
          onChange={setConfig}
          onGenerate={() => handleGenerate(false)}
          loading={loading}
          aiRank={aiRank}
          onAiRank={setAiRank}
          ranking={ranking}
        />

        {error && <div className="error-banner">{error}</div>}

        {metrics && <StatsPanel stats={metrics.stats} tips={tips} />}

        {results.length > 0 && profile && (
          <div className="tuned-hint">✨ tuned to your favorites</div>
        )}

        {displayResults.length > 0 && (
          <>
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
            <button
              className="more-names-btn"
              onClick={() => handleGenerate(true)}
              disabled={loading || ranking}
            >
              {loading ? 'Generating…' : 'More names'}
            </button>
          </>
        )}

        {results.length === 0 && !loading && (
          <div className="empty-state">
            Describe what you're building — or just hit Generate.
          </div>
        )}
      </main>

      <Favorites favorites={favorites} onRemove={handleToggleFavorite} />
    </div>
  )
}
