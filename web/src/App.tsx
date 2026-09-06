import { useState, useCallback, useEffect, useRef } from 'react'
import type { NameResult } from './lib/engine'
import { addImportedSaved, loadFavorites, loadImportedSaved, loadJudgeConfig, loadRejected, loadTasteReferences, markVisited, removeFavorite, removeRejected, removeSavedEverywhere, saveJudgeConfig, saveFavorites, saveImportedSaved, saveTasteReferences, toggleTasteFeedback } from './lib/storage'
import { normalizedName, savedNameEntries } from './lib/taste-identity'
import type { JudgeConfig } from './lib/judge'
import { captureSavedRemoval, restoreSavedRemoval, type SavedRemoval } from './lib/saved-undo'
import { decodeShareUrl } from './lib/share'
import { Sidebar, type AppView } from './components/Sidebar'
import { CreatePage, type CreatePageHandle } from './components/CreatePage'
import { SavedPage } from './components/SavedPage'
import { LabPage } from './components/LabPage'
import { AiStudio } from './components/AiStudio'
import { SettingsModal } from './components/SettingsModal'
import { Landing } from './components/Landing'

type View = AppView | 'landing'
const titles: Record<View, string> = { create: 'Create — Neologism Engine', saved: 'Saved — Neologism Engine', lab: 'Lab — Neologism Engine', studio: 'AI Studio — Neologism Engine', landing: 'About — Neologism Engine' }
function route(): View | null {
  const value = new URLSearchParams(location.search).get('view')
  if (value === 'about') return 'landing'
  return value === 'create' || value === 'saved' || value === 'lab' || value === 'studio' ? value : null
}
function historyView(state: unknown): View | null {
  if (state === null || typeof state !== 'object') return null
  const value = (state as Record<string, unknown>).neologismView
  return value === 'create' || value === 'saved' || value === 'lab' || value === 'studio' || value === 'landing' ? value : null
}
function historyStateFor(view: View) { return { ...(history.state && typeof history.state === 'object' ? history.state : {}), neologismView: view } }

