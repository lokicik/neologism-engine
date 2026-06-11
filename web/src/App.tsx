import { useState, useCallback, useRef, useEffect } from 'react'
import { generateNames, batchMetrics, type BatchMetrics, type Config, type NameResult, type Style } from './lib/engine'
import { recommendations } from './lib/recommend'
import { buildProfile, rankByPreference } from './lib/preferences'
import { loadFavorites, toggleFavorite, saveFavorites, loadRecent, saveRecent, hasVisited, markVisited } from './lib/storage'
import { decodeShareUrl } from './lib/share'
import { CommandBar } from './components/CommandBar'
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
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  // True when a generate/append produced zero names — the prompt's reachable
  // space is exhausted against the seen-names history.
  const [exhausted, setExhausted] = useState(false)
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
  // (the exclude-recent window guarantees it's all fresh names). `cfgOverride`
  // lets the empty-state example chips set a description and generate in one
  // step without racing the config state update.
  const handleGenerate = useCallback(async (append = false, cfgOverride?: Config) => {
    const cfg = cfgOverride ?? config
    setLoading(true)
    setError(null)
    try {
      const batch = await generateNames({ ...cfg, exclude: recentRef.current })
      setExhausted(batch.length === 0)
      const shown = append ? [...resultsRef.current, ...batch] : batch
      setResults(shown)
      markSeen(batch)
      setMetrics(shown.length > 0 ? await batchMetrics(shown) : null)
      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setLoading(false)
    }
  }, [config])

  const handleToggleFavorite = useCallback((item: NameResult) => {
    setFavorites((prev) => toggleFavorite(prev, item))
  }, [])

  // Close the favorites drawer with Esc, and when the last favorite is removed.
  useEffect(() => {
    if (!drawerOpen) return
    if (favorites.length === 0) {
      setDrawerOpen(false)
      return
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen, favorites.length])

  // The prompt's name space is used up against the seen-history: wipe the
  // history and regenerate. (Names already starred stay in favorites.)
  const clearSeenAndRetry = () => {
    recentRef.current = []
    saveRecent([])
    setExhausted(false)
    void handleGenerate(false)
  }

  // Empty-state example prompts: set the description and generate in one click.
  const examplePrompts = [
    'a journaling app with mood insights',
    'a tool that syncs design tokens',
    'a marketplace for vintage keyboards',
  ]
  const tryExample = (desc: string) => {
    const next = { ...config, description: desc }
    setConfig(next)
    void handleGenerate(false, next)
  }

  const favoriteNames = new Set(favorites.map((f) => f.name))

  // Preference profile learned from favorites (Namelix-style); needs ≥3.
  // Phase 37: applied automatically once it exists — no toggle.
  const profile = buildProfile(favorites)
  const displayResults = profile ? rankByPreference(results, profile) : results

  // Top pick of the batch (compared by name, so re-ranking doesn't break it).
  const bestName = metrics && results.length >= 2 ? results[metrics.stats.best_index]?.name : undefined

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
      <nav className="landing-nav workspace-nav">
        <span
          className="wordmark app-title-link"
          onClick={() => setView('landing')}
          title="About — back to the landing page"
        >
          ◈ neologism
        </span>
        <div className="nav-right">
          {profile && results.length > 0 && (
            <span className="nav-note" title="Results re-ranked toward your saved names">✨ tuned</span>
          )}
          {favorites.length > 0 && (
            <button className="nav-cta" onClick={() => setDrawerOpen(true)}>
              ★ {favorites.length} saved
            </button>
          )}
        </div>
      </nav>

      <main className="workspace">
        <CommandBar
          config={config}
          onChange={setConfig}
          onGenerate={() => handleGenerate(false)}
          loading={loading}
        />

        <section className="canvas">
          {error && <div className="error-banner">{error}</div>}

          {metrics && <StatsPanel stats={metrics.stats} tips={tips} />}

          {displayResults.length > 0 && (
            <>
              <div className="results-grid">
                {displayResults.map((r) => (
                  <NameCard
                    key={r.name}
                    result={r}
                    isFavorite={favoriteNames.has(r.name)}
                    onToggleFavorite={handleToggleFavorite}
                    isBest={r.name === bestName}
                  />
                ))}
              </div>
              <button
                className="more-names-btn"
                onClick={() => handleGenerate(true)}
                disabled={loading}
              >
                {loading ? 'Generating…' : 'More names'}
              </button>
            </>
          )}

          {exhausted && !loading && (
            <div className="exhausted-notice">
              <p>
                You've seen every name this prompt can make. Try different words or
                another mode — or clear your seen-names history and start over.
              </p>
              <button className="example-chip" onClick={clearSeenAndRetry}>
                Clear seen names & regenerate
              </button>
            </div>
          )}

          {loading && results.length === 0 && (
            <div className="results-grid">
              {Array.from({ length: config.count ?? 10 }).map((_, i) => (
                <div key={i} className="skeleton-card" style={{ animationDelay: `${i * 60}ms` }} />
              ))}
            </div>
          )}

          {results.length === 0 && !loading && (
            <div className="empty-state">
              <p>Describe what you're building — or just hit Generate.</p>
              <div className="example-chips">
                {examplePrompts.map((p) => (
                  <button key={p} className="example-chip" onClick={() => tryExample(p)}>
                    “{p}”
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      </main>

      {drawerOpen && (
        <>
          <div className="drawer-overlay" onClick={() => setDrawerOpen(false)} />
          <div className="drawer">
            <button className="drawer-close icon-btn" onClick={() => setDrawerOpen(false)} title="Close">
              ✕
            </button>
            <Favorites favorites={favorites} onRemove={handleToggleFavorite} />
          </div>
        </>
      )}
    </div>
  )
}
