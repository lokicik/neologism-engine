import { useState, useCallback, useRef, useEffect } from 'react'
import { generateBatch, generateColdLeadRetry, generateNames, batchMetrics, extractKeywords, type BatchMetrics, type Config, type NameResult } from './lib/engine'
import { recommendations } from './lib/recommend'
import { buildReferencedProfile, coldQualityPoolCount, compoundTastePoolCount, feedbackForContext, fillColdLeadRetry, MIN_TASTE_SIGNALS, needsColdLeadRetry, needsQualityRepair, preferencePoolCount, prioritizeColdStrongLead, repairWeakShortlist, shortlistByPreference } from './lib/preferences'
import { tasteContextForConfig } from './lib/taste-context'
import { tasteEvidenceProgress } from './lib/taste-data'
import {
  addImportedSaved,
  hasVisited,
  loadFavorites,
  loadImportedSaved,
  loadJudgeConfig,
  loadRecent,
  loadRejected,
  loadTasteReferences,
  markVisited,
  removeFavorite,
  removeRejected,
  removeSavedEverywhere,
  RECENT_WINDOW,
  saveJudgeConfig,
  saveRecent,
  saveTasteReferences,
  toggleTasteFeedback,
} from './lib/storage'
import { savedNameEntries, tasteIdentity } from './lib/taste-identity'
import { type JudgeConfig } from './lib/judge'
import { decodeShareUrl } from './lib/share'
import { CommandBar } from './components/CommandBar'
import { NameCard } from './components/NameCard'
import { StatsPanel } from './components/StatsPanel'
import { Sidebar, type AppView } from './components/Sidebar'
import { SavedPage } from './components/SavedPage'
import { AiStudio } from './components/AiStudio'
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
  // Auto is the default: blend all four modes into one batch (see generateBatch).
  variant: 'auto',
}

function randomSelectionSalt(): number {
  const value = new Uint32Array(1)
  crypto.getRandomValues(value)
  return value[0]
}

type View = 'landing' | AppView

const VIEW_TITLES: Record<View, string> = {
  landing: 'Neologism Engine — Startup & Project Name Generator',
  create: 'Create — Neologism Engine',
  studio: 'AI Studio — Neologism Engine',
  saved: 'Saved — Neologism Engine',
}

function viewFromHistoryState(state: unknown): View | null {
  if (state === null || typeof state !== 'object' || Array.isArray(state)) return null
  const view = (state as Record<string, unknown>).neologismView
  return view === 'landing' || view === 'create' || view === 'studio' || view === 'saved'
    ? view
    : null
}

function historyStateFor(view: View): Record<string, unknown> {
  const current = history.state
  const base = current !== null && typeof current === 'object' && !Array.isArray(current)
    ? current as Record<string, unknown>
    : {}
  return { ...base, neologismView: view }
}