export default function App() {
  const [view, setView] = useState<View>(() => decodeShareUrl().length ? 'saved' : route() ?? historyView(history.state) ?? 'create')
  const [favorites, setFavorites] = useState<NameResult[]>(loadFavorites)
  const [importedSaved, setImportedSaved] = useState<NameResult[]>(loadImportedSaved)
  const [rejected, setRejected] = useState<NameResult[]>(loadRejected)
  const [tasteReferences, setTasteReferences] = useState(loadTasteReferences)
  const [tasteReferenceError, setTasteReferenceError] = useState<string | null>(null)
  const [feedbackError, setFeedbackError] = useState<string | null>(null)
  const [judgeConfig, setJudgeConfig] = useState<JudgeConfig>(loadJudgeConfig)
  const [showSettings, setShowSettings] = useState(false)
  const [savedRemoval, setSavedRemoval] = useState<SavedRemoval | null>(null)
  const changedNames = useRef(new Set<string>())
  const favoritesRef = useRef(favorites); favoritesRef.current = favorites
  const importedSavedRef = useRef(importedSaved); importedSavedRef.current = importedSaved
  const rejectedRef = useRef(rejected); rejectedRef.current = rejected
  const viewRef = useRef(view)
  const createSession = useRef<CreatePageHandle>(null)

  const navigateView = useCallback((next: View) => {
    if (viewRef.current === next) return
    if (viewRef.current === 'create') createSession.current?.leave()
    const url = new URL(location.href)
    url.searchParams.set('view', next === 'landing' ? 'about' : next)
    history.pushState(historyStateFor(next), '', url)
    viewRef.current = next; setView(next); setShowSettings(false)
    if (next !== 'create') requestAnimationFrame(() => { window.scrollTo(0, 0); document.getElementById('main-content')?.focus({ preventScroll: true }) })
  }, [])
  useEffect(() => {
    history.replaceState(historyStateFor(viewRef.current), '', location.href)
    const back = (event: PopStateEvent) => {
      if (viewRef.current === 'create') createSession.current?.leave()
      const next = route() ?? historyView(event.state) ?? 'create'
      viewRef.current = next; setView(next); setShowSettings(false)
      if (next !== 'create') requestAnimationFrame(() => document.getElementById('main-content')?.focus())
    }
    addEventListener('popstate', back)
    return () => removeEventListener('popstate', back)
  }, [])
  useEffect(() => { document.title = titles[view] }, [view])
  useEffect(() => {
    const importShared = () => {
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
      const visitedPersisted = markVisited()
      const stubs: NameResult[] = shared.map((item) => ({
        name: item.name,
        style: item.style,
        score_pronounce: 0,
        score_novelty: 0,
        score_memorability: 0,
        connotations: [],
        syllables: 0,
      }))
      const imported = addImportedSaved(importedSavedRef.current, stubs)
      importedSavedRef.current = imported.items
      setImportedSaved(imported.items)
      createSession.current?.leave()
      viewRef.current = 'saved'
      setShowSettings(false)
      setView('saved')
      // Consume the current hash navigation entry on success, so Back returns
      // to the page that was open before the share URL. Preserve the hash as
      // the recovery copy if browser storage rejected the import.
      history.replaceState(
        historyStateFor('saved'),
        '',
        imported.persisted && visitedPersisted ? location.pathname + '?view=saved' : location.href,
      )
    }

    addEventListener('hashchange', importShared)
    importShared()
    return () => removeEventListener('hashchange', importShared)
  }, [])

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
    changedNames.current.add(normalizedName(item))
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
    changedNames.current.add(normalizedName(item))
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
    changedNames.current.add(normalizedName(item))
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
    changedNames.current.add(normalizedName(item))
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
    const receipt = captureSavedRemoval(item, favoritesRef.current, importedSavedRef.current, rejectedRef.current)
    const removal = removeSavedEverywhere(
      favoritesRef.current,
      importedSavedRef.current,
      item,
    )
    favoritesRef.current = removal.favorites
    importedSavedRef.current = removal.importedSaved
    setFavorites(removal.favorites)
    setImportedSaved(removal.importedSaved)
    if (removal.removed) { setSavedRemoval(receipt); changedNames.current.delete(normalizedName(item)) }
    return removal.removed
  }, [])

  const undoSavedRemoval = useCallback(() => {
    if (!savedRemoval) return 'There is no removal to undo.'
    // Read durable collections so Undo cannot roll back changes in other tabs.
    const currentFavorites = loadFavorites()
    const currentImported = loadImportedSaved()
    const currentRejected = loadRejected()
    const key = savedRemoval.name.trim().toLowerCase().normalize('NFC')
    const restored = changedNames.current.has(key) ? null : restoreSavedRemoval(savedRemoval, currentFavorites, currentImported, currentRejected)
    const refresh = () => {
      favoritesRef.current = loadFavorites(); importedSavedRef.current = loadImportedSaved(); rejectedRef.current = loadRejected()
      setFavorites(favoritesRef.current); setImportedSaved(importedSavedRef.current); setRejected(rejectedRef.current)
    }
    if (!restored) { setSavedRemoval(null); refresh(); return `Your later choice for ${savedRemoval.name} has been kept.` }
    const importsChanged = savedRemoval.imported.length > 0
    if (importsChanged && !saveImportedSaved(restored.imported)) return 'Could not undo. Browser storage rejected the change. Try again.'
    try {
      if (savedRemoval.favorites.length) saveFavorites(restored.favorites)
    } catch {
      if (importsChanged) saveImportedSaved(currentImported)
      refresh()
      return 'Could not fully undo. Saved was refreshed to match stored data. Try again.'
    }
    refresh(); setSavedRemoval(null)
    return `${savedRemoval.name} restored to Saved.`
  }, [savedRemoval])

  const saveSettings = useCallback((cfg: JudgeConfig) => {
    if (!saveJudgeConfig(cfg)) return false
    setJudgeConfig(cfg)
    return true
  }, [])


  const savedEntries = savedNameEntries(favorites, importedSaved)
  return <div className="shell">
    <button className="skip-main-content" onClick={() => document.getElementById('main-content')?.focus()}>Skip to main content</button>
    <Sidebar view={view} savedCount={savedEntries.length} onNavigate={navigateView} onAbout={() => navigateView('landing')} onSettings={() => setShowSettings(true)} />
    <main id="main-content" className="page" tabIndex={-1}>
      {feedbackError && <div className="feedback-alert" role="alert">{feedbackError}</div>}
      <CreatePage active={view === 'create'} paused={showSettings} sessionRef={createSession} favorites={favorites} rejected={rejected} references={tasteReferences} referenceError={tasteReferenceError} onReferencesChange={handleTasteReferencesChange} onFavorite={handleToggleFavorite} onRejected={handleToggleRejected} />
      {view === 'saved' && <SavedPage entries={savedEntries} undoName={savedRemoval?.name ?? null} onUndo={undoSavedRemoval} onDismissUndo={() => setSavedRemoval(null)} onRemoveSaved={handleRemoveSaved} onGoCreate={() => navigateView('create')} />}
      {view === 'lab' && <LabPage favorites={favorites} rejected={rejected} references={tasteReferences} referenceError={tasteReferenceError} onReferencesChange={handleTasteReferencesChange} onFavorite={handleToggleFavorite} onRejected={handleToggleRejected} />}
      {view === 'studio' && <AiStudio judgeConfig={judgeConfig} favorites={favorites} onToggleFavorite={handleToggleFavorite} onOpenSettings={() => setShowSettings(true)} />}
      {view === 'landing' && <Landing onEnter={() => navigateView('create')} />}
    </main>
    {showSettings && <SettingsModal config={judgeConfig} favorites={favorites} rejected={rejected} onSave={saveSettings} onUndoFavorite={handleUndoFavorite} onUndoRejected={handleUndoRejected} onClose={() => setShowSettings(false)} />}
  </div>
}
