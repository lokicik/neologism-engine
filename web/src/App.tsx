import { useState, useCallback, useRef, useEffect } from 'react'
import { generateNames, batchMetrics, extractKeywords, type BatchMetrics, type Config, type NameResult, type Style } from './lib/engine'
import { recommendations } from './lib/recommend'
import { buildProfile, rankByPreference } from './lib/preferences'
import { loadFavorites, toggleFavorite, saveFavorites, loadRecent, saveRecent, hasVisited, markVisited, loadJudgeConfig, saveJudgeConfig } from './lib/storage'
import { rerank, isJudgeReady, type JudgeConfig } from './lib/judge'
import { decodeShareUrl } from './lib/share'
import { CommandBar } from './components/CommandBar'
import { NameCard } from './components/NameCard'
import { StatsPanel } from './components/StatsPanel'
import { Sidebar, type AppView } from './components/Sidebar'
import { SavedPage } from './components/SavedPage'
import { SettingsModal } from './components/SettingsModal'
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

type View = 'landing' | AppView

export default function App() {
  // First visit shows the landing; share-URL visitors skip it and land on the
  // Saved page (they came for shared favorites). Entering is remembered.
  const [view, setView] = useState<View>(() => {
    if (location.hash.startsWith('#names=')) return 'saved'
    return hasVisited() ? 'create' : 'landing'
  })
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG)
  const [results, setResults] = useState<NameResult[]>([])
  const [metrics, setMetrics] = useState<BatchMetrics | null>(null)
  const [favorites, setFavorites] = useState<NameResult[]>(loadFavorites)
  const [loading, setLoading] = useState(false)
  // True when a generate/append produced zero names — the prompt's reachable
  // space is exhausted against the seen-names history.
  const [exhausted, setExhausted] = useState(false)
  // Keyword stems the engine extracted from the description of the last
  // generation (Phase 48) — shown so users see what drove their batch.
  const [promptKeywords, setPromptKeywords] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  // Optional "Sharpen with AI" judge (Phase 50). Default off; configured once.
  const [judgeConfig, setJudgeConfig] = useState<JudgeConfig>(loadJudgeConfig)
  const [showSettings, setShowSettings] = useState(false)
  const [sharpening, setSharpening] = useState(false)
  // Per-name AI reasons for the current batch, plus the judge's #1 pick.
  const [reasons, setReasons] = useState<Map<string, string>>(new Map())
  const [aiPickName, setAiPickName] = useState<string | undefined>(undefined)
  // Non-blocking note when a sharpen attempt fell back to the offline order.
  const [judgeNotice, setJudgeNotice] = useState<string | null>(null)
  const recentRef = useRef<string[]>(loadRecent())
  // Mirror of `results` for the append path — handleGenerate is memoized on
  // [config], so reading state directly there would be stale.
  const resultsRef = useRef<NameResult[]>([])
  useEffect(() => {
    resultsRef.current = results
  }, [results])
  // Mirror of `loading` for the infinite-scroll observer callback (same
  // staleness reason as resultsRef).
  const loadingRef = useRef(false)
  useEffect(() => {
    loadingRef.current = loading
  }, [loading])
  // Phase 49: end-of-grid sentinel — scrolling near it auto-appends a batch.
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  // Last generate timestamp — paces auto-appends so each batch's entrance
  // animation finishes before the next batch can start (the engine itself
  // takes ~20ms, which felt like an instant blast of cards).
  const lastGenerateRef = useRef(0)
  // Mirror of `favorites` so handleGenerate can rank an incoming batch
  // without being re-memoized on every star.
  const favoritesRef = useRef<NameResult[]>(favorites)
  useEffect(() => {
    favoritesRef.current = favorites
  }, [favorites])

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
    lastGenerateRef.current = Date.now()
    setLoading(true)
    setError(null)
    try {
      const batch = await generateNames({ ...cfg, exclude: recentRef.current })
      setPromptKeywords(cfg.description?.trim() ? await extractKeywords(cfg.description) : [])
      setExhausted(batch.length === 0)
      // A fresh batch invalidates the previous AI re-rank/reasons.
      if (!append) {
        setReasons(new Map())
        setAiPickName(undefined)
        setJudgeNotice(null)
      }
      // Preference ranking is applied to the incoming batch only, at insert
      // time — re-ranking the whole list on every append (the old render-time
      // rankByPreference) made already-visible cards jump around the grid.
      const profile = buildProfile(favoritesRef.current)
      const ranked = profile ? rankByPreference(batch, profile) : batch
      const shown = append ? [...resultsRef.current, ...ranked] : ranked
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

  const saveSettings = useCallback((cfg: JudgeConfig) => {
    setJudgeConfig(cfg)
    saveJudgeConfig(cfg)
  }, [])

  // "Sharpen with AI": re-rank the current batch by a real LLM's judgment and
  // attach a one-line reason per name. Any failure falls back to the offline
  // order with a small notice (rerank() returns null on every error path).
  const handleSharpen = useCallback(async () => {
    const batch = resultsRef.current
    if (batch.length === 0 || sharpening) return
    if (!isJudgeReady(judgeConfig)) {
      setShowSettings(true)
      return
    }
    setSharpening(true)
    setJudgeNotice(null)
    try {
      const ranked = await rerank(batch, judgeConfig)
      if (!ranked) {
        setJudgeNotice('AI re-rank unavailable — kept the offline order. Check Settings.')
        return
      }
      const order = new Map(ranked.map((r, i) => [r.name, i]))
      const reordered = [...batch].sort(
        (a, b) => (order.get(a.name) ?? Infinity) - (order.get(b.name) ?? Infinity),
      )
      setResults(reordered)
      setReasons(new Map(ranked.map((r) => [r.name, r.reason])))
      setAiPickName(ranked[0]?.name)
      setMetrics(reordered.length > 0 ? await batchMetrics(reordered) : null)
    } catch {
      setJudgeNotice('AI re-rank failed — kept the offline order.')
    } finally {
      setSharpening(false)
    }
  }, [judgeConfig, sharpening])

  // Phase 49: infinite scroll — when the sentinel under the grid comes within
  // 300px of the viewport, append the next batch (the 20k exclude window
  // keeps every batch fresh; exhaustion unmounts the sentinel and the notice
  // takes over). Appends are paced by APPEND_COOLDOWN_MS so each batch's
  // entrance animation plays out before the next can start — without it the
  // ~20ms engine chained several batches in one blast. Re-binding on
  // results.length matters: observe() reports the *current* intersection
  // state, so a sentinel still in range schedules the next paced append.
  const APPEND_COOLDOWN_MS = 1000
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    let timer: number | undefined
    let visible = false
    const tryAppend = () => {
      timer = undefined
      if (!visible || loadingRef.current) return
      const wait = lastGenerateRef.current + APPEND_COOLDOWN_MS - Date.now()
      if (wait > 0) {
        timer = window.setTimeout(tryAppend, wait)
        return
      }
      void handleGenerate(true)
    }
    const obs = new IntersectionObserver(
      (entries) => {
        visible = entries.some((e) => e.isIntersecting)
        if (visible && timer === undefined) tryAppend()
      },
      { rootMargin: '300px 0px' },
    )
    obs.observe(el)
    return () => {
      obs.disconnect()
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [handleGenerate, results.length, exhausted, view])

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
  // Phase 37: applied automatically once it exists — no toggle. Phase 49:
  // ranking happens per batch inside handleGenerate (insert order is final);
  // this render-time profile only drives the "tuned to favorites" note.
  const profile = buildProfile(favorites)
  const displayResults = results

  // Top pick of the batch (compared by name, so re-ranking doesn't break it).
  const bestName = metrics && results.length >= 2 ? results[metrics.stats.best_index]?.name : undefined

  const tips = metrics ? recommendations(metrics.stats, config, results) : []

  if (view === 'landing') {
    return (
      <Landing
        onEnter={() => {
          markVisited()
          setView('create')
        }}
      />
    )
  }

  return (
    <div className="shell">
      <Sidebar
        view={view}
        savedCount={favorites.length}
        onNavigate={setView}
        onAbout={() => setView('landing')}
        onSettings={() => setShowSettings(true)}
      />

      <main className="page">
        {view === 'saved' ? (
          <SavedPage
            favorites={favorites}
            onToggleFavorite={handleToggleFavorite}
            onGoCreate={() => setView('create')}
          />
        ) : (
          <>
            <CommandBar
              config={config}
              onChange={setConfig}
              onGenerate={() => handleGenerate(false)}
              loading={loading}
            />

            <section className="canvas">
              {error && <div className="error-banner">{error}</div>}

              {promptKeywords.length > 0 && (results.length > 0 || exhausted) && (
                <p className="keyword-line" title="The keyword stems extracted from your description — every batch is built around them">
                  naming around:{' '}
                  {promptKeywords.map((k, i) => (
                    <span key={k}>
                      {i > 0 && ' · '}
                      <span className="keyword-stem">{k}</span>
                    </span>
                  ))}
                </p>
              )}

              {metrics && (
                <div className="stats-area">
                  <StatsPanel stats={metrics.stats} tips={tips} />
                  {profile && results.length > 0 && (
                    <span className="nav-note" title="Results re-ranked toward your saved names">
                      ✨ tuned to your favorites
                    </span>
                  )}
                </div>
              )}

              {displayResults.length > 0 && (
                <>
                  {judgeConfig.enabled && (
                    <div className="sharpen-bar">
                      <button
                        className="sharpen-btn"
                        onClick={() => void handleSharpen()}
                        disabled={sharpening}
                        title="Re-rank this batch by an LLM's brand-quality judgment"
                      >
                        {sharpening ? 'Sharpening…' : '✨ Sharpen with AI'}
                      </button>
                      {judgeNotice && <span className="sharpen-notice">{judgeNotice}</span>}
                    </div>
                  )}
                  <div className="results-grid">
                    {displayResults.map((r, i) => (
                      <NameCard
                        key={r.name}
                        result={r}
                        isFavorite={favoriteNames.has(r.name)}
                        onToggleFavorite={handleToggleFavorite}
                        isBest={r.name === bestName}
                        reason={reasons.get(r.name)}
                        isAiPick={r.name === aiPickName}
                        appearDelay={(i % (config.count ?? 10)) * 45}
                      />
                    ))}
                  </div>
                  {!exhausted && <div ref={sentinelRef} className="scroll-sentinel" aria-hidden />}
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

              {results.length === 0 && !loading && !exhausted && (
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
          </>
        )}
      </main>

      {showSettings && (
        <SettingsModal config={judgeConfig} onSave={saveSettings} onClose={() => setShowSettings(false)} />
      )}
    </div>
  )
}