export default function App() {
  // First visit shows the landing; share-URL visitors skip it and land on the
  // Saved page (they came for shared favorites). Entering is remembered.
  const [view, setView] = useState<View>(() => {
    if (decodeShareUrl().length > 0) return 'saved'
    return viewFromHistoryState(history.state) ?? (hasVisited() ? 'create' : 'landing')
  })
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG)
  const [generationConfig, setGenerationConfig] = useState<Config>(DEFAULT_CONFIG)
  const [results, setResults] = useState<NameResult[]>([])
  const [metrics, setMetrics] = useState<BatchMetrics | null>(null)
  const [favorites, setFavorites] = useState<NameResult[]>(loadFavorites)
  const [importedSaved, setImportedSaved] = useState<NameResult[]>(loadImportedSaved)
  const [rejected, setRejected] = useState<NameResult[]>(loadRejected)
  const [tasteReferences, setTasteReferences] = useState(loadTasteReferences)
  const [loading, setLoading] = useState(false)
  // True when a generate/append produced zero names — the prompt's reachable
  // space is exhausted against the seen-names history.
  const [exhausted, setExhausted] = useState(false)
  // Keyword stems the engine extracted from the description of the last
  // generation (Phase 48) — shown so users see what drove their batch.
  const [promptKeywords, setPromptKeywords] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [generationStatus, setGenerationStatus] = useState('')
  const [recentHistoryError, setRecentHistoryError] = useState<string | null>(null)
  const [feedbackError, setFeedbackError] = useState<string | null>(null)
  const [tasteReferenceError, setTasteReferenceError] = useState<string | null>(null)
  // AI model config (used by the AI Studio); configured once via Settings.
  const [judgeConfig, setJudgeConfig] = useState<JudgeConfig>(loadJudgeConfig)
  const [showSettings, setShowSettings] = useState(false)
  const recentRef = useRef<string[]>(loadRecent())
  const pendingViewFocusRef = useRef<View | null>(null)
  const pendingHistoryFocusRef = useRef(false)
  const exhaustedRetryRef = useRef<HTMLButtonElement>(null)
  // One nearby taste direction per visible session. A manual fresh generation
  // gets a new salt; infinite-scroll pages keep it so the session feels
  // coherent instead of changing preference direction on every append.
  const preferenceSaltRef = useRef<number | null>(null)
  // Command controls may be edited while an existing page remains visible.
  // Infinite scroll must continue that page's project instead of mixing the
  // next draft brief into its results and taste-evidence context.
  const generationConfigRef = useRef<Config>(DEFAULT_CONFIG)
  const viewRef = useRef(view)

  const navigateView = useCallback((next: View) => {
    if (viewRef.current === next) return
    history.pushState(historyStateFor(next), '', location.href)
    viewRef.current = next
    setView(next)
  }, [])

  useEffect(() => {
    if (view !== 'create') setGenerationStatus('')
  }, [view])

  useEffect(() => {
    history.replaceState(historyStateFor(viewRef.current), '', location.href)
    const restoreView = (event: PopStateEvent) => {
      const next = viewFromHistoryState(event.state)
      if (!next || next === viewRef.current) return
      pendingViewFocusRef.current = null
      pendingHistoryFocusRef.current = true
      viewRef.current = next
      setShowSettings(false)
      setView(next)
    }
    addEventListener('popstate', restoreView)
    return () => removeEventListener('popstate', restoreView)
  }, [])

  useEffect(() => {
    document.title = VIEW_TITLES[view]
  }, [view])

  useEffect(() => {
    if (pendingViewFocusRef.current !== view) return
    pendingViewFocusRef.current = null

    const selector = view === 'landing' ? '.landing-title' : '.command-input'
    document.querySelector<HTMLElement>(selector)?.focus()
  }, [view])

  useEffect(() => {
    if (!pendingHistoryFocusRef.current) return
    pendingHistoryFocusRef.current = false
    requestAnimationFrame(() => {
      const selector = view === 'landing' ? '.landing-title' : '#main-content'
      document.querySelector<HTMLElement>(selector)?.focus()
    })
  }, [view])
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
  const importedSavedRef = useRef<NameResult[]>(importedSaved)
  useEffect(() => {
    importedSavedRef.current = importedSaved
  }, [importedSaved])
  const rejectedRef = useRef<NameResult[]>(rejected)
  useEffect(() => {
    rejectedRef.current = rejected
  }, [rejected])

  // On mount: a share URL adds names to Saved without pretending that the
  // recipient explicitly liked them. Taste evidence remains action-derived.
  useEffect(() => {
    const shared = decodeShareUrl()
    if (shared.length === 0) {
      // Invalid or unsupported payloads are not recoverable by retrying. A
      // valid payload whose storage write fails follows the branch below and
      // deliberately keeps its hash as the recovery copy.
      if (location.hash.startsWith('#names=')) {
        history.replaceState(historyStateFor(viewRef.current), '', location.pathname)
      }
      return
    }
    // A valid share is an intentional entry into the app. Remember it so the
    // recipient returns to the product, not the first-visit landing page,
    // after the recovery hash has been cleared.
    markVisited()
    const stubs: NameResult[] = shared.map((item) => ({
      name: item.name,
      style: item.style,
      score_pronounce: 0,
      score_novelty: 0,
      score_memorability: 0,
      connotations: [],
      syllables: 0,
    }))
    const imported = addImportedSaved(importedSaved, stubs)
    setImportedSaved(imported.items)
    // Preserve the recovery URL if browser storage rejected the write.
    if (imported.persisted) history.replaceState(historyStateFor(viewRef.current), '', location.pathname)
  }, [])

  const markSeen = (names: NameResult[]) => {
    recentRef.current = [...recentRef.current, ...names.map((n) => n.name)].slice(-RECENT_WINDOW)
    setRecentHistoryError(saveRecent(recentRef.current)
      ? null
      : 'Could not save seen-name history. This page will avoid repeats for now, but these names may return after reload.')
  }

  // `append` = the "More names" button: the new batch joins the existing grid
  // (the exclude-recent window guarantees it's all fresh names). `cfgOverride`
  // lets the empty-state example chips set a description and generate in one
  // step without racing the config state update.
  const handleGenerate = useCallback(async (append = false, cfgOverride?: Config) => {
    if (loadingRef.current) return
    loadingRef.current = true
    setLoading(true)
    setError(null)
    setGenerationStatus('')
    try {
      const cfg = append ? generationConfigRef.current : cfgOverride ?? config
      // One random seed per click keeps every local sub-pool reproducible as a
      // unit while still giving an unseeded user a fresh result on every click.
      const generationSeed = cfg.seed ?? randomSelectionSalt()
      const generationCfg = { ...cfg, seed: generationSeed }
      lastGenerateRef.current = Date.now()
      const feedback = feedbackForContext(
        favoritesRef.current,
        rejectedRef.current,
        tasteContextForConfig(cfg).id,
      )
      const { profile } = buildReferencedProfile(
        feedback.favorites,
        feedback.rejected,
        tasteReferences,
      )
      if (!append || preferenceSaltRef.current === null) {
        preferenceSaltRef.current = generationSeed
      }
      const requestedCount = cfg.count ?? 10
      const poolCount = preferencePoolCount(requestedCount, profile)
      const hasBrief = Boolean(cfg.description?.trim() || cfg.roots?.some((root) => root.trim()))
      const compoundPoolCount = cfg.style === 'big_tech'
        && cfg.variant === 'auto'
        && hasBrief
        ? compoundTastePoolCount(requestedCount, profile)
        : 0
      const [primaryPool, compoundTastePool] = await Promise.all([
        generateBatch({
          ...generationCfg,
          count: poolCount,
          exclude: recentRef.current,
        }),
        compoundPoolCount > 0
          ? generateNames({
              ...generationCfg,
              variant: undefined,
              compound: true,
              count: compoundPoolCount,
              exclude: recentRef.current,
            })
          : Promise.resolve([]),
      ])
      let pool = [...primaryPool, ...compoundTastePool]
      let batch: NameResult[]
      if (
        !profile
        && cfg.variant === 'auto'
        && needsQualityRepair(primaryPool, requestedCount)
      ) {
        // The primary Auto page already owns its optional Respell accent.
        // Repair from Brandable only so a larger fallback cannot add a second.
        const fallback = await generateNames({
          ...generationCfg,
          variant: undefined,
          compound: false,
          count: coldQualityPoolCount(requestedCount),
          exclude: [...recentRef.current, ...primaryPool.map((result) => result.name)],
        })
        pool = [...primaryPool, ...fallback]
        batch = repairWeakShortlist(primaryPool, fallback, requestedCount)
      } else {
        batch = shortlistByPreference(
          pool,
          profile,
          requestedCount,
          preferenceSaltRef.current,
        )
      }
      if (!append && !profile && cfg.variant === 'auto') {
        batch = prioritizeColdStrongLead(batch)
        if (hasBrief && recentRef.current.length === 0 && needsColdLeadRetry(batch)) {
          batch = fillColdLeadRetry(batch, await generateColdLeadRetry({
            ...generationCfg,
            exclude: recentRef.current,
          }), pool)
        }
      }
      setPromptKeywords(cfg.description?.trim() ? await extractKeywords(cfg.description) : [])
      setExhausted(pool.length === 0)
      if (!append) {
        generationConfigRef.current = cfg
        setGenerationConfig(cfg)
      }
      // Taste profiles select from a larger pool and may add a small Compound
      // accent pool when positive examples strongly prefer two-part names.
      // Cold Auto opens its fallback only for weak/missing or repetitive slots.
      const shown = append ? [...resultsRef.current, ...batch] : batch
      setResults(shown)
      setGenerationStatus(
        viewRef.current === 'create' && shown.length > 0 ? `${shown.length} names shown.` : '',
      )
      // Recent history represents names the user actually saw. Keeping hidden
      // shortlist candidates eligible lets later pages reveal the next-best
      // options instead of burning up to fifty unseen names per click.
      markSeen(batch)
      setMetrics(shown.length > 0 ? await batchMetrics(shown) : null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
  }, [config, tasteReferences])

  const handleTasteReferencesChange = useCallback((value: string) => {
    const next = value.slice(0, 240)
    if (!saveTasteReferences(next)) {
      setTasteReferenceError('Could not save reference names. Browser storage kept the previous names active.')
      return false
    }
    setTasteReferences(next)
    setTasteReferenceError(null)
    return true
  }, [])

  const handleToggleFavorite = useCallback((item: NameResult) => {
    const result = toggleTasteFeedback(
      favoritesRef.current,
      rejectedRef.current,
      item,
      'favorite',
    )
    favoritesRef.current = result.favorites
    rejectedRef.current = result.rejected
    setFavorites(result.favorites)
    setRejected(result.rejected)
    setFeedbackError(result.persisted
      ? null
      : result.rollbackFailed
        ? `Could not update feedback for ${item.name}, and browser storage could not restore the previous choice. The name is now neutral.`
        : `Could not update feedback for ${item.name}. Browser storage kept the previous choice.`)
  }, [])

  const handleToggleRejected = useCallback((item: NameResult) => {
    const result = toggleTasteFeedback(
      favoritesRef.current,
      rejectedRef.current,
      item,
      'rejected',
    )
    favoritesRef.current = result.favorites
    rejectedRef.current = result.rejected
    setFavorites(result.favorites)
    setRejected(result.rejected)
    setFeedbackError(result.persisted
      ? null
      : result.rollbackFailed
        ? `Could not update feedback for ${item.name}, and browser storage could not restore the previous choice. The name is now neutral.`
        : `Could not update feedback for ${item.name}. Browser storage kept the previous choice.`)
  }, [])

  const handleUndoRejected = useCallback((item: NameResult): number | null => {
    const current = rejectedRef.current
    try {
      const nextRejected = removeRejected(current, item)
      if (nextRejected.length === current.length) return null
      rejectedRef.current = nextRejected
      setRejected(nextRejected)
      return nextRejected.length
    } catch {
      return null
    }
  }, [])

  const handleUndoFavorite = useCallback((item: NameResult): number | null => {
    const current = favoritesRef.current
    try {
      const nextFavorites = removeFavorite(current, item)
      if (nextFavorites.length === current.length) return null
      favoritesRef.current = nextFavorites
      setFavorites(nextFavorites)
      return nextFavorites.length
    } catch {
      return null
    }
  }, [])

  const handleRemoveSaved = useCallback((item: NameResult) => {
    const removal = removeSavedEverywhere(
      favoritesRef.current,
      importedSavedRef.current,
      item,
    )
    favoritesRef.current = removal.favorites
    importedSavedRef.current = removal.importedSaved
    setFavorites(removal.favorites)
    setImportedSaved(removal.importedSaved)
    return removal.removed
  }, [])

  const saveSettings = useCallback((cfg: JudgeConfig) => {
    if (!saveJudgeConfig(cfg)) return false
    setJudgeConfig(cfg)
    return true
  }, [])

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
  const clearSeenAndRetry = async (keyboard: boolean) => {
    if (loadingRef.current) return
    recentRef.current = []
    setRecentHistoryError(saveRecent([])
      ? null
      : 'Could not clear saved seen-name history. This session will continue without it, but older names may stay excluded after reload.')
    await handleGenerate(false)
    if (keyboard) {
      requestAnimationFrame(() => {
        const target = exhaustedRetryRef.current
          ?? document.querySelector<HTMLButtonElement>('.command-go')
        target?.focus()
      })
    }
  }

  // Empty-state example prompts: set the description and generate in one click.
  const examplePrompts = [
    'a Rust CLI that processes logs',
    'a Python package for data validation',
    'a journaling app with mood insights',
    'a tool that syncs design tokens',
    'a marketplace for vintage keyboards',
  ]
  const tryExample = (desc: string, keyboard: boolean) => {
    const next = { ...config, description: desc }
    setConfig(next)
    void handleGenerate(false, next)
    if (keyboard) {
      requestAnimationFrame(() => {
        document.querySelector<HTMLButtonElement>('.command-go')?.focus()
      })
    }
  }

  const favoriteKeys = new Set(favorites.map(tasteIdentity))
  const rejectedKeys = new Set(rejected.map(tasteIdentity))
  const savedEntries = savedNameEntries(favorites, importedSaved)

  // Preference profile learns toward likes or away from repeated passes.
  // Phase 37: applied automatically once it exists — no toggle. Phase 49:
  // ranking happens per batch inside handleGenerate (insert order is final);
  // this render-time profile only drives the local-taste status note.
  const tasteFeedback = feedbackForContext(
    favorites,
    rejected,
    tasteContextForConfig(generationConfig).id,
  )
  const { profile, references: activeReferences } = buildReferencedProfile(
    tasteFeedback.favorites,
    tasteFeedback.rejected,
    tasteReferences,
  )
  const projectEvidence = tasteEvidenceProgress(
    tasteFeedback.favorites,
    tasteFeedback.rejected,
  )
  const displayResults = results
  const positiveSignals = tasteFeedback.favorites.length + activeReferences.length
  const likesNeeded = Math.max(0, MIN_TASTE_SIGNALS - positiveSignals)
  const passesNeeded = Math.max(0, MIN_TASTE_SIGNALS - tasteFeedback.rejected.length)
  const tastePrompt = activeReferences.length > 0
    ? `Teach local taste · ${activeReferences.length} refs · ${likesNeeded} ${likesNeeded === 1 ? 'like or ref' : 'likes or refs'} or ${passesNeeded} ${passesNeeded === 1 ? 'pass' : 'passes'} left`
    : `Teach local taste${tasteFeedback.scope === 'project' ? ' for this project' : ''} · ${likesNeeded} ${likesNeeded === 1 ? 'like' : 'likes'} or ${passesNeeded} ${passesNeeded === 1 ? 'pass' : 'passes'} left`
  const feedbackScope = tasteFeedback.scope === 'project' ? 'this project: ' : ''

  // Top pick of the batch (compared by name, so re-ranking doesn't break it).
  const bestName = metrics && results.length >= 2 ? results[metrics.stats.best_index]?.name : undefined

  const tips = metrics ? recommendations(metrics.stats, generationConfig, results) : []

  if (view === 'landing') {
    return (
      <Landing
        onEnter={(keyboard) => {
          if (keyboard) pendingViewFocusRef.current = 'create'
          markVisited()
          navigateView('create')
        }}
      />
    )
  }

  return (
    <div className="shell">
      <button
        type="button"
        className="skip-main-content"
        onClick={() => document.getElementById('main-content')?.focus()}
      >
        Skip to main content
      </button>
      <Sidebar
        view={view}
        savedCount={savedEntries.length}
        onNavigate={navigateView}
        onAbout={(keyboard) => {
          if (keyboard) pendingViewFocusRef.current = 'landing'
          navigateView('landing')
        }}
        onSettings={() => setShowSettings(true)}
      />

      <main id="main-content" className="page" tabIndex={-1}>
        {feedbackError && (
          <div className="feedback-alert" role="alert" aria-atomic="true">
            {feedbackError}
          </div>
        )}
        {view === 'saved' ? (
          <SavedPage
            entries={savedEntries}
            onRemoveSaved={handleRemoveSaved}
            onGoCreate={(keyboard) => {
              if (keyboard) pendingViewFocusRef.current = 'create'
              navigateView('create')
            }}
          />
        ) : view === 'studio' ? (
          <AiStudio
            judgeConfig={judgeConfig}
            favorites={favorites}
            onToggleFavorite={handleToggleFavorite}
            onOpenSettings={() => setShowSettings(true)}
          />
        ) : (
          <>
            <h1 className="create-page-title">Create names</h1>
            <CommandBar
              config={config}
              onChange={setConfig}
              onGenerate={() => handleGenerate(false)}
              loading={loading}
              tasteReferences={tasteReferences}
              tasteReferenceError={tasteReferenceError}
              onTasteReferencesChange={handleTasteReferencesChange}
            />

            <section className="canvas">
              <div
                className="visually-hidden create-results-status"
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                {generationStatus}
              </div>
              {error && <div className="error-banner" role="alert" aria-atomic="true">{error}</div>}
              {recentHistoryError && (
                <div className="error-banner recent-history-error" role="alert" aria-atomic="true">
                  {recentHistoryError}
                </div>
              )}

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
                  {results.length > 0 && (
                    <span
                      className={`nav-note taste-note${profile ? ' active' : ''}`}
                      title="Add reference names in Advanced, star names you like, and use Not for me on misses. Local ranking activates at three signals; scorer evidence needs matched likes and passes from the same project. Nothing leaves your browser."
                    >
                      {profile
                        ? `Local taste · ${activeReferences.length > 0 ? `${activeReferences.length} refs · ` : ''}${feedbackScope}${tasteFeedback.favorites.length} liked · ${tasteFeedback.rejected.length} passed · evidence ${projectEvidence.matchedLiked}/10 likes + ${projectEvidence.matchedPassed}/10 passes`
                        : tastePrompt}
                    </span>
                  )}
                </div>
              )}

              {displayResults.length > 0 && (
                <>
                  <div className="results-grid">
                    {displayResults.map((r, i) => (
                      <NameCard
                        key={r.name}
                        result={r}
                        isFavorite={favoriteKeys.has(tasteIdentity(r))}
                        onToggleFavorite={handleToggleFavorite}
                        isRejected={rejectedKeys.has(tasteIdentity(r))}
                        onToggleRejected={handleToggleRejected}
                        isBest={r.name === bestName}
                        appearDelay={(i % (generationConfig.count ?? 10)) * 45}
                      />
                    ))}
                  </div>
                  {!exhausted && <div ref={sentinelRef} className="scroll-sentinel" aria-hidden />}
                </>
              )}

              {exhausted && (
                <div className="exhausted-notice" role="status" aria-live="polite" aria-atomic="true">
                  <p>
                    You've seen every name this prompt can make. Try different words or
                    another mode — or clear your seen-names history and start over.
                  </p>
                  <button
                    ref={exhaustedRetryRef}
                    className="example-chip"
                    aria-disabled={loading}
                    aria-busy={loading}
                    onClick={(event) => void clearSeenAndRetry(event.detail === 0)}
                  >
                    {loading ? 'Regenerating…' : 'Clear seen names & regenerate'}
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
                      <button
                        key={p}
                        className="example-chip"
                        onClick={(event) => tryExample(p, event.detail === 0)}
                      >
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
        <SettingsModal
          config={judgeConfig}
          favorites={favorites}
          rejected={rejected}
          onSave={saveSettings}
          onUndoFavorite={handleUndoFavorite}
          onUndoRejected={handleUndoRejected}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}
